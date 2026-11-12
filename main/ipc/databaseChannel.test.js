const fs = require('fs')
const os = require('os')
const path = require('path')
const { 注册Access数据库通道, 检查目录可写, 允许操作 } = require('./databaseChannel')

const 文档目录 = path.join('C:\\Users', '测试 用户', 'Documents')

function 建环境({
  打开结果 = { canceled: false, filePaths: ['C:\\数据\\业务.accdb'] },
  保存结果 = { canceled: false, filePath: 'C:\\数据\\新库.accdb' },
  状态 = { 成功: true, 可用: true, 平台支持: true },
  调用实现,
  可写 = true,
} = {}) {
  const 处理 = new Map()
  const 数据库服务 = {
    status: vi.fn(async () => 状态),
    invoke: vi.fn(调用实现 ?? (async (操作, 输入) => ({ 成功: true, 数据: { 操作, 输入 } }))),
  }
  const 对话框 = { showOpenDialog: vi.fn(async () => 打开结果), showSaveDialog: vi.fn(async () => 保存结果) }
  const 目录检查 = vi.fn(async () => 可写)
  注册Access数据库通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, {
    数据库服务, 对话框, 取窗口: () => ({}), 取文档目录: () => 文档目录, 检查目录可写: 目录检查,
  })
  const 调用 = (名称, ...参数) => 处理.get(名称)({ sender: {} }, ...参数)
  return { 调用, 数据库服务, 对话框, 目录检查 }
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

describe('Access 新建链路（2.7.1 修复）', () => {
  it('保存对话框默认落在“文档”目录的完整路径，不再传裸文件名', async () => {
    const { 调用, 对话框 } = 建环境()
    await 调用('database.create', '新建数据库.accdb')
    const 默认路径 = 对话框.showSaveDialog.mock.calls[0][1].defaultPath
    expect(path.isAbsolute(默认路径)).toBe(true)
    expect(默认路径).toBe(path.join(文档目录, '新建数据库.accdb'))
  })

  it('默认名称缺扩展名时补 .accdb，含目录成分时只取文件名', async () => {
    const { 调用, 对话框 } = 建环境()
    await 调用('database.create', '..\\..\\客户 档案')
    expect(对话框.showSaveDialog.mock.calls[0][1].defaultPath).toBe(path.join(文档目录, '客户 档案.accdb'))
  })

  it('驱动不可用时直接返回“驱动未安装”，不弹出保存对话框', async () => {
    const { 调用, 对话框, 数据库服务 } = 建环境({ 状态: { 成功: true, 可用: false, 平台支持: true, 安装地址: 'https://support.microsoft.com/x' } })
    const 结果 = await 调用('database.create')
    expect(结果).toMatchObject({ 成功: false, 错误类别: '驱动未安装', 安装地址: 'https://support.microsoft.com/x' })
    expect(结果.错误).toContain('Access Runtime')
    expect(对话框.showSaveDialog).not.toHaveBeenCalled()
    expect(数据库服务.invoke).not.toHaveBeenCalled()
  })

  it('所选目录不可写时提示“目录不可写”，不调用引擎', async () => {
    const { 调用, 数据库服务 } = 建环境({ 可写: false })
    const 结果 = await 调用('database.create')
    expect(结果).toMatchObject({ 成功: false, 错误类别: '目录不可写', 路径: 'C:\\数据\\新库.accdb' })
    expect(结果.错误).not.toContain('打开失败')
    expect(数据库服务.invoke).not.toHaveBeenCalled()
  })

  it('创建成功后主进程立即回读结构，并把结构随结果返回', async () => {
    const 结构 = { tables: [], queries: [], relationships: [], 提供者: 'Microsoft.ACE.OLEDB.16.0' }
    const { 调用, 数据库服务 } = 建环境({ 调用实现: async (操作) => 操作 === 'inspect' ? { 成功: true, 数据: 结构 } : { 成功: true, 数据: {} } })
    const 结果 = await 调用('database.create')
    expect(数据库服务.invoke.mock.calls.map((项) => 项[0])).toEqual(['create', 'inspect'])
    expect(数据库服务.invoke).toHaveBeenLastCalledWith('inspect', { 路径: 'C:\\数据\\新库.accdb' })
    expect(结果).toEqual({ 成功: true, 路径: 'C:\\数据\\新库.accdb', 数据: 结构 })
  })

  it('文件已创建但回读失败时返回“已创建但无法打开”并附路径和分类原因', async () => {
    const { 调用 } = 建环境({ 调用实现: async (操作) => 操作 === 'inspect'
      ? { 成功: false, 错误类别: '文件损坏', 错误: '数据库文件已损坏或不是有效的 Access 文件，无法打开。', 详情: '不可识别的数据库格式' }
      : { 成功: true, 数据: {} } })
    const 结果 = await 调用('database.create')
    expect(结果).toMatchObject({
      成功: false, 已创建: true, 路径: 'C:\\数据\\新库.accdb', 错误类别: '文件损坏',
      错误: '数据库文件已创建但无法打开：C:\\数据\\新库.accdb',
      原因: '数据库文件已损坏或不是有效的 Access 文件，无法打开。',
      详情: '不可识别的数据库格式',
    })
  })

  it('创建失败时保留引擎分类结果并附上目标路径', async () => {
    const { 调用 } = 建环境({ 调用实现: async () => ({ 成功: false, 错误类别: '文件已存在', 错误: '目标位置已有同名数据库文件，请换一个文件名。' }) })
    expect(await 调用('database.create')).toMatchObject({ 成功: false, 错误类别: '文件已存在', 路径: 'C:\\数据\\新库.accdb' })
  })

  it('驱动确认可用后缓存结果，连续新建不重复探测引擎', async () => {
    const { 调用, 数据库服务 } = 建环境()
    await 调用('database.status')
    await 调用('database.create')
    await 调用('database.create')
    expect(数据库服务.status).toHaveBeenCalledTimes(1)
  })

  it('开放表结构修改操作 alterTable', async () => {
    expect(允许操作.has('alterTable')).toBe(true)
    const { 调用, 数据库服务 } = 建环境()
    await 调用('database.invoke', 'alterTable', { 操作: 'dropColumn' })
    expect(数据库服务.invoke).toHaveBeenCalledWith('alterTable', { 操作: 'dropColumn' })
  })
})

describe('目录可写检测', () => {
  it('可写目录返回 true 且不留下探测文件；不存在的目录返回 false', async () => {
    const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), "seal 目录's-"))
    try {
      expect(await 检查目录可写(目录)).toBe(true)
      expect(fs.readdirSync(目录)).toEqual([])
      expect(await 检查目录可写(path.join(目录, '不存在'))).toBe(false)
    } finally {
      fs.rmSync(目录, { recursive: true, force: true })
    }
  })
})
