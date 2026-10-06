const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const JSZip = require('jszip')
const { PDFDocument } = require('pdf-lib')
const { 读取pptx } = require('../office/pptxCodec')
const { 生成PDF, 生成图片型PPTX, 写入导出文件, 导出演示, 校验导出请求 } = require('./export')

// ---------- 测试用最小 PNG 编码器（不引入新依赖） ----------
const CRC表 = (() => {
  const 表 = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    表[n] = c
  }
  return 表
})()
const crc32 = 数据 => {
  let c = 0xffffffff
  for (const 字节 of 数据) c = CRC表[(c ^ 字节) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const 区块 = (类型, 数据) => {
  const 长度 = Buffer.alloc(4); 长度.writeUInt32BE(数据.length)
  const 类型与数据 = Buffer.concat([Buffer.from(类型, 'ascii'), 数据])
  const 校验 = Buffer.alloc(4); 校验.writeUInt32BE(crc32(类型与数据))
  return Buffer.concat([长度, 类型与数据, 校验])
}
function 造Png(宽, 高, 颜色 = [200, 30, 30]) {
  const 头 = Buffer.alloc(13)
  头.writeUInt32BE(宽, 0); 头.writeUInt32BE(高, 4)
  头[8] = 8; 头[9] = 2; 头[10] = 0; 头[11] = 0; 头[12] = 0
  const 行 = Buffer.concat(Array.from({ length: 高 }, () => Buffer.concat([Buffer.from([0]), ...Array.from({ length: 宽 }, () => Buffer.from(颜色))])))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 区块('IHDR', 头), 区块('IDAT', zlib.deflateSync(行)), 区块('IEND', Buffer.alloc(0))])
}
const 临时目录 = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seal-export-test-'))
const 页图片 = (序号, 宽 = 960, 高 = 540) => ({ 序号, 类型: 'image/png', 数据: 造Png(宽, 高), 宽, 高 })

describe('导出 PDF', () => {
  it('按实际页面尺寸逐页生成并保留页序', async () => {
    const 数据 = await 生成PDF([页图片(0), 页图片(2)], { 宽: 960, 高: 540 })
    const 文档 = await PDFDocument.load(数据)
    expect(文档.getPageCount()).toBe(2)
    expect(文档.getPage(0).getSize()).toEqual({ width: 960, height: 540 })
    expect(文档.getPage(1).getSize()).toEqual({ width: 960, height: 540 })
  })

  it('4:3 文稿按 720×540 生成', async () => {
    const 数据 = await 生成PDF([页图片(0, 720, 540)], { 宽: 720, 高: 540 })
    const 文档 = await PDFDocument.load(数据)
    expect(文档.getPage(0).getSize()).toEqual({ width: 720, height: 540 })
  })

  it('空页面列表给出真实原因', async () => {
    await expect(生成PDF([], { 宽: 960, 高: 540 })).rejects.toThrow('没有可导出的页面')
  })
})

describe('图片型 PPTX', () => {
  it('每页铺满一张图片且不写入可编辑文本', async () => {
    const 数据 = await 生成图片型PPTX([页图片(0), 页图片(1)], { 宽: 960, 高: 540 })
    const zip = await JSZip.loadAsync(数据)
    const 幻灯片 = Object.keys(zip.files).filter(名称 => /^ppt\/slides\/slide\d+\.xml$/.test(名称))
    const 媒体 = Object.keys(zip.files).filter(名称 => /^ppt\/media\/.+/.test(名称) && !名称.endsWith('/'))
    expect(幻灯片.length).toBe(2)
    expect(媒体.length).toBe(2)
    const 第一页 = await zip.file('ppt/slides/slide1.xml').async('string')
    expect(第一页).toContain('<a:blip')
    expect(第一页).not.toContain('可编辑文本')
    const 读取 = await 读取pptx(数据)
    expect(读取.演示文稿.幻灯片列表.length).toBe(2)
  })

  it('页面尺寸写入演示文稿尺寸', async () => {
    const 数据 = await 生成图片型PPTX([页图片(0, 720, 540)], { 宽: 720, 高: 540 })
    const zip = await JSZip.loadAsync(数据)
    const 演示 = await zip.file('ppt/presentation.xml').async('string')
    expect(演示).toContain('cx="9144000"')
    expect(演示).toContain('cy="6858000"')
  })
})

