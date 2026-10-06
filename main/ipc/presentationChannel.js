const { 创建资源存储 } = require('../ppt/resources')
const { 检查图片字节 } = require('../office/pptx/media')

function 注册演示通道(ipcMain, 资源存储 = 创建资源存储(), 服务 = {}) {
  const 执行 = (任务) => {
    try { return { 成功: true, ...任务() } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '演示资源操作失败' } }
  }
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
  ipcMain.handle('presentation.capture.sources', (_事件, 类型列表) => 执行异步(async () => 取录制服务().列出捕获源(类型列表)))
  ipcMain.handle('presentation.recording.save', (_事件, 数据, 格式, 建议名) => 执行异步(async () => 取录制服务().保存录制({ 数据, 格式, 建议名 })))
  ipcMain.handle('presentation.recording.support', () => 执行(() => 取录制服务().读取支持情况()))
  ipcMain.handle('presentation.recognition.status', () => 执行异步(async () => 取识别服务().读取状态()))
  ipcMain.handle('presentation.recognition.recognize', (_事件, 数据, 类型) => 执行异步(async () => 取识别服务().识别({ 数据, 类型 })))
}

module.exports = { 注册演示通道 }
