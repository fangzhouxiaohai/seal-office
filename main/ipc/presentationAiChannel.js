const path = require('path')
const { 创建服务配置存储, 服务种类列表 } = require('../ai/services')
const { 检测能力, 探测服务 } = require('../ai/capabilities')
const { 翻译条目, 校验译文可应用 } = require('../ppt/translate')
const { 语义校对, 校验建议可应用 } = require('../ppt/proofread')
const { 合成语音, 列出声线, 创建语音缓存 } = require('../ppt/speech')
const { 生成讲稿, 合成讲解音频 } = require('../ppt/narration')

/** 演示智能服务通道：翻译、语义校对、朗读、讲稿与能力核验。 */
function 注册演示智能通道(ipcMain, { 助手服务, 服务存储, 语音缓存, 用户数据目录 } = {}) {
  if (!助手服务) throw new Error('演示智能通道需要已初始化的助手服务')
  const 存储 = 服务存储 || 创建服务配置存储({ 配置路径: path.join(用户数据目录 ?? process.cwd(), 'presentation-services.secure'), 安全存储: require('electron').safeStorage })
  const 缓存 = 语音缓存 || 创建语音缓存({ 目录: path.join(用户数据目录 ?? process.cwd(), 'presentation-speech-cache') })
  const 进行中 = new Map()
  const 包装 = (处理) => async (事件, ...参数) => {
    try { return { 成功: true, 数据: await 处理(事件, ...参数) } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '演示智能服务操作失败' } }
  }

  /** 文本能力：统一走助手服务的文本链路，不另建第二套模型设置。 */
  const 调用文本模型 = async ({ 系统提示, 用户内容, 推送 = () => {}, 信号 }) => {
    const 结果 = await 助手服务.对话({ 消息: [{ 角色: 'user', 内容: 用户内容 }] }, { 推送, 信号 })
    const 文本 = typeof 结果 === 'string' ? 结果 : 结果?.内容 ?? ''
    if (!文本.trim()) throw new Error('模型返回内容为空，无法继续处理')
    return 文本
  }

  const 需要文本能力 = async () => {
    const 文本配置 = await 助手服务.读取配置()
    const 能力 = 检测能力({ 文本配置, 服务配置: { 语音: await 存储.读取('语音'), 识别: await 存储.读取('识别') } })
    if (能力.文本.状态 !== '可用') throw new Error(能力.文本.原因 ?? '请先配置模型服务')
    return 能力
  }

  ipcMain.handle('presentation.ai.capabilities', 包装(async () => {
    const 文本配置 = await 助手服务.读取配置()
    const 服务配置 = { 语音: await 存储.读取('语音'), 识别: await 存储.读取('识别') }
    return 检测能力({ 文本配置, 服务配置 })
  }))
  ipcMain.handle('presentation.ai.getService', 包装((_事件, 种类) => 存储.读取(种类)))
  ipcMain.handle('presentation.ai.saveService', 包装((_事件, 种类, 配置) => 存储.保存(种类, 配置)))
  ipcMain.handle('presentation.ai.clearService', 包装(async (_事件, 种类) => { await 存储.清除(种类); return {} }))
  ipcMain.handle('presentation.ai.listServiceKinds', 包装(async () => 服务种类列表))
  ipcMain.handle('presentation.ai.migrateLegacyTranslate', 包装((_事件, 旧配置) => 存储.迁移翻译配置(旧配置)))
  ipcMain.handle('presentation.ai.probeService', 包装((_事件, 种类, 配置) => 探测服务(种类 === '翻译' ? { ...配置, 密钥: 存储.读取内部密钥('翻译') || 配置?.密钥 } : { ...配置, 密钥: 存储.读取内部密钥(种类) || 配置?.密钥 })))

  const 取请求标识 = (事件, 输入) => {
    const 标识 = 输入?.请求标识
    if (typeof 标识 !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(标识)) throw new Error('演示智能请求标识无效')
    if (进行中.has(事件.sender.id)) throw new Error('请等待当前智能任务完成或停止后重试')
    进行中.set(事件.sender.id, { 标识 })
    return 标识
  }
  const 收尾 = (事件) => 进行中.delete(事件.sender.id)
  const 推送器 = (事件, 标识) => (片段) => { if (!事件.sender.isDestroyed()) 事件.sender.send('presentation.ai.stream', { 请求标识: 标识, ...片段 }) }

  ipcMain.handle('presentation.ai.translate', async (事件, 输入) => {
    try {
      const 标识 = 取请求标识(事件, 输入)
      await 需要文本能力()
      const 结果 = await 翻译条目({
        条目: 输入.条目, 目标语言: 输入.目标语言, 术语表: 输入.术语表,
        每批条数: 输入.每批条数, 每批字符: 输入.每批字符,
        调用模型: 调用文本模型, 推送: 推送器(事件, 标识), 信号: 输入.信号,
      })
      return { 成功: true, 数据: 结果 }
    } catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '翻译失败' } }
    finally { 收尾(事件) }
  })

  ipcMain.handle('presentation.ai.proofread', async (事件, 输入) => {
    try {
      const 标识 = 取请求标识(事件, 输入)
      await 需要文本能力()
      const 结果 = await 语义校对({
        条目: 输入.条目, 每批条数: 输入.每批条数, 每批字符: 输入.每批字符,
        调用模型: 调用文本模型, 推送: 推送器(事件, 标识), 信号: 输入.信号,
      })
      return { 成功: true, 数据: 结果 }
    } catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '语义校对失败' } }
    finally { 收尾(事件) }
  })

  ipcMain.handle('presentation.ai.validateTranslation', 包装(async (_事件, 候选, 当前条目) => 校验译文可应用(候选, 当前条目)))
  ipcMain.handle('presentation.ai.validateSuggestion', 包装(async (_事件, 建议, 当前条目) => 校验建议可应用(建议, 当前条目)))

  ipcMain.handle('presentation.ai.voices', 包装(async () => {
    const 配置 = await 存储.读取('语音')
    const 完整 = 配置 ? { ...配置, 密钥: 存储.读取内部密钥('语音') } : null
    const 结果 = await 列出声线({ 配置: 完整 })
    if (!结果.成功) throw new Error(结果.原因)
    return 结果.声线
  }))

  ipcMain.handle('presentation.ai.speak', async (事件, 输入) => {
    try {
      const 配置 = await 存储.读取('语音')
      if (!配置) throw new Error('请先配置 AI 语音合成服务')
      const 结果 = await 合成语音(输入?.文本, { 配置: { ...配置, 密钥: 存储.读取内部密钥('语音') }, 缓存, 信号: 输入?.信号 })
      return { 成功: true, 数据: { 音频: 结果.音频, 类型: 结果.类型, 字节数: 结果.字节数, 命中缓存: 结果.命中缓存, 缓存键: 结果.缓存键 } }
    } catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '语音合成失败' } }
  })

  ipcMain.handle('presentation.ai.generateScript', async (事件, 输入) => {
    try {
      const 标识 = 取请求标识(事件, 输入)
      await 需要文本能力()
      const 结果 = await 生成讲稿({ 页列表: 输入.页列表, 风格: 输入.风格, 调用模型: 调用文本模型, 推送: 推送器(事件, 标识), 信号: 输入.信号 })
      return { 成功: true, 数据: 结果 }
    } catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '讲稿生成失败' } }
    finally { 收尾(事件) }
  })

  ipcMain.handle('presentation.ai.narrate', async (事件, 输入) => {
    try {
      const 配置 = await 存储.读取('语音')
      const 结果 = await 合成讲解音频({
        讲稿: 输入?.讲稿, 语音配置: 配置 ? { ...配置, 密钥: 存储.读取内部密钥('语音') } : null,
        缓存, 信号: 输入?.信号, 推送: (片段) => { if (!事件.sender.isDestroyed()) 事件.sender.send('presentation.ai.stream', { 请求标识: 输入?.请求标识 ?? '', ...片段 }) },
      })
      return { 成功: true, 数据: 结果 }
    } catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '讲解音频合成失败' } }
  })

  ipcMain.handle('presentation.ai.clearAudioCache', 包装(async () => { await 缓存.清除(); return {} }))
}

module.exports = { 注册演示智能通道 }
