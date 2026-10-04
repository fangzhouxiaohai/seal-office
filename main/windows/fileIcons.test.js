const fs = require('fs')
const os = require('os')
const path = require('path')
const { 准备关联文件图标 } = require('./fileIcons')

describe('关联图标的资源与持久路径', () => {
  let 根目录, 资源目录, 数据目录
  beforeEach(() => {
    根目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-icons-'))
    资源目录 = path.join(根目录, '临时 解包')
    数据目录 = path.join(根目录, '持久 数据')
    fs.mkdirSync(资源目录)
    fs.cpSync(path.join(__dirname, 'file-icons'), path.join(资源目录, 'file-icons'), { recursive: true })
  })
  afterEach(() => fs.rmSync(根目录, { recursive: true, force: true }))

  it('安装版使用经过校验的稳定资源目录', async () => {
    expect(await 准备关联文件图标({ 资源目录, 数据目录 })).toBe(path.join(资源目录, 'file-icons'))
    expect(fs.existsSync(数据目录)).toBe(false)
  })
  it('便携图标移除临时解包资源后仍可读取，支持中文与空格路径', async () => {
    const 目录 = await 准备关联文件图标({ 资源目录, 数据目录, 便携版: true })
    fs.rmSync(资源目录, { recursive: true })
    for (const 名称 of ['word', 'table', 'ppt', 'pdf']) {
      expect(fs.readFileSync(path.join(目录, 名称 + '.ico'))).toEqual(fs.readFileSync(path.join(__dirname, 'file-icons', 名称 + '.ico')))
    }
    expect(目录.startsWith(数据目录 + path.sep)).toBe(true)
  })
  it('更新及修复持久图标时使用可信资源', async () => {
    const 目录 = await 准备关联文件图标({ 资源目录, 数据目录, 便携版: true })
    fs.writeFileSync(path.join(目录, 'pdf.ico'), '过期图标')
    expect(await 准备关联文件图标({ 资源目录, 数据目录, 便携版: true })).toBe(目录)
    expect(fs.readFileSync(path.join(目录, 'pdf.ico'))).toEqual(fs.readFileSync(path.join(__dirname, 'file-icons', 'pdf.ico')))
    expect(fs.readdirSync(目录).filter(名称 => 名称.endsWith('.tmp'))).toEqual([])
  })
  it('外置资源遭到修改时停止注册，不使用替代图标', async () => {
    fs.writeFileSync(path.join(资源目录, 'file-icons', 'word.ico'), '损坏')
    await expect(准备关联文件图标({ 资源目录, 数据目录, 便携版: true })).rejects.toThrow('文字文件图标已缺失或修改')
    expect(fs.existsSync(数据目录)).toBe(false)
  })
  it('缺少类型图标时明确指出缺失类型', async () => {
    fs.unlinkSync(path.join(资源目录, 'file-icons', 'table.ico'))
    await expect(准备关联文件图标({ 资源目录, 数据目录 })).rejects.toThrow('表格文件图标已缺失或修改')
  })
  it('便携版持久目录无效时不回退到临时目录', async () => {
    await expect(准备关联文件图标({ 资源目录, 数据目录: '相对目录', 便携版: true })).rejects.toThrow('文件图标的持久保存目录无效')
  })
})

describe('Windows 图标文件格式', () => {
  it('四类图标包含九个有效透明 PNG 尺寸，覆盖列表与高分辨率显示', () => {
    for (const 名称 of ['word', 'table', 'ppt', 'pdf']) {
      const 内容 = fs.readFileSync(path.join(__dirname, 'file-icons', 名称 + '.ico'))
      expect(内容.readUInt16LE(0)).toBe(0)
      expect(内容.readUInt16LE(2)).toBe(1)
      expect(内容.readUInt16LE(4)).toBe(9)
      const 尺寸列表 = []
      for (let 序号 = 0; 序号 < 9; 序号++) {
        const 位置 = 6 + 序号 * 16, 长度 = 内容.readUInt32LE(位置 + 8), 偏移 = 内容.readUInt32LE(位置 + 12)
        const 宽 = 内容[位置] || 256, 高 = 内容[位置 + 1] || 256
        const 帧 = 内容.subarray(偏移, 偏移 + 长度)
        expect(帧.length).toBe(长度)
        expect(帧.subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]))
        expect(帧.readUInt32BE(16)).toBe(宽)
        expect(帧.readUInt32BE(20)).toBe(高)
        expect([4, 6]).toContain(帧[25])
        尺寸列表.push(宽)
      }
      expect(尺寸列表).toEqual([16,20,24,32,40,48,64,128,256])
    }
  })
})
