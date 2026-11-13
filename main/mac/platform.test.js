const fs = require('fs')
const { 定位兼容引擎 } = require('../office/nativeRuntime')
const { 提取关联路径 } = require('../fileAssociation')

describe('苹果系统平台支持', () => {
  afterEach(() => vi.restoreAllMocks())

  it('识别访达提供的文稿绝对路径', () => {
    expect(提取关联路径(['/Users/用户/资料/报告.DOCX', 'relative.docx', '/tmp/other.unknown'], 'darwin')).toEqual(['/Users/用户/资料/报告.DOCX'])
  })

  it('使用标准安装位置的 LibreOffice 转换引擎', () => {
    const 检查 = vi.spyOn(fs, 'accessSync').mockImplementation(() => {})
    expect(定位兼容引擎({ 平台: 'darwin' })).toBe('/Applications/LibreOffice.app/Contents/MacOS/soffice')
    expect(检查).toHaveBeenCalledWith('/Applications/LibreOffice.app/Contents/MacOS/soffice', fs.constants.X_OK)
  })

  it('缺少转换引擎时提示安装，不伪造转换成功', () => {
    vi.spyOn(fs, 'accessSync').mockImplementation(() => { throw new Error('missing') })
    expect(() => 定位兼容引擎({ 平台: 'darwin' })).toThrow('请安装 LibreOffice')
  })

  it('苹果测试包使用独立配置和正确的文件关联', () => {
    const 配置 = require('../../build/electron-macos.cjs')
    const 格式 = require('../documentFormats.json')
    expect(配置.extends).toBeNull()
    expect(配置.mac.target).toEqual([{ target: 'dmg', arch: ['arm64'] }])
    expect(配置.mac.identity).toBeNull()
    expect(配置.mac.artifactName).toBe('seal-office-${version}-macos.dmg')
    expect(配置.fileAssociations.map(x => x.ext)).toEqual(格式.map(x => x.extension))
    expect(JSON.stringify(配置.extraResources)).not.toContain('office-runtime')
  })
})