describe('写盘', () => {
  it('多页图片输出到独立目录并使用确定命名', () => {
    const 目录 = 临时目录()
    const 结果 = 写入导出文件(目录, '季度汇报', 'PNG', [页图片(0), 页图片(1)])
    expect(结果.map(项 => path.basename(项.路径))).toEqual(['第1页.png', '第2页.png'])
    expect(结果.every(项 => 项.字节数 > 0)).toBe(true)
    expect(fs.existsSync(path.join(目录, '季度汇报-图片'))).toBe(true)
    fs.rmSync(目录, { recursive: true, force: true })
  })

  it('同名文件不覆盖而是追加序号', () => {
    const 目录 = 临时目录()
    写入导出文件(目录, '季度汇报', 'PNG', [页图片(0)])
    const 第二次 = 写入导出文件(目录, '季度汇报', 'PNG', [页图片(0)])
    expect(第二次.map(项 => path.basename(项.路径))).toEqual(['季度汇报-第1页-1.png'])
    expect(fs.readdirSync(目录).filter(名称 => 名称.endsWith('.png')).length).toBe(2)
    fs.rmSync(目录, { recursive: true, force: true })
  })

  it('单文件格式写入确定名称并报告实际字节数', () => {
    const 目录 = 临时目录()
    const 结果 = 写入导出文件(目录, '季度汇报', 'PDF', [{ 序号: 0, 类型: 'application/pdf', 数据: Buffer.from('%PDF-1.7 test') }])
    expect(path.basename(结果[0].路径)).toBe('季度汇报.pdf')
    expect(结果[0].字节数).toBe(fs.statSync(结果[0].路径).size)
    fs.rmSync(目录, { recursive: true, force: true })
  })

  it('写盘失败时不留下最终文件', () => {
    const 目录 = 临时目录()
    const 假fs = { ...fs, renameSync: () => { throw new Error('磁盘写入失败') } }
    expect(() => 写入导出文件(目录, '季度汇报', 'PDF', [{ 序号: 0, 类型: 'application/pdf', 数据: Buffer.from('%PDF-1.7 test') }], 假fs)).toThrow('磁盘写入失败')
    expect(fs.readdirSync(目录).filter(名称 => 名称.endsWith('.pdf'))).toEqual([])
    fs.rmSync(目录, { recursive: true, force: true })
  })
})

describe('导出请求校验', () => {
  const 尺寸 = { 宽: 960, 高: 540 }
  it('讲义与备注只用于 PDF', () => {
    expect(() => 校验导出请求({ 格式: 'PNG', 页面尺寸: 尺寸, 条目: [{ 序号: 0 }], 讲义每页张数: 6 })).toThrow('讲义')
    expect(() => 校验导出请求({ 格式: '图片型PPTX', 页面尺寸: 尺寸, 条目: [{ 序号: 0 }], 输出备注: true })).toThrow('备注')
    expect(() => 校验导出请求({ 格式: 'PDF', 页面尺寸: 尺寸, 条目: [{ 序号: 0 }], 讲义每页张数: 6, 输出备注: true })).not.toThrow()
  })

  it('分辨率与画质越界被拒绝', () => {
    expect(() => 校验导出请求({ 格式: 'PNG', 页面尺寸: 尺寸, 条目: [{ 序号: 0 }], 分辨率倍数: 9 })).toThrow('分辨率')
    expect(() => 校验导出请求({ 格式: 'JPEG', 页面尺寸: 尺寸, 条目: [{ 序号: 0 }], JPEG质量: 2 })).toThrow('画质')
  })

  it('缺少页面尺寸或页面列表时给出真实原因', () => {
    expect(() => 校验导出请求({ 格式: 'PDF', 条目: [{ 序号: 0 }] })).toThrow('页面尺寸')
    expect(() => 校验导出请求({ 格式: 'PDF', 页面尺寸: 尺寸 })).toThrow('没有可导出的页面')
  })
})

describe('完整导出流程（注入捕获）', () => {
  it('图片导出写盘并报告真实路径与字节数', async () => {
    const 目录 = 临时目录()
    const 请求 = { 格式: 'PNG', 页面尺寸: { 宽: 960, 高: 540 }, 基础名: '季度汇报', 目录, 分辨率倍数: 2, 条目: [{ 序号: 0 }, { 序号: 1 }] }
    const 结果 = await 导出演示(请求, { 捕获页: async () => [页图片(0), 页图片(1)], 选择目录: async () => 目录 })
    expect(结果.成功).toBe(true)
    expect(结果.文件列表.length).toBe(2)
    expect(结果.文件列表.every(项 => fs.existsSync(项.路径))).toBe(true)
    fs.rmSync(目录, { recursive: true, force: true })
  })

  it('与源文件同名的导出不会覆盖源文件', async () => {
    const 目录 = 临时目录()
    const 源路径 = path.join(目录, '季度汇报.pptx')
    fs.writeFileSync(源路径, 'source-bytes')
    const 结果 = await 导出演示({ 格式: 'PDF', 页面尺寸: { 宽: 960, 高: 540 }, 基础名: '季度汇报', 目录, 条目: [{ 序号: 0 }] }, { 捕获页: async () => [页图片(0)], 选择目录: async () => 目录 })
    expect(结果.成功).toBe(true)
    expect(fs.readFileSync(源路径, 'utf8')).toBe('source-bytes')
    fs.rmSync(目录, { recursive: true, force: true })
  })

  it('取消保存目录时不写盘也不报成功', async () => {
    const 结果 = await 导出演示({ 格式: 'PDF', 页面尺寸: { 宽: 960, 高: 540 }, 基础名: '季度汇报', 条目: [{ 序号: 0 }] }, { 捕获页: async () => [页图片(0)], 选择目录: async () => null })
    expect(结果.成功).toBe(false)
    expect(结果.已取消).toBe(true)
  })

  it('捕获失败返回真实原因', async () => {
    const 结果 = await 导出演示({ 格式: 'PNG', 页面尺寸: { 宽: 960, 高: 540 }, 基础名: '季度汇报', 目录: 临时目录(), 条目: [{ 序号: 0 }] }, { 捕获页: async () => { throw new Error('页面渲染超时') }, 选择目录: async () => 临时目录() })
    expect(结果.成功).toBe(false)
    expect(结果.错误).toContain('页面渲染超时')
  })
})
