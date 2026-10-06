// 演示生成与素材通道：提纲、页面、单页、美化建议、智能图形、文档提纲导入与本地素材库。
// 复用 14 上半建立的共用助手服务实例与安全存储，不建立第二套模型设置。
const path = require('path')
const { 检测能力 } = require('../ai/capabilities')
const { 创建素材库 } = require('../ppt/assets')
const {
  生成提纲, 生成页面, 生成单页, 生成美化建议, 生成智能图形, 摘要素材候选, 校验候选可应用,
} = require('../ppt/generation')
const { 读取提纲文件 } = require('../ppt/documentOutline')

const 单条素材字节上限 = 50 * 1024 * 1024

/** 注册演示生成与素材通道。 */
function 注册演示生成通道(ipcMain, { 助手服务, 服务存储, 素材库, 用户数据目录 } = {}) {
  if (!助手服务) throw new Error('演示生成通道需要已初始化的助手服务')
  const 库 = 素材库 || 创建素材库({ 根目录: path.join(用户数据目录 ?? process.cwd(), 'presentation-assets') })
  const 进行中 = new Map()
  const 包装 = (处理) => async (事件, ...参数) => {
    try { return { 成功: true, 数据: await 处理(事件, ...参数) } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '演示生成操作失败' } }
  }

  const 调用文本模型 = async ({ 系统提示, 用户内容, 推送 = () => {}, 信号 }) => {
    const 结果 = await 助手服务.对话({ 消息: [{ 角色: 'user', 内容: 用户内容 }] }, { 推送, 信号 })
    const 文本 = typeof 结果 === 'string' ? 结果 : 结果?.内容 ?? ''
    if (!文本.trim()) throw new Error('模型返回内容为空，无法继续处理')
    return 文本
  }

  const 需要文本能力 = async () => {
    const 文本配置 = await 助手服务.读取配置()
    const 服务配置 = 服务存储 ? { 语音: await 服务存储.读取?.('语音'), 识别: await 服务存储.读取?.('识别') } : {}
    const 能力 = 检测能力({ 文本配置, 服务配置 })
    if (能力.文本.状态 !== '可用') throw new Error(能力.文本.原因 ?? '请先配置模型服务')
    return 能力
  }

  const 取请求标识 = (事件, 输入) => {
    const 标识 = 输入?.请求标识
    if (typeof 标识 !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(标识)) throw new Error('演示生成请求标识无效')
    if (进行中.has(事件.sender.id)) throw new Error('请等待当前智能任务完成或停止后重试')
    进行中.set(事件.sender.id, { 标识 })
    return 标识
  }
  const 收尾 = (事件) => 进行中.delete(事件.sender.id)
  const 推送器 = (事件, 标识) => (片段) => { if (!事件.sender.isDestroyed()) 事件.sender.send('presentation.ai.stream', { 请求标识: 标识, ...片段 }) }

  /** 统一的生成入口：校验标识 → 校验能力 → 调用编排 → 收尾。 */
  const 生成 = (名称, 失败文案, 执行) => {
    ipcMain.handle(名称, async (事件, 输入) => {
      try {
        const 标识 = 取请求标识(事件, 输入)
        await 需要文本能力()
        const 数据 = await 执行({ 输入: 输入 ?? {}, 推送: 推送器(事件, 标识) })
        return { 成功: true, 数据 }
      } catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : 失败文案 } }
      finally { 收尾(事件) }
    })
  }

  生成('presentation.generate.outline', '提纲生成失败', ({ 输入, 推送 }) => 生成提纲({
    主题: 输入.主题, 受众: 输入.受众, 页数: 输入.页数, 风格: 输入.风格, 素材约束: 输入.素材约束,
    调用模型: 调用文本模型, 推送, 信号: 输入.信号,
  }))

  生成('presentation.generate.pages', '正文生成失败', ({ 输入, 推送 }) => 生成页面({
    提纲: 输入.提纲, 调用模型: 调用文本模型, 推送, 信号: 输入.信号,
  }))

  生成('presentation.generate.singlePage', '单页生成失败', ({ 输入, 推送 }) => 生成单页({
    内容: 输入.内容, 版式: 输入.版式, 调用模型: 调用文本模型, 推送, 信号: 输入.信号,
  }))

  生成('presentation.generate.beautify', '智能美化失败', ({ 输入, 推送 }) => 生成美化建议({
    页面列表: 输入.页面列表, 主题摘要: 输入.主题摘要, 调用模型: 调用文本模型, 推送, 信号: 输入.信号,
  }))

  生成('presentation.generate.diagram', '智能图形生成失败', ({ 输入, 推送 }) => 生成智能图形({
    主题: 输入.主题, 类型: 输入.类型, 调用模型: 调用文本模型, 推送, 信号: 输入.信号,
  }))

  生成('presentation.assets.semanticSearch', '素材检索失败', async ({ 输入, 推送 }) => {
    const 素材列表 = await 库.列出()
    return 摘要素材候选({ 查询: 输入.查询, 素材列表, 调用模型: 调用文本模型, 推送, 信号: 输入.信号 })
  })

  ipcMain.handle('presentation.generate.validateCandidates', 包装(async (_事件, 候选, 当前页面列表, 版本表) => 校验候选可应用(候选, 当前页面列表, 版本表)))

  ipcMain.handle('presentation.generate.readOutline', 包装(async (_事件, 输入) => {
    if (typeof 输入?.数据 !== 'string' || 输入.数据.length === 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(输入.数据)) {
      throw new Error('导入文件数据格式无效')
    }
    const 字节 = Buffer.from(输入.数据, 'base64')
    return 读取提纲文件({ 名称: 输入.名称, 字节 })
  }))

  ipcMain.handle('presentation.assets.list', 包装(async () => 库.列出()))
  ipcMain.handle('presentation.assets.search', 包装(async (_事件, 关键词) => 库.检索(关键词)))
  ipcMain.handle('presentation.assets.read', 包装(async (_事件, 标识) => ({ 数据: (await 库.读取(标识)).toString('base64') })))
  ipcMain.handle('presentation.assets.updateMeta', 包装(async (_事件, 标识, 修改) => 库.更新元数据(标识, 修改)))
  ipcMain.handle('presentation.assets.remove', 包装(async (_事件, 标识) => 库.删除(标识)))
  ipcMain.handle('presentation.assets.import', 包装(async (_事件, 输入) => {
    if (typeof 输入?.数据 !== 'string' || 输入.数据.length === 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(输入.数据)) {
      throw new Error('素材数据格式无效：需要 base64 编码')
    }
    const 字节 = Buffer.from(输入.数据, 'base64')
    if (字节.toString('base64') !== 输入.数据) throw new Error('素材数据编码无效')
    if (字节.length > 单条素材字节上限) throw new Error('素材过大：单项最多 50 MB')
    return 库.导入({ 字节, 类型: 输入.类型, 名称: 输入.名称, 分类: 输入.分类, 来源: 输入.来源, 授权: 输入.授权 })
  }))
}

module.exports = { 注册演示生成通道 }
