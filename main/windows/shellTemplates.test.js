const fs = require('fs')
const path = require('path')
const os = require('os')
const { 读取docx } = require('../office/docxReader')
const { 读取xlsx } = require('../office/xlsxCodec')
const { 读取pptx } = require('../office/pptxCodec')
const { PDFDocument } = require('pdf-lib')
const { writeSeal, readSeal } = require('../office/sealFormat')
const { 生成专属模板 } = require('../../scripts/generate-shell-new.cjs')
const 数据 = 扩展名 => fs.readFileSync(path.resolve(__dirname, `../../build/shell-new/blank.${扩展名}`))
describe('资源管理器新建模板', () => {
  it.each(['doc', 'xls', 'ppt'])('%s 是真实 Office 二进制容器', 扩展名 => {
    expect(数据(扩展名).subarray(0, 8).toString('hex')).toBe('d0cf11e0a1b11ae1')
  })
  it('DOCX 可由本软件正常读取且没有导入损失', async () => {
    const 文档 = await 读取docx(数据('docx'))
    expect(文档.html).toContain('<p')
    expect(文档.警告).toEqual([])
  })
  it('XLSX 包含可用空白工作表且没有导入损失', async () => {
    const 文档 = await 读取xlsx(数据('xlsx'))
    expect(文档.工作表列表).toHaveLength(1)
    expect(文档.警告).toEqual([])
  })
  it('PPTX 包含一张空白幻灯片', async () => {
    const 文档 = await 读取pptx(数据('pptx'))
    expect(文档.演示文稿.幻灯片列表).toHaveLength(1)
    expect(文档.警告).toEqual([])
  })
  it('PDF 是合法单页文档', async () => {
    expect((await PDFDocument.load(数据('pdf'))).getPageCount()).toBe(1)
  })
})

describe('海豹专属格式新建模板', () => {
  let 目录
  beforeAll(async () => {
    目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-native-shell-'))
    await 生成专属模板(目录)
  })
  afterAll(() => {
    if (!目录) return
    const 绝对路径 = path.resolve(目录)
    if (path.dirname(绝对路径) !== path.resolve(os.tmpdir()) || !path.basename(绝对路径).startsWith('seal-native-shell-')) throw new Error('新建模板测试清理路径越界')
    fs.rmSync(绝对路径, { recursive: true, force: true })
  })
  it.each([['sldoc', 'word'], ['slxls', 'table'], ['slppt', 'ppt'], ['spdf', 'pdf']])('%s 可直接解析，修改后再次保存并重开', async (扩展, 类型) => {
    const 原始 = fs.readFileSync(path.join(目录, `blank.${扩展}`))
    expect(原始.length).toBeGreaterThan(100)
    expect(原始.subarray(0, 4).toString('hex')).toBe('504b0304')
    const 文档 = await readSeal(扩展, 原始)
    expect(文档.类型).toBe(类型)
    if (类型 === 'word') 文档.html = '<p>右键新建后编辑 🦭𠮷 e\u0301</p>'
    if (类型 === 'table') {
      const 工作表 = 文档.工作表列表[0]
      expect(工作表.列宽).toHaveLength(工作表.列数)
      expect(工作表.行高).toHaveLength(工作表.行数)
      工作表.单元格.A1 = { 原始值: '𠮷🦭', 显示值: '𠮷🦭', 格式: { 加粗: true } }
      工作表.单元格.B1 = { 原始值: '=SUM(1,2)', 显示值: '3', 计算值: 3, 格式: {} }
    }
    if (类型 === 'ppt') {
      expect(文档.演示文稿.幻灯片列表).toHaveLength(1)
      文档.演示文稿.幻灯片列表[0].备注 = '右键新建后编辑 🦭𠮷'
    }
    if (类型 === 'pdf') {
      const pdf = await PDFDocument.load(Buffer.from(文档.PDF数据, 'base64'))
      expect(pdf.getPageCount()).toBe(1)
      pdf.addPage([400, 600])
      文档.PDF数据 = Buffer.from(await pdf.save()).toString('base64')
    }
    const { 类型: _类型, ...负载 } = 文档
    const 修改后 = await writeSeal(类型, 负载)
    expect(await readSeal(扩展, 修改后)).toEqual(文档)
    if (类型 === 'pdf') expect((await PDFDocument.load(Buffer.from((await readSeal(扩展, 修改后)).PDF数据, 'base64'))).getPageCount()).toBe(2)
  })
})
