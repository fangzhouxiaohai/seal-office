const { 创建资源存储 } = require('../ppt/resources')
const { 检查图片字节 } = require('../office/pptx/media')
const { 读取pptx } = require('../office/pptxCodec')
const { 比较演示文稿 } = require('../office/pptx/compare')
const fs = require('fs')

function 注册演示通道(ipcMain, 资源存储 = 创建资源存储()) {
  const 执行 = (任务) => {
    try { return { 成功: true, ...任务() } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '演示资源操作失败' } }
  }
  const 异步执行 = async (任务) => {
    try { return { 成功: true, ...(await 任务()) } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '演示资源操作失败' } }
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
    return { 汇总: 结果.汇总, 页面: 结果.页面, 警告: { 左: 左.警告 ?? [], 右: 右.警告 ?? [] } }
  }))
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
}

module.exports = { 注册演示通道 }
