const { 提取关联路径, 创建关联文件入口 } = require('../fileAssociation')
const { 创建Linux默认程序服务, 桌面文件 } = require('./defaultApps')
const { MIME类型 } = require('./mimeTypes')
describe('Ubuntu 文件打开与关联', () => {
  it('Ubuntu LTS 转换过滤器兼容旧引擎，Windows 保留现有过滤器', () => {
    const { 选择兼容过滤器 } = require('../office/nativeRuntime')
    for (const [当前, LTS] of [
      ['Office Open XML Text Template', 'MS Word 2007 XML Template'],
      ['Calc Office Open XML Template', 'Calc MS Excel 2007 XML Template'],
      ['Impress Office Open XML Template', 'Impress MS PowerPoint 2007 XML Template'],
      ['Impress Office Open XML AutoPlay', 'Impress MS PowerPoint 2007 XML AutoPlay'],
    ]) {
      expect(选择兼容过滤器(当前, 'linux')).toBe(LTS)
      expect(选择兼容过滤器(当前, 'win32')).toBe(当前)
    }
    expect(选择兼容过滤器('writer8', 'linux')).toBe('writer8')
  })
  it('保留中文、空格和大小写不同的 Linux 文档，忽略参数、相对路径及 WPS 文件', async () => {
    const 文件 = ['/home/a/中文 文件.csv', '/home/a/REPORT.docx', '/home/a/report.docx']
    expect(提取关联路径([...文件, '--no-sandbox', 'relative.xls', '/home/a/a.wps'], 'linux')).toEqual(文件)
    const sender = { send: vi.fn() }, 通道 = new Map()
    const 入口 = 创建关联文件入口(() => ({ webContents: sender }), 'linux')
    入口.注册读取通道({ handle: (名, 函数) => 通道.set(名, 函数) })
    expect(入口.加入命令行([...文件, 文件[0]])).toBe(3)
    expect(await 通道.get('file.association.takePending')({ sender })).toEqual({ 成功: true, 路径列表: 文件 })
  })
  it('启动只查询，手动操作后核验实际默认应用', async () => {
    const 默认 = new Map(), 执行 = vi.fn(async 参数 => {
      if (参数[0] === 'default') { 默认.set(参数[2], 参数[1]); return '' }
      return 默认.get(参数[2]) || 'other.desktop'
    })
    const 服务 = 创建Linux默认程序服务({ 已打包: true, 执行 })
    expect(await 服务.启动检查默认程序()).toMatchObject({ 已全部默认: false, 已处理: false })
    expect(执行.mock.calls.every(([参数]) => 参数[0] === 'query')).toBe(true)
    expect(await 服务.设置默认程序()).toMatchObject({ 成功: true, 已全部默认: true, 未生效: [] })
    expect([...默认.keys()]).toEqual(MIME类型)
    expect([...默认.values()].every(项 => 项 === 桌面文件)).toBe(true)
  })
  it('关联未生效时返回真实缺失格式；系统命令失败不报告成功', async () => {
    const 服务 = 创建Linux默认程序服务({ 已打包: true, 执行: async 参数 => 参数[2] === 'text/csv' ? 'other.desktop' : 桌面文件 })
    expect(await 服务.设置默认程序()).toMatchObject({ 已全部默认: false, 未生效: ['csv'] })
    const 失败 = 创建Linux默认程序服务({ 已打包: true, 执行: async () => { throw new Error('xdg failed') } })
    await expect(失败.应用默认程序()).rejects.toThrow('xdg failed')
    await expect(创建Linux默认程序服务({ 已打包: false }).设置默认程序()).rejects.toThrow('Ubuntu 安装版本')
  })
})
