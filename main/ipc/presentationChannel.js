const { 创建资源存储 } = require('../ppt/resources')
const { 检查图片字节 } = require('../office/pptx/media')
const { 导出演示, 选择导出目录 } = require('../ppt/export')
const { 读取pptx } = require('../office/pptxCodec')
const { 比较演示文稿 } = require('../office/pptx/compare')
const { 创建文稿会话服务 } = require('../ppt/session')
const { 批量检查 } = require('../ppt/batch')
const fs = require('fs')

function 注册演示通道(ipcMain, 资源存储 = 创建资源存储(), 服务 = {}) {
  const 会话 = 服务.会话 ?? 创建文稿会话服务()
  const 广播 = 服务.广播 ?? (() => {})
  const 执行 = (任务) => {
    try { return { 成功: true, ...任务() } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '演示资源操作失败' } }
  }
  /** 任务自带「成功」字段的异步包装 */
  const 异步执行 = async (任务) => {
    try { return await 任务() }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '演示操作失败' } }
  }
  const 读取演示文稿文件 = async (路径, 标签) => {
    if (typeof 路径 !== 'string' || 路径.trim().length === 0) throw new Error(`请选择有效的${标签}文件路径`)
    let 字节
    try { 字节 = await fs.promises.readFile(路径) }
    catch (错误) { throw new Error(`无法读取${标签}文件：${错误 instanceof Error ? 错误.message : '未知原因'}`) }
    return await 读取pptx(字节)
  }
  /** 文档比对：只读取两份文件，不写入、不修改被比较文件。 */
  ipcMain.handle('presentation.compareFiles', (_事件, 左路径, 右路径) => 异步执行(async () => {
    const 左 = await 读取演示文稿文件(左路径, '左侧')
    const 右 = await 读取演示文稿文件(右路径, '右侧')
    const 结果 = 比较演示文稿(左.演示文稿, 右.演示文稿)
    return {
      成功: true, 汇总: 结果.汇总, 页面: 结果.页面,
      ...(结果.批注 ? { 批注: 结果.批注 } : {}),
      警告: { 左: 左.警告 ?? [], 右: 右.警告 ?? [] },
    }
  }))
  /** 只返回载荷的异步包装：由包装器补齐「成功」字段 */
  const 执行异步 = async (任务) => {
    try { return { 成功: true, ...(await 任务()) } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '演示操作失败' } }
  }
  const 取录制服务 = () => {
    if (!服务.录制服务) throw new Error('当前环境不支持录屏：请使用 Windows 桌面版')
    return 服务.录制服务
  }
  const 取识别服务 = () => {
    if (!服务.识别服务) throw new Error('当前环境不支持文字识别：识别服务未接入')
    return 服务.识别服务
  }
  ipcMain.handle('presentation.resource.add', (_事件, 数据, 类型) => 执行(() => {
    if (typeof 数据 !== 'string' || 数据.length === 0 || 数据.length > 70 * 1024 * 1024 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(数据)) {
      throw new Error('演示资源数据格式或大小无效')
    }
    const 字节 = Buffer.from(数据, 'base64')
    if (字节.toString('base64') !== 数据) throw new Error('演示资源数据编码无效')
    if (typeof 类型 === 'string' && 类型.startsWith('image/')) 检查图片字节(字节, 类型)
    const 标识 = 资源存储.加入(字节, 类型)
    return { 标识, 字节数: 字节.length, 类型 }
  }))
  ipcMain.handle('presentation.resource.read', (_事件, 标识) => 执行(() => ({ 数据: 资源存储.读取(标识).toString('base64') })))
  ipcMain.handle('presentation.resource.dropTemporary', (_事件, 标识) => 执行(() => {
    资源存储.解除引用(标识)
    return {}
  }))
  ipcMain.handle('presentation.resource.sync', (_事件, 快照标识, 引用标识列表) => 执行(() => {
    资源存储.同步快照(快照标识, 引用标识列表)
    return {}
  }))
  ipcMain.handle('presentation.resource.release', (_事件, 快照标识) => 执行(() => {
    资源存储.释放快照(快照标识)
    return {}
  }))
  ipcMain.handle('presentation.resource.export', (_事件, 标识列表) => 执行(() => ({ 条目: 资源存储.导出(标识列表) })))
  ipcMain.handle('presentation.resource.restore', (_事件, 条目列表) => 执行(() => {
    资源存储.恢复(条目列表)
    return {}
  }))
  // 导出：栅格化与写盘都在主进程完成，写盘成功后才返回真实文件列表
  ipcMain.handle('presentation.export.run', (_事件, 请求) => 异步执行(() => 导出演示(请求)))
  ipcMain.handle('presentation.export.pickDirectory', () => 异步执行(async () => {
    const 目录 = await 选择导出目录()
    return 目录 ? { 成功: true, 目录 } : { 成功: false, 已取消: true }
  }))
  // 截屏、录屏与文字识别：服务缺失时给出真实原因
  ipcMain.handle('presentation.capture.sources', (_事件, 类型列表) => 执行异步(async () => 取录制服务().列出捕获源(类型列表)))
  ipcMain.handle('presentation.recording.save', (_事件, 数据, 格式, 建议名) => 执行异步(async () => 取录制服务().保存录制({ 数据, 格式, 建议名 })))
  ipcMain.handle('presentation.recording.support', () => 执行(() => 取录制服务().读取支持情况()))
  ipcMain.handle('presentation.recognition.status', () => 执行异步(async () => 取识别服务().读取状态()))
  ipcMain.handle('presentation.recognition.recognize', (_事件, 数据, 类型) => 执行异步(async () => 取识别服务().识别({ 数据, 类型 })))

  // 文稿会话：同文件多个编辑窗口共享内容、版本与保存结果
  ipcMain.handle('presentation.session.register', (_事件, 文稿标识, 视图标识, 初始内容, 路径) => 异步执行(async () => {
    const 注册 = 会话.注册视图(文稿标识, 视图标识, 初始内容, 路径)
    广播(文稿标识, { 类型: '会话变更', 版本: 注册.版本, 内容: 注册.内容 }, 视图标识)
    return { 成功: true, ...注册 }
  }))
  ipcMain.handle('presentation.session.read', (_事件, 文稿标识) => 异步执行(async () => ({ ...会话.读取(文稿标识) })))
  ipcMain.handle('presentation.session.commit', (_事件, 文稿标识, 期望版本, 内容, 视图标识) => 异步执行(async () => {
    const 提交 = 会话.提交修改(文稿标识, 期望版本, 内容)
    if (提交.成功) 广播(文稿标识, { 类型: '会话变更', 版本: 提交.版本, 内容 }, 视图标识)
    return 提交
  }))
  ipcMain.handle('presentation.session.saved', (_事件, 文稿标识, 路径, 视图标识) => 异步执行(async () => {
    const 保存 = 会话.标记已保存(文稿标识, 路径)
    if (保存.成功) 广播(文稿标识, { 类型: '已保存', 版本: 保存.版本, 路径: 保存.路径 }, 视图标识)
    return 保存
  }))
  ipcMain.handle('presentation.session.claimPath', (_事件, 文稿标识, 路径) => 异步执行(async () => ({ ...会话.认领路径(文稿标识, 路径) })))
  ipcMain.handle('presentation.session.releasePath', (_事件, 文稿标识, 路径) => 异步执行(async () => ({ ...会话.释放路径(文稿标识, 路径) })))
  ipcMain.handle('presentation.session.unregister', (_事件, 文稿标识, 视图标识) => 异步执行(async () => ({ ...会话.注销视图(文稿标识, 视图标识) })))

  // 批量工具：逐文件独立结果，失败不撤销其他文件
  ipcMain.handle('presentation.batchCheck', (_事件, 任务列表) => 异步执行(async () => ({ 成功: true, ...(await 批量检查(任务列表)) })))
}

module.exports = { 注册演示通道 }
