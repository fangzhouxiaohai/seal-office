const fs = require('fs')
const os = require('os')
const path = require('path')
const { 创建默认程序服务, 获取关联程序路径 } = require('./defaultApps')

describe('便携版默认程序路径', () => {
  it('打包便携版使用原始启动文件，避免注册临时解包目录', () => {
    expect(获取关联程序路径(true, 'C:\\临时\\SealOffice.exe', { PORTABLE_EXECUTABLE_FILE: 'D:\\办公工具\\SealOffice 1.7.1.exe' })).toBe('D:\\办公工具\\SealOffice 1.7.1.exe')
  })
  it('安装版与开发版继续使用当前程序路径', () => {
    expect(获取关联程序路径(true, 'C:\\程序\\SealOffice.exe', {})).toBe('C:\\程序\\SealOffice.exe')
    expect(获取关联程序路径(false, 'C:\\electron.exe', { PORTABLE_EXECUTABLE_FILE: 'D:\\SealOffice.exe' })).toBe('C:\\electron.exe')
  })
  it('便携启动标识无效时明确报错，不回退到临时路径', () => {
    expect(() => 获取关联程序路径(true, 'C:\\临时\\SealOffice.exe', { PORTABLE_EXECUTABLE_FILE: '相对路径.exe' })).toThrow('便携版启动文件路径无效')
  })
})

describe('默认程序注册执行链路', () => {
  async function 拦截注册(执行) {
    const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-registration-'))
    const 资源目录 = path.join(目录, '解包 资源'), 数据目录 = path.join(目录, '持久 数据')
    fs.mkdirSync(path.join(资源目录, 'shell-integration'), { recursive: true })
    fs.copyFileSync(path.join(__dirname, 'shellIntegration.ps1'), path.join(资源目录, 'shell-integration', 'shellIntegration.ps1'))
    fs.cpSync(path.join(__dirname, 'file-icons'), path.join(资源目录, 'file-icons'), { recursive: true })
    const 子进程 = require('child_process'), 原执行 = 子进程.execFile
    const 模块路径 = require.resolve('./defaultApps'), 原模块 = require.cache[模块路径]
    const 调用 = vi.fn((_程序, _参数, _选项, 回调) => 回调(null, '{"成功":true}', ''))
    子进程.execFile = 调用
    delete require.cache[模块路径]
    try {
      const 注册 = require('./defaultApps').创建注册执行器({ 可执行文件: 'E:\\办公工具\\海豹办公.exe', 资源目录, 数据目录, 便携版: true })
      await 执行({ 注册, 调用, 资源目录, 数据目录 })
    } finally {
      子进程.execFile = 原执行
      require.cache[模块路径] = 原模块
      fs.rmSync(目录, { recursive: true, force: true })
    }
  }
  it('真实执行器先持久保存图标，再通过独立参数交给系统注册脚本', async () => {
    await 拦截注册(async ({ 注册, 调用, 数据目录 }) => {
      expect(await 注册('RegisterApplication')).toEqual({ 成功: true })
      const [程序, 参数, 选项] = 调用.mock.calls[0]
      expect(程序).toContain('powershell.exe')
      expect(选项.windowsHide).toBe(true)
      const 图标目录 = 参数[参数.indexOf('-Icons') + 1]
      expect(图标目录).toBe(path.join(数据目录, 'file-icons'))
      expect(fs.existsSync(path.join(图标目录, 'word.ico'))).toBe(true)
      expect(参数[参数.indexOf('-ExecutableFile') + 1]).toBe('E:\\办公工具\\海豹办公.exe')
    })
  })
  it('资源损坏时真实执行器不会启动注册进程', async () => {
    await 拦截注册(async ({ 注册, 调用, 资源目录 }) => {
      fs.writeFileSync(path.join(资源目录, 'file-icons', 'pdf.ico'), '被修改')
      await expect(注册('RegisterApplication')).rejects.toThrow('PDF文件图标已缺失或修改')
      expect(调用).not.toHaveBeenCalled()
    })
  })
  it('全自动关联同样准备图标，并支持把写入限制在测试根内', async () => {
    await 拦截注册(async ({ 调用, 资源目录, 数据目录 }) => {
      const 注册 = require('./defaultApps').创建注册执行器({ 可执行文件: 'E:\\办公工具\\海豹办公.exe', 资源目录, 数据目录, 测试根: 'Software\\SealOfficeIntegrationTests\\11111111-2222-3333-4444-555555555555' })
      await 注册('ApplyDefaults')
      const 参数 = 调用.mock.calls.at(-1)[1]
      expect(参数[参数.indexOf('-Action') + 1]).toBe('ApplyDefaults')
      const 图标目录 = 参数[参数.indexOf('-Icons') + 1]
      expect(图标目录.endsWith('file-icons')).toBe(true)
      expect(fs.existsSync(path.join(图标目录, 'word.ico'))).toBe(true)
      expect(参数[参数.indexOf('-TestRoot') + 1]).toBe('Software\\SealOfficeIntegrationTests\\11111111-2222-3333-4444-555555555555')
    })
  })
})

