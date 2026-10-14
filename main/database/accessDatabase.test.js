const fs = require('fs')
const os = require('os')
const path = require('path')
const { POWERSHELL_SCRIPT, 执行PowerShell请求, 规范请求, 提供者顺序, 创建Access数据库服务 } = require('./accessDatabase')

describe('Access 数据库兼容服务', () => {
  let 目录
  let 数据库路径

  beforeEach(() => {
    目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-access-test-'))
    数据库路径 = path.join(目录, '客户（华东）#1.mdb')
    fs.writeFileSync(数据库路径, '测试占位')
  })

  afterEach(() => fs.rmSync(目录, { recursive: true, force: true }))

  it('正式提供者链覆盖 Access 2003 MDB 和现代 ACCDB，不再宣称 2002 以前版本', () => {
    expect(提供者顺序('.mdb', 'inspect')).toEqual([
      'Microsoft.ACE.OLEDB.16.0',
      'Microsoft.ACE.OLEDB.12.0',
      'Microsoft.Jet.OLEDB.4.0',
    ])
    expect(提供者顺序('.accdb', 'inspect')).toEqual(['Microsoft.ACE.OLEDB.16.0', 'Microsoft.ACE.OLEDB.12.0'])
  })

  it('创建 ACCDB 时不使用会强制生成 Jet 4.0 MDB 的 Engine Type=5', () => {
    expect(POWERSHELL_SCRIPT).not.toContain('Jet OLEDB:Engine Type=5')
    expect(POWERSHELL_SCRIPT).toContain("$catalog.Create($connectionString)")
  })

  it('ACE 连接使用标准 Data Source 键，避免误报找不到可安装的 ISAM', () => {
    expect(POWERSHELL_SCRIPT).toContain("$builder['Data Source'] = [string]$Request.path")
    expect(POWERSHELL_SCRIPT).not.toContain('$builder.DataSource =')
  })

  it('通过临时脚本调用 PowerShell，避免 EncodedCommand 超过 Windows 32K 上限', async () => {
    const 临时目录 = path.join(目录, 'worker')
    fs.mkdirSync(临时目录)
    const 执行文件 = vi.fn(async (_程序, 参数, 选项) => {
      expect(参数).not.toContain('-EncodedCommand')
      const 脚本路径 = 参数[参数.indexOf('-File') + 1]
      const 请求路径 = 参数[参数.indexOf('-RequestPath') + 1]
      const 结果路径 = 参数[参数.indexOf('-ResultPath') + 1]
      const 脚本 = fs.readFileSync(脚本路径)
      expect([...脚本.subarray(0, 2)]).toEqual([0xff, 0xfe])
      expect(Buffer.from(POWERSHELL_SCRIPT, 'utf16le').toString('base64').length).toBeGreaterThan(32767)
      expect(脚本.length).toBeGreaterThan(29000)
      expect(JSON.parse(fs.readFileSync(请求路径, 'utf8'))).toEqual({ action: 'status' })
      expect(选项).not.toHaveProperty('env')
      fs.writeFileSync(结果路径, JSON.stringify({ success: true, data: { providers: ['Microsoft.ACE.OLEDB.16.0'] } }))
      return { 错误: null, stdout: '', stderr: '' }
    })
    const 结果 = await 执行PowerShell请求({ action: 'status' }, { 路径: 'powershell.exe', 位数: 64 }, {
      创建临时目录: async () => 临时目录,
      执行文件,
      删除目录: async () => {},
    })
    expect(结果).toMatchObject({ success: true, data: { providers: ['Microsoft.ACE.OLEDB.16.0'] } })
  })

  it('批量导入按精确属性名取值，兼容空格、括号和其他 Unicode 符号', () => {
    expect(POWERSHELL_SCRIPT).toContain('$row.psobject.Properties[[string]$names[$index]]')
    const 结果 = 规范请求('importRows', {
      路径: 数据库路径,
      表名: '订单（2026）',
      字段: ['客户 名称', '金额￥', '备注/标签'],
      记录: [{ '客户 名称': '海豹 🦭', '金额￥': 18.5, '备注/标签': '#首单' }],
    })
    expect(结果.请求.rows[0]).toMatchObject({ '客户 名称': '海豹 🦭', '金额￥': 18.5, '备注/标签': '#首单' })
  })

  it('中文、空格和常见符号路径通过 JSON 请求传递，SQL 参数不拼接到命令', () => {
    const 结果 = 规范请求('query', { 路径: 数据库路径, SQL: 'SELECT * FROM [客户 表] WHERE [姓名] = ?', 参数: ['张三 & 李四'] })
    expect(结果.请求).toMatchObject({ path: 数据库路径, sql: 'SELECT * FROM [客户 表] WHERE [姓名] = ?', parameters: ['张三 & 李四'] })
  })

  it('Access 2003 工作组安全参数使用真实 MDW 路径并原样传递凭据', () => {
    const 工作组 = path.join(目录, '部门 安全（旧版）.mdw')
    fs.writeFileSync(工作组, '测试占位')
    const 结果 = 规范请求('inspect', { 路径: 数据库路径, 工作组文件: 工作组, 用户名: '数据 管理员', 用户密码: '符号#密码' })
    expect(结果.请求).toMatchObject({ workgroupPath: 工作组, userName: '数据 管理员', userPassword: '符号#密码' })
    expect(() => 规范请求('inspect', { 路径: 数据库路径, 工作组文件: path.join(目录, '错误.txt') })).toThrow('绝对路径的 .mdw')
  })

  it('查询入口拒绝写入语句，更改入口允许显式执行', () => {
    expect(() => 规范请求('query', { 路径: 数据库路径, SQL: 'DELETE FROM [客户]' })).toThrow('只允许读取语句')
    expect(规范请求('execute', { 路径: 数据库路径, SQL: 'DELETE FROM [客户] WHERE [编号] = ?', 参数: [1] }).请求.action).toBe('execute')
  })

  it('字段名可包含 Unicode 和符号，危险控制字符会被拒绝', () => {
    const 结果 = 规范请求('insert', { 路径: 数据库路径, 表名: '订单-2026', 值: { '客户/名称': '海豹办公 🦭', '金额￥': 12.5 } })
    expect(结果.请求.values['客户/名称']).toBe('海豹办公 🦭')
    expect(() => 规范请求('insert', { 路径: 数据库路径, 表名: '坏\n表名', 值: { 编号: 1 } })).toThrow('表名无效')
  })

  it('依次探测 ACE 16、ACE 12 与 32 位 Jet，命中后返回真实提供者', async () => {
    const 运行 = vi.fn(async (请求, shell) => {
      if (请求.provider === 'Microsoft.Jet.OLEDB.4.0' && shell.位数 === 32) return { success: true, data: { tables: [], queries: [], relationships: [] }, provider: 请求.provider, bitness: 32 }
      return { success: false, error: 'provider is not registered' }
    })
    const 服务 = 创建Access数据库服务({ 平台: 'win32', 获取PowerShell候选: () => [{ 路径: 'x64', 位数: 64 }, { 路径: 'x86', 位数: 32 }], 运行 })
    const 结果 = await 服务.invoke('inspect', { 路径: 数据库路径 })
    expect(结果).toMatchObject({ 成功: true, 数据: { 提供者: 'Microsoft.Jet.OLEDB.4.0', 位数: 32 } })
    expect(运行).toHaveBeenCalledWith(expect.objectContaining({ provider: 'Microsoft.Jet.OLEDB.4.0' }), expect.objectContaining({ 位数: 32 }))
  })

  it('状态明确列出 2003 至 Microsoft 365，并将更早版本标为不支持', async () => {
    const 服务 = 创建Access数据库服务({
      平台: 'win32',
      获取PowerShell候选: () => [{ 路径: 'x64', 位数: 64 }],
      运行: async () => ({ success: true, data: { providers: ['Microsoft.ACE.OLEDB.16.0'], bitness: 64 } }),
    })
    const 结果 = await 服务.status()
    expect(结果.兼容范围.直接读写).toEqual(expect.arrayContaining(['Access 2003', 'Access 2024', 'Access for Microsoft 365']))
    expect(结果.兼容范围.直接读写).not.toContain('Access 2002/XP')
    expect(结果.兼容范围.不支持.join('')).toContain('Access 1.0–2002/XP')
  })

  it('非 Windows 平台不误报可编辑能力', async () => {
    const 服务 = 创建Access数据库服务({ 平台: 'linux' })
    expect(await 服务.status()).toMatchObject({ 成功: true, 可用: false, 平台支持: false })
    expect(await 服务.invoke('inspect', { 路径: 数据库路径 })).toMatchObject({ 成功: false, 错误: expect.stringContaining('Windows') })
  })
})
