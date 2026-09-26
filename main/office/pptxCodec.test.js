// PPTX 编解码器测试
const pptxCodec = require('./pptxCodec')
const JSZip = require('jszip')

const 读取pptx = pptxCodec['读取pptx']
const 写入pptx = pptxCodec['写入pptx']

describe('pptxCodec', () => {
  describe('读取pptx', () => {
    // 注意：读取结果契约为 { 演示文稿: { 幻灯片列表, 当前索引 }, 警告 }，
    // 与 deck.ts 的 演示文稿/幻灯片 模型一致（见 v1.3.0 改动说明）。
    it('应该能读取空 PPTX', async () => {
      // 创建一个空的 PPTX 文件
      const zip = new JSZip()
      zip.file('ppt/presentation.xml', '<presentation><slides><slide><c:cs/></slide></slides></presentation>')
      zip.file('ppt/slides/slide1.xml', '<slide><a:t>测试文本</a:t></slide>')
      const buffer = await zip.generateAsync({ type: 'nodebuffer' })
      const result = await 读取pptx(buffer)
      expect(result.演示文稿).toBeDefined()
      expect(result.演示文稿.幻灯片列表).toBeDefined()
      expect(result.演示文稿.当前索引).toBe(0)
      expect(result.警告).toBeDefined()
    })

    it('应该能提取幻灯片文本', async () => {
      const zip = new JSZip()
      zip.file('ppt/presentation.xml', '<presentation><slides><slide><c:cs/></slide></slides></presentation>')
      zip.file('ppt/slides/slide1.xml', '<slide><a:t>第一页内容</a:t></slide>')
      zip.file('ppt/slides/slide2.xml', '<slide><a:t>第二页内容</a:t></slide>')
      const buffer = await zip.generateAsync({ type: 'nodebuffer' })
      const result = await 读取pptx(buffer)
      expect(result.演示文稿.幻灯片列表.length).toBe(2)
      expect(result.演示文稿.幻灯片列表[0].title).toContain('第一页内容')
      expect(result.演示文稿.幻灯片列表[1].title).toContain('第二页内容')
    })

    it('应该返回 HTML 转义文本', async () => {
      const zip = new JSZip()
      zip.file('ppt/presentation.xml', '<presentation><slides><slide><c:cs/></slide></slides></presentation>')
      zip.file('ppt/slides/slide1.xml', '<slide><a:t>转义&lt;测试&gt;</a:t></slide>')
      const buffer = await zip.generateAsync({ type: 'nodebuffer' })
      const result = await 读取pptx(buffer)
      expect(result.演示文稿.幻灯片列表[0].title).toContain('转义<测试>')
    })

    it('应该解码数字字符引用', async () => {
      const zip = new JSZip()
      zip.file('ppt/presentation.xml', '<presentation><slides><slide><c:cs/></slide></slides></presentation>')
      zip.file('ppt/slides/slide1.xml', '<slide><a:t>&#39;单引号&#x26;和号&#60;左尖括号&#62;右尖括号</a:t></slide>')
      const buffer = await zip.generateAsync({ type: 'nodebuffer' })
      const result = await 读取pptx(buffer)
      const 文本 = result.演示文稿.幻灯片列表[0].title
      expect(文本).not.toBeUndefined()
      expect(文本).toContain('<')
      expect(文本).toContain('>')
    })
  })

  describe('写入pptx', () => {
    it('应该能写入空数据', async () => {
      const result = await 写入pptx({ 幻灯片: [] })
      expect(Buffer.isBuffer(result)).toBe(true)
      const zip = await JSZip.loadAsync(result)
      expect(Object.keys(zip.files).length).toBeGreaterThan(0)
    })

    it('应该能写入幻灯片文本', async () => {
      const result = await 写入pptx({ 幻灯片: [{ 文本: '标题' }, { 文本: '内容' }] })
      expect(Buffer.isBuffer(result)).toBe(true)
      const zip = await JSZip.loadAsync(result)
      const slide1File = Object.keys(zip.files).find(f => f.includes('slide1.xml'))
      expect(slide1File).toBeDefined()
    })

    it('null 模型应该使用默认空数组', async () => {
      const result = await 写入pptx(null)
      expect(Buffer.isBuffer(result)).toBe(true)
    })
  })
})
