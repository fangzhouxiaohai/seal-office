const { 注册Access数据库通道 } = require('./databaseChannel')

function 建环境({ 打开结果 = { canceled: false, filePaths: ['C:\\数据\\业务.accdb'] }, 保存结果 = { canceled: false, filePath: 'C:\\数据\\新库.accdb' } } = {}) {
  const 处理 = new Map()
  const 数据库服务 = { status: vi.fn(async () => ({ 成功: true, 可用: true })), invoke: vi.fn(async (操作, 输入) => ({ 成功: true, 数据: { 操作, 输入 } })) }
  const 对话框 = { showOpenDialog: vi.fn(async () => 打开结果), showSaveDialog: vi.fn(async () => 保存结果) }
  注册Access数据库通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, { 数据库服务, 对话框, 取窗口: () => ({}) })
  const 调用 = (名称, ...参数) => 处理.get(名称)({ sender: {} }, ...参数)
  return { 调用, 数据库服务, 对话框 }
}

describe('Access 数据库 IPC 通道', () => {
  it('打开对话框只提供 MDB/ACCDB 并返回路径', async () => {
    const { 调用, 对话框 } = 建环境()
    expect(await 调用('database.pick')).toEqual({ 成功: true, 路径: 'C:\\数据\\业务.accdb' })
    const 配置 = 对话框.showOpenDialog.mock.calls[0][1]
    expect(配置.filters.flatMap((项) => 项.extensions)).toEqual(expect.arrayContaining(['mdb', 'accdb']))
  })

  it('新建数据库固定 ACCDB 并经服务创建', async () => {
    const { 调用, 数据库服务 } = 建环境({ 保存结果: { canceled: false, filePath: 'C:\\数据\\业务库' } })
    const 结果 = await 调用('database.create', '业务库')
    expect(结果).toMatchObject({ 成功: true, 路径: 'C:\\数据\\业务库.accdb' })
    expect(数据库服务.invoke).toHaveBeenCalledWith('create', { 路径: 'C:\\数据\\业务库.accdb' })
  })

  it('拒绝渲染进程调用未开放操作', async () => {
    const { 调用, 数据库服务 } = 建环境()
    expect(await 调用('database.invoke', 'runPowerShell', {})).toEqual({ 成功: false, 错误: '不支持的 Access 数据库操作' })
    expect(数据库服务.invoke).not.toHaveBeenCalled()
  })
})
