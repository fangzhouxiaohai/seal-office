const fs = require('fs')
const path = require('path')
const { 读取docx } = require('../office/docxReader')
const { 读取xlsx } = require('../office/xlsxCodec')
const { 读取pptx } = require('../office/pptxCodec')
const { PDFDocument } = require('pdf-lib')
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
