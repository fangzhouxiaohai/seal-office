describe('Windows 文件关联入口', () => {
  it('安装版包含系统菜单注册脚本和真实空白模板', () => {
    const 配置 = require('../package.json').build
    expect(配置.nsis.include).toBe('build/installer.nsh')
    expect(配置.extraResources.map(项 => 项.to)).toEqual(['shell-integration/shellIntegration.ps1', 'file-icons', 'shell-new'])
  })

  it('只接收绝对路径及支持的扩展名，并保留中文和空格', () => {
    const { 提取关联路径 } = require('./fileAssociation')
    expect(提取关联路径([
      'C:\\Program Files\\SealOffice\\SealOffice.exe',
      'C:\\资料 文件\\年度报告.DOCX',
      '相对路径.xlsx',
      'C:\\资料\\脚本.exe',
      '--无关参数',
      '\\\\server\\共享\\明细表.xlsx',
    ])).toEqual(['C:\\资料 文件\\年度报告.DOCX', '\\\\server\\共享\\明细表.xlsx'])
  })

  it('初次启动和二次唤醒共用待打开队列，渲染层准备好后主动取走', async () => {
    const { 创建关联文件入口 } = require('./fileAssociation')
    const 主网页 = { send: vi.fn() }
    const 主窗口 = { webContents: 主网页, isDestroyed: () => false }
    const 处理器 = new Map()
    const 入口 = 创建关联文件入口(() => 主窗口)
    入口.注册读取通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    入口.加入命令行(['SealOffice.exe', 'C:\\资料\\甲.docx'])
    expect(主网页.send).toHaveBeenCalledWith('file.association.available')
    const 取待打开 = 处理器.get('file.association.takePending')
    expect(await 取待打开({ sender: {} })).toEqual({ 成功: false, 错误: expect.any(String) })
    expect(await 取待打开({ sender: 主网页 })).toEqual({ 成功: true, 路径列表: ['C:\\资料\\甲.docx'] })
    入口.加入命令行(['SealOffice.exe', 'C:\\资料\\乙.pdf', 'C:\\资料\\乙.pdf'])
    expect(await 取待打开({ sender: 主网页 })).toEqual({ 成功: true, 路径列表: ['C:\\资料\\乙.pdf'] })
    expect(await 取待打开({ sender: 主网页 })).toEqual({ 成功: true, 路径列表: [] })
  })
})