describe('默认程序与安装后首次提醒', () => {
  let 目录, 调用, 系统打开, 服务, 安装, 默认
  beforeEach(() => {
    目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-default-'))
    安装 = { 已安装: true, 安装标识: '首次安装', 可执行文件: 'C:\\海豹办公\\SealOffice.exe' }
    默认 = false
    系统打开 = vi.fn().mockResolvedValue(undefined)
    调用 = vi.fn(async (操作) => {
      if (操作 === 'GetInstallation') return 安装
      if (操作 === 'InspectDefaults') return { 已全部默认: 默认, 格式: 全部格式(默认) }
      if (操作 === 'ApplyDefaults') { 默认 = true; return { 已全部默认: true, 清除用户选择的格式: [], 格式: 全部格式(true) } }
      return { 成功: true }
    })
    服务 = 创建默认程序服务({ 平台: 'win32', 已打包: true, 可执行文件: 安装.可执行文件, 数据目录: 目录, 执行注册: 调用, 打开地址: 系统打开 })
  })
  /** 按扩展名构造系统回读结果 */
  function 全部格式(已默认) {
    return ['docx', 'xlsx', 'pptx', 'pdf'].map((扩展名) => ({ 扩展名, 默认程序: 已默认 ? 安装.可执行文件 : 'C:\\别的程序.exe', 已默认 }))
  }
  afterEach(() => { fs.rmSync(目录, { recursive: true, force: true }) })

  it('注册打开能力并返回系统已生效的关联结果', async () => {
    const 结果 = await 服务.应用默认程序()
    expect(结果).toMatchObject({ 成功: true, 已全部默认: true, 未生效: [], 清除用户选择的格式: [] })
    expect(调用).toHaveBeenCalledWith('ApplyDefaults')
    expect(系统打开).not.toHaveBeenCalled()
  })

  it('系统仍拦下部分格式时如实列出未生效的扩展名', async () => {
    调用.mockImplementation(async (操作) => 操作 === 'ApplyDefaults'
      ? { 已全部默认: false, 格式: 全部格式(false).map((项, 下标) => 下标 === 0 ? { ...项, 扩展名: 'docx' } : { ...项, 已默认: true, 默认程序: 安装.可执行文件 }) }
      : { 成功: true })
    const 结果 = await 服务.应用默认程序()
    expect(结果.已全部默认).toBe(false)
    expect(结果.未生效).toEqual(['docx'])
  })

  it('设置默认程序优先注册并回读，全部生效时不再打开系统页面', async () => {
    const 结果 = await 服务.设置默认程序()
    expect(结果).toMatchObject({ 成功: true, 已全部默认: true })
    expect(结果.提示).toContain('DOCX')
    expect(系统打开).not.toHaveBeenCalled()
  })

  it('自动关联未全部生效时才打开系统页面兜底并列出剩余格式', async () => {
    调用.mockImplementation(async (操作) => 操作 === 'ApplyDefaults'
      ? { 已全部默认: false, 格式: [{ 扩展名: 'pdf', 默认程序: '', 已默认: false }, { 扩展名: 'docx', 默认程序: 安装.可执行文件, 已默认: true }] }
      : { 成功: true })
    const 结果 = await 服务.设置默认程序()
    expect(结果).toMatchObject({ 成功: true, 已全部默认: false, 未生效: ['pdf'] })
    expect(结果.提示).toContain('.pdf')
    expect(系统打开).toHaveBeenCalledWith('ms-settings:defaultapps?registeredAppUser=SealOffice')
  })

  it('应用专属系统页面不支持时退回默认应用列表', async () => {
    调用.mockImplementation(async () => ({ 已全部默认: false, 格式: 全部格式(false) }))
    系统打开.mockRejectedValueOnce(new Error('应用专属地址不支持')).mockResolvedValueOnce(undefined)
    expect(await 服务.设置默认程序()).toMatchObject({ 成功: true, 已全部默认: false })
    expect(系统打开.mock.calls.map(([地址]) => 地址)).toEqual(['ms-settings:defaultapps?registeredAppUser=SealOffice', 'ms-settings:defaultapps'])
  })

  it('两个系统页面都打不开时给出可执行的手动路径，不误报已默认', async () => {
    调用.mockImplementation(async () => ({ 已全部默认: false, 格式: 全部格式(false) }))
    系统打开.mockRejectedValue(new Error('系统设置不可用'))
    await expect(服务.设置默认程序()).rejects.toThrow('海豹办公已注册，但 Windows 默认应用页面未能打开')
  })

  it('启动检查：已经是默认程序时不改写系统状态', async () => {
    默认 = true
    const 结果 = await 服务.启动检查默认程序()
    expect(结果).toMatchObject({ 成功: true, 已全部默认: true, 已处理: false })
    expect(调用).not.toHaveBeenCalledWith('ApplyDefaults')
  })

  it('启动检查：不是默认程序时只查询并列出格式', async () => {
    const 结果 = await 服务.启动检查默认程序()
    expect(结果).toMatchObject({ 成功: true, 已全部默认: false, 已处理: false })
    expect(调用).not.toHaveBeenCalledWith('ApplyDefaults')
    expect(系统打开).not.toHaveBeenCalled()
  })

  it('启动检查：系统仍拦下时回报未生效清单', async () => {
    调用.mockImplementation(async (操作) => 操作 === 'InspectDefaults'
      ? { 已全部默认: false, 格式: 全部格式(false) }
      : { 已全部默认: false, 格式: 全部格式(false) })
    const 结果 = await 服务.启动检查默认程序()
    expect(结果).toMatchObject({ 成功: true, 已全部默认: false, 已处理: false })
    expect(结果.未生效).toEqual(['docx', 'xlsx', 'pptx', 'pdf'])
  })

  it('开发版与打包版之外不检查默认程序', async () => {
    const 开发服务 = 创建默认程序服务({ 平台: 'win32', 已打包: false, 可执行文件: 安装.可执行文件, 数据目录: 目录, 执行注册: 调用, 打开地址: 系统打开 })
    expect(await 开发服务.启动检查默认程序()).toMatchObject({ 成功: true, 已处理: false })
    const 其他平台 = 创建默认程序服务({ 平台: 'darwin', 已打包: true, 可执行文件: 安装.可执行文件, 数据目录: 目录, 执行注册: 调用, 打开地址: 系统打开 })
    expect(await 其他平台.启动检查默认程序()).toMatchObject({ 成功: true, 已处理: false })
    await expect(开发服务.应用默认程序()).rejects.toThrow('请使用 Windows 打包版本')
  })

  it('首次非默认才询问，后续启动不再检查默认状态', async () => {
    expect(await 服务.检查首次提示()).toMatchObject({ 成功: true, 需要询问: true })
    expect(await 服务.检查首次提示()).toMatchObject({ 成功: true, 需要询问: false })
    expect(调用.mock.calls.filter(([操作]) => 操作 === 'InspectDefaults')).toHaveLength(1)
    const 新服务 = 创建默认程序服务({ 平台: 'win32', 已打包: true, 可执行文件: 安装.可执行文件, 数据目录: 目录, 执行注册: 调用, 打开地址: 系统打开 })
    expect(await 新服务.检查首次提示()).toMatchObject({ 需要询问: false })
  })
  it('已经全部默认时不显示首次询问', async () => {
    默认 = true
    expect(await 服务.检查首次提示()).toMatchObject({ 需要询问: false })
  })
  it('升级保留安装标识，重新安装的新标识重新检查一次', async () => {
    await 服务.检查首次提示()
    expect(await 服务.检查首次提示()).toMatchObject({ 需要询问: false })
    安装.安装标识 = '重新安装'
    expect(await 服务.检查首次提示()).toMatchObject({ 需要询问: true })
  })
  it('开发版、便携版及不同路径副本不触发安装询问', async () => {
    安装.已安装 = false
    expect(await 服务.检查首次提示()).toMatchObject({ 需要询问: false })
    安装.已安装 = true; 安装.可执行文件 = 'C:\\别的目录\\SealOffice.exe'
    expect(await 服务.检查首次提示()).toMatchObject({ 需要询问: false })
    expect(调用.mock.calls.some(([操作]) => 操作 === 'InspectDefaults')).toBe(false)
  })
  it('默认状态核验失败后不会再次启动反复弹窗', async () => {
    调用.mockImplementation(async 操作 => { if (操作 === 'GetInstallation') return 安装; throw new Error('关联查询失败') })
    await expect(服务.检查首次提示()).rejects.toThrow('关联查询失败')
    expect(await 服务.检查首次提示()).toMatchObject({ 需要询问: false })
  })
  it('并发首次检查只有一次能领取询问', async () => {
    const 结果 = await Promise.all([服务.检查首次提示(), 服务.检查首次提示()])
    expect(结果.filter(项 => 项.需要询问)).toHaveLength(1)
  })
})
