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

    it('应该支持渲染层 { 幻灯片列表 } 契约', async () => {
      const 模型 = {
        幻灯片列表: [
          { 标题: '标题一', 内容: [{ 类型: '文字', 文字: '正文一' }] },
          { 标题: '标题二', 内容: [{ 类型: '文字', 文字: '正文二' }] },
        ],
      }
      const result = await 写入pptx(模型)
      expect(Buffer.isBuffer(result)).toBe(true)
      const zip = await JSZip.loadAsync(result)
      const slideFiles = Object.keys(zip.files).filter((f) => /slide\d+\.xml$/.test(f))
      expect(slideFiles.length).toBe(2)
      const slide1 = await zip.file(slideFiles[0]).async('string')
      expect(slide1).toContain('标题一')
      expect(slide1).toContain('正文一')
    })
  })
})

describe('pptxCodec：富格式往返保真', () => {
  it('写入文本框位置/字号/颜色/对齐后读回不丢失', async () => {
    const 模型 = {
      幻灯片: [
        {
          背景色: '#F5F7FA',
          文本框: [
            { x: 100, y: 80, width: 760, height: 100, text: '标题文字', 字号: 40, 加粗: true, 斜体: false, 颜色: '#FF0000', 对齐: 'center' },
            { x: 120, y: 220, width: 700, height: 200, text: '正文内容', 字号: 20, 加粗: false, 斜体: true, 颜色: '#2B6CF6', 对齐: 'left' },
          ],
        },
      ],
    }
    const buffer = await 写入pptx(模型)
    const result = await 读取pptx(buffer)
    expect(result.警告).toEqual([])
    const 页面 = result.演示文稿.幻灯片列表[0]
    expect(页面.背景色).toBe('#F5F7FA')
    expect(页面.文本框列表.length).toBe(2)
    const 标题框 = 页面.文本框列表[0]
    expect(标题框.text).toContain('标题文字')
    expect(标题框.字号).toBe(40)
    expect(标题框.加粗).toBe(true)
    expect(标题框.颜色).toBe('#FF0000')
    expect(标题框.对齐).toBe('center')
    // 位置按 72dpi 折算回像素，允许 1px 误差
    expect(Math.abs(标题框.x - 100)).toBeLessThanOrEqual(1)
    expect(Math.abs(标题框.y - 80)).toBeLessThanOrEqual(1)
    const 正文框 = 页面.文本框列表[1]
    expect(正文框.颜色).toBe('#2B6CF6')
    expect(正文框.斜体).toBe(true)
  })

  it('富文本片段的颜色随写入保存', async () => {
    const 模型 = {
      幻灯片: [
        {
          背景色: '#FFFFFF',
          文本框: [
            {
              x: 100, y: 80, width: 700, height: 80, text: '红蓝混排', 字号: 28, 加粗: false, 斜体: false, 颜色: '#1A1D24', 对齐: 'left',
              片段: [
                { 文本: '红', 加粗: true, 斜体: false, 下划线: false, 颜色: '#FF0000' },
                { 文本: '蓝', 加粗: false, 斜体: false, 下划线: true, 颜色: '#0000FF' },
              ],
            },
          ],
        },
      ],
    }
    const buffer = await 写入pptx(模型)
    const zip = await JSZip.loadAsync(buffer)
    const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
    expect(slideXml).toContain('FF0000')
    expect(slideXml).toContain('0000FF')
    expect(slideXml).toContain('红')
  })
})

describe('读取 PPTX 的保真警告', () => {
  const 构造演示 = async (幻灯片Xml, 额外文件 = {}) => {
    const 压缩包 = new JSZip()
    压缩包.file('ppt/slides/slide1.xml', 幻灯片Xml)
    Object.entries(额外文件).forEach(([路径, 内容]) => 压缩包.file(路径, 内容))
    return 压缩包.generateAsync({ type: 'nodebuffer' })
  }

  it('只有可导入文本时没有笼统警告', async () => {
    const 结果 = await 读取pptx(await 构造演示('<p:sld><a:t>正文</a:t></p:sld>'))
    expect(结果.警告).toEqual([])
  })

  it('图片、无文字图形和图表分别生成警告', async () => {
    const 数据 = await 构造演示(
      '<p:sld><a:t>正文</a:t><p:pic/><p:sp><p:spPr><a:prstGeom prst="rect"/></p:spPr></p:sp>' +
      '<p:graphicFrame><a:graphic><a:graphicData uri="图表"/></a:graphic></p:graphicFrame></p:sld>'
    )
    const 结果 = await 读取pptx(数据)
    expect(结果.警告).toContain('图片未导入')
    expect(结果.警告).toContain('图形未导入')
    expect(结果.警告).toContain('图表或表格未导入')
  })

  it('只对幻灯片实际包含的媒体、动画和切换效果生成警告', async () => {
    const 数据 = await 构造演示(
      '<p:sld><a:t>正文</a:t><p:video/><p:timing/><p:transition/></p:sld>',
      { 'ppt/media/orphan.mp4': '孤立媒体' }
    )
    const 结果 = await 读取pptx(数据)
    expect(结果.警告).toContain('媒体未导入')
    expect(结果.警告).toContain('动画未导入')
    expect(结果.警告).toContain('幻灯片切换效果未导入')
  })

  it('母版实际包含图形时提示母版对象未导入', async () => {
    const 数据 = await 构造演示('<p:sld><a:t>正文</a:t></p:sld>', {
      'ppt/slides/_rels/slide1.xml.rels': '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>',
      'ppt/slideLayouts/slideLayout1.xml': '<p:sldLayout/>',
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels': '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>',
      'ppt/slideMasters/slideMaster1.xml': '<p:sldMaster><p:spTree><p:sp><p:spPr><a:prstGeom prst="star5"/></p:spPr></p:sp></p:spTree></p:sldMaster>',
    })
    const 结果 = await 读取pptx(数据)
    expect(结果.警告).toContain('母版图形未导入')
  })
})
