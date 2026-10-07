// PDF 功能测试：验证页面提取、合并、删除、旋转
const pdfTools = require('./pdfTools')
const { PDFDocument } = require('pdf-lib')

const { 提取页面, 合并文档, 删除页面, 旋转页面, 插入空白页, 插入文件页, 编辑页面 } = pdfTools

// Create a test PDF with specified number of pages
function createTestPDF(pageCount = 3) {
  return async () => {
    const doc = await PDFDocument.create()
    for (let i = 1; i <= pageCount; i++) {
      const page = doc.addPage()
      page.drawText(`Page ${i}`, { x: 50, y: 750 })
    }
    return Buffer.from(await doc.save())
  }
}

describe('PDF Tools', () => {
  let testPDF

  beforeAll(async () => {
    const creator = createTestPDF(3)
    testPDF = await creator()
  })

  describe('提取页面', () => {
    it('should extract single page', async () => {
      const result = await 提取页面(testPDF, [1])
      expect(Buffer.isBuffer(result)).toBe(true)
      const doc = await PDFDocument.load(result)
      expect(doc.getPageCount()).toBe(1)
    })

    it('should extract multiple pages', async () => {
      const result = await 提取页面(testPDF, [1, 3])
      expect(Buffer.isBuffer(result)).toBe(true)
      const doc = await PDFDocument.load(result)
      expect(doc.getPageCount()).toBe(2)
    })

    it('should throw error for page number out of range', async () => {
      await expect(提取页面(testPDF, [10])).rejects.toThrow()
    })

    it('should throw error for page number 0', async () => {
      await expect(提取页面(testPDF, [0])).rejects.toThrow()
    })
  })

  describe('合并文档', () => {
    it('should merge two PDFs', async () => {
      const pdf2 = await createTestPDF(2)()
      const result = await 合并文档([testPDF, pdf2])
      expect(Buffer.isBuffer(result)).toBe(true)
      const doc = await PDFDocument.load(result)
      expect(doc.getPageCount()).toBe(5) // 3 + 2
    })

    it('should throw error for single document', async () => {
      await expect(合并文档([testPDF])).rejects.toThrow()
    })

    it('should throw error for empty list', async () => {
      await expect(合并文档([])).rejects.toThrow()
    })
  })

  describe('删除页面', () => {
    it('should delete specified page', async () => {
      const result = await 删除页面(testPDF, [2])
      expect(Buffer.isBuffer(result)).toBe(true)
      const doc = await PDFDocument.load(result)
      expect(doc.getPageCount()).toBe(2)
    })

    it('should throw error when deleting all pages', async () => {
      await expect(删除页面(testPDF, [1, 2, 3])).rejects.toThrow()
    })

    it('should throw error for page number out of range', async () => {
      await expect(删除页面(testPDF, [5])).rejects.toThrow()
    })
  })

  describe('旋转页面', () => {
    it('should rotate 90 degrees', async () => {
      const result = await 旋转页面(testPDF, [1], 90)
      expect(Buffer.isBuffer(result)).toBe(true)
      const doc = await PDFDocument.load(result)
      expect(doc.getPageCount()).toBe(3)
    })

    it('should rotate 180 degrees', async () => {
      const result = await 旋转页面(testPDF, [1], 180)
      expect(Buffer.isBuffer(result)).toBe(true)
      const doc = await PDFDocument.load(result)
      expect(doc.getPageCount()).toBe(3)
    })

    it('should rotate 270 degrees', async () => {
      const result = await 旋转页面(testPDF, [1], 270)
      expect(Buffer.isBuffer(result)).toBe(true)
      const doc = await PDFDocument.load(result)
      expect(doc.getPageCount()).toBe(3)
    })

    it('should throw error for invalid angle', async () => {
      await expect(旋转页面(testPDF, [1], 45)).rejects.toThrow()
    })

    it('should throw error for zero angle', async () => {
      await expect(旋转页面(testPDF, [1], 0)).rejects.toThrow()
    })
  })

  it('插入空白页和其他文件页面保持正确页数与顺序', async () => {
    const 空白结果 = await PDFDocument.load(await 插入空白页(testPDF, 2))
    expect(空白结果.getPageCount()).toBe(4)
    const 来源 = await createTestPDF(2)()
    const 插入结果 = await PDFDocument.load(await 插入文件页(testPDF, 来源, [2, 1], 2))
    expect(插入结果.getPageCount()).toBe(5)
    await expect(插入空白页(testPDF, 5)).rejects.toThrow('插入位置')
  })

  it('新增文字、图片、可见批注与遮盖后仍能重新载入 PDF', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR7sAAAAASUVORK5CYII=', 'base64').toString('base64')
    for (const 操作 of [
      { 类型: 'text', 页码: 1, x: 40, y: 40, 文字: 'Added text', 字号: 12, 颜色: '#000000' },
      { 类型: 'note', 页码: 1, x: 40, y: 40, 文字: 'Review', 字号: 12, 颜色: '#000000' },
      { 类型: 'image', 页码: 1, x: 40, y: 40, 宽: 20, 高: 20, 图片: png },
      { 类型: 'cover', 页码: 1, x: 40, y: 40, 宽: 20, 高: 20, 颜色: '#ffffff' },
      { 类型: 'replace', 页码: 1, x: 40, y: 40, 宽: 90, 高: 20, 文字: 'Updated', 字号: 12, 颜色: '#000000' },
    ]) expect((await PDFDocument.load(await 编辑页面(testPDF, 操作))).getPageCount()).toBe(3)
    await expect(编辑页面(testPDF, { 类型: 'text', 页码: 4, x: 0, y: 0, 文字: 'A' })).rejects.toThrow('页码')
  })
})
