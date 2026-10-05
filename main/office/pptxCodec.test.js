// PPTX 编解码器测试
const pptxCodec = require('./pptxCodec')
const JSZip = require('jszip')

const 读取pptx = pptxCodec['读取pptx']
const 写入pptx = pptxCodec['写入pptx']

const 空白幻灯片 = '<p:sld><p:cSld><p:spTree/></p:cSld></p:sld>'
const 文字幻灯片 = (内容) => `<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${内容}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
const 构造有效演示 = async (幻灯片列表, 额外文件 = {}) => {
  const 压缩包 = new JSZip()
  const 条目 = 幻灯片列表.map((xml, 索引) => {
    const 序号 = 索引 + 1
    压缩包.file(`ppt/slides/slide${序号}.xml`, xml)
    return { 序号, 路径: `/ppt/slides/slide${序号}.xml` }
  })
  压缩包.file('[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    条目.map(({ 路径 }) => `<Override PartName="${路径}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') +
    '</Types>')
  压缩包.file('ppt/presentation.xml',
    '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<p:sldIdLst>${条目.map(({ 序号 }) => `<p:sldId id="${255 + 序号}" r:id="rId${序号}"/>`).join('')}</p:sldIdLst></p:presentation>`)
  压缩包.file('ppt/_rels/presentation.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    条目.map(({ 序号 }) => `<Relationship Id="rId${序号}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${序号}.xml"/>`).join('') +
    '</Relationships>')
  Object.entries(额外文件).forEach(([路径, 内容]) => 压缩包.file(路径, 内容))
  return 压缩包.generateAsync({ type: 'nodebuffer' })
}

describe('读取 PPTX 文件结构', () => {
  it('主清单关系标识重复不能静默覆盖前一个目标', async () => {
    const 包 = await JSZip.loadAsync(await 构造有效演示([空白幻灯片]))
    const 路径 = 'ppt/_rels/presentation.xml.rels'
    包.file(路径, (await 包.file(路径).async('string')).replace('</Relationships>', '<Relationship Id="rId1" Type="example/slide" Target="slides/slide1.xml"/></Relationships>'))
    await expect(读取pptx(await 包.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow(/标识重复/)
  })

  it('损坏页面关系即使没有备注也必须报告，不能忽略损坏结构', async () => {
    const 数据 = await 构造有效演示([空白幻灯片], {
      'ppt/slides/_rels/slide1.xml.rels': '<Relationships><Relationship',
    })
    await expect(读取pptx(数据)).rejects.toThrow(/关系文件/)
  })
  it('普通压缩包不能伪装成演示文件', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('readme.txt', '普通压缩文件')
    await expect(读取pptx(await 压缩包.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow('演示文件无效')
  })

  it('合法零页演示按真实空列表打开且不生成默认幻灯片', async () => {
    const result = await 读取pptx(await 构造有效演示([]))
    expect(result.演示文稿.幻灯片列表).toEqual([])
    expect(result.警告).toEqual([])
  })

  it('显式零页演示保存重开仍为零页且不修改传入模型', async () => {
    const model = { 幻灯片: [] }
    const result = await 读取pptx(await 写入pptx(model))
    expect(result.演示文稿.幻灯片列表).toEqual([])
    expect(model.幻灯片).toEqual([])
  })

  it('演示关系引用缺失的幻灯片时必须报错', async () => {
    const 压缩包 = await JSZip.loadAsync(await 构造有效演示([空白幻灯片]))
    压缩包.remove('ppt/slides/slide1.xml')
    await expect(读取pptx(await 压缩包.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow('演示文件无效')
  })

  it('截断的演示清单不能作为合法零页演示打开', async () => {
    const zip = await JSZip.loadAsync(await 构造有效演示([]))
    zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>')
    await expect(读取pptx(await zip.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow('演示文件无效')
  })

  it.each([
    '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/><损坏',
    '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:ext></p:sldIdLst></p:presentation>',
    '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
  ])('损坏清单不能误识别为合法零页演示：%s', async (清单) => {
    const zip = await JSZip.loadAsync(await 构造有效演示([]))
    zip.file('ppt/presentation.xml', 清单)
    await expect(读取pptx(await zip.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow('演示文件无效')
  })

  it('幻灯片部件并非完整内容时必须报文件损坏', async () => {
    const 不完整 = '<p:sld><p:cSld><p:spTree>'
    await expect(读取pptx(await 构造有效演示([不完整]))).rejects.toThrow('演示文件无效')
  })

  it('真实存在的空白幻灯片可以打开且不填入默认文字', async () => {
    const 结果 = await 读取pptx(await 构造有效演示([空白幻灯片]))
    expect(结果.演示文稿.幻灯片列表).toHaveLength(1)
    expect(结果.演示文稿.幻灯片列表[0].文本框列表).toEqual([])
    expect(结果.警告).toEqual([])
  })
})

describe('读取 PPTX 文字片段', () => {
  const 形状 = (段落) => `<p:sld><p:cSld><p:spTree><p:sp><p:txBody>${段落}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`

  it('同段文字片段连续拼接，跨段落才换行', async () => {
    const XML = 形状('<a:p><a:r><a:t>第一</a:t></a:r><a:r><a:t>段</a:t></a:r></a:p><a:p><a:r><a:t>第二段</a:t></a:r></a:p>')
    const 结果 = await 读取pptx(await 构造有效演示([XML]))
    expect(结果.演示文稿.幻灯片列表[0].文本框列表[0].text).toBe('第一段\n第二段')
    expect(结果.警告).toEqual([])
  })

  it('同一文本框中混合样式无法往返时给出保真警告', async () => {
    const XML = 形状('<a:p><a:r><a:rPr b="1"/><a:t>加粗</a:t></a:r><a:r><a:rPr b="0"/><a:t>普通</a:t></a:r></a:p>')
    const 结果 = await 读取pptx(await 构造有效演示([XML]))
    expect(结果.演示文稿.幻灯片列表[0].文本框列表[0].text).toBe('加粗普通')
    expect(结果.警告).toContain('混合文字样式未完整导入')
  })
})

describe('演示文稿格式保真', () => {
  it('文本框字体和下划线保存后可读回', async () => {
    const 文件 = await 写入pptx({ 幻灯片: [{ 文本框: [{
      x: 80, y: 60, width: 800, height: 120,
      text: '专用字体', 字号: 30, 字体: 'SimSun', 下划线: true,
    }] }] })
    const 框 = (await 读取pptx(文件)).演示文稿.幻灯片列表[0].文本框列表[0]
    expect(框.字体).toBe('SimSun')
    expect(框.下划线).toBe(true)
  })

  it.each([
    ['非宽屏', '9144000', '6858000'],
    ['同宽高比但物理尺寸不同', '9144000', '5143500'],
  ])('%s演示需提示尺寸无法完整导入', async (_名称, 宽, 高) => {
    const 压缩包 = await JSZip.loadAsync(await 构造有效演示([空白幻灯片]))
    const 清单 = await 压缩包.file('ppt/presentation.xml').async('string')
    压缩包.file('ppt/presentation.xml', 清单.replace('</p:presentation>', `<p:sldSz cx="${宽}" cy="${高}"/></p:presentation>`))
    const 结果 = await 读取pptx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.警告).toContain('页面尺寸未完整导入')
  })

  it('项目符号和文本框填充不能静默丢失', async () => {
    const XML = '<p:sld><p:cSld><p:spTree><p:sp>' +
      '<p:spPr><a:solidFill><a:srgbClr val="DDEEFF"/></a:solidFill></p:spPr>' +
      '<p:txBody><a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>重点</a:t></a:r></a:p></p:txBody>' +
      '</p:sp></p:spTree></p:cSld></p:sld>'
    const 结果 = await 读取pptx(await 构造有效演示([XML]))
    expect(结果.警告).toContain('文本框外观未完整导入')
    expect(结果.警告).toContain('段落格式未完整导入')
  })
})

describe('幻灯片切换效果往返', () => {
  it.each([
    ['淡入淡出', '<p:fade'],
    ['推进', '<p:push'],
  ])('写入并读回%s切换效果', async (效果, 标记) => {
    const 文件 = await 写入pptx({ 幻灯片: [{ 文本: '第一张', 过渡效果: 效果 }] })
    const 压缩包 = await JSZip.loadAsync(文件)
    const XML = await 压缩包.file('ppt/slides/slide1.xml').async('string')
    expect(XML).toContain(标记)
    const 读回 = await 读取pptx(文件)
    expect(读回.演示文稿.幻灯片列表[0].过渡效果).toBe(效果)
    expect(读回.警告).not.toContain('幻灯片切换效果未完整导入')
  })

  it('遇到暂不支持的切换效果时发出具体保真警告', async () => {
    const XML = 空白幻灯片.replace('</p:sld>', '<p:transition><p:ripple/></p:transition></p:sld>')
    const 结果 = await 读取pptx(await 构造有效演示([XML]))
    expect(结果.演示文稿.幻灯片列表[0].过渡效果).toBeUndefined()
    expect(结果.警告).toContain('幻灯片切换效果未完整导入')
  })

  it('导入推进方向及传统速度对应的持续时间', async () => {
    const XML = 空白幻灯片.replace('</p:sld>', '<p:transition spd="slow"><p:push dir="r"/></p:transition></p:sld>')
    const 结果 = await 读取pptx(await 构造有效演示([XML]))
    expect(结果.演示文稿.幻灯片列表[0].切换).toMatchObject({效果:'推进',方向:'右',持续毫秒:1000})
    expect(结果.警告).not.toContain('幻灯片切换效果未完整导入')
  })
})

describe('幻灯片备注往返', () => {
  it('多行备注随 PPTX 写入并重开', async () => {
    const 文件 = await 写入pptx({ 幻灯片: [
      { 文本: '第一页', 备注: '演讲提示第一行\n第二行' },
      { 文本: '第二页', 备注: '下一页提示' },
    ] })
    const 读回 = await 读取pptx(文件)
    expect(读回.演示文稿.幻灯片列表.map((页) => 页.备注)).toEqual(['演讲提示第一行\n第二行', '下一页提示'])
  })
})

describe('演示动画写入限制', () => {
  it('不能把无法保留的动画静默写成普通幻灯片', async () => {
    await expect(写入pptx({ 幻灯片: [{ 文本: '标题', 动画: '出现' }] })).rejects.toThrow('动画无法可靠保存')
  })
})

describe('pptxCodec', () => {
  it('两轮 PPTX 保存重开保留页面和文本框稳定标识', async () => {
    const 输入 = { 幻灯片: [{
      id: '页面-甲', 背景色: '#FFFFFF', 文本框: [{
        id: '标题-甲', x: 80, y: 60, width: 400, height: 80,
        text: '演示标题', 字号: 32, 颜色: '#000000', 对齐: 'left',
      }],
    }] }
    const 第一轮 = (await 读取pptx(await 写入pptx(输入))).演示文稿
    expect(第一轮.幻灯片列表[0].id).toBe('页面-甲')
    expect(第一轮.幻灯片列表[0].文本框列表[0].id).toBe('标题-甲')
    const 第二轮 = (await 读取pptx(await 写入pptx({ 幻灯片: 第一轮.幻灯片列表.map((页) => ({
      id: 页.id, 背景色: 页.背景色, 文本框: 页.文本框列表.map((框) => ({ ...框 })),
    })) }))).演示文稿
    expect(第二轮.幻灯片列表[0].id).toBe('页面-甲')
    expect(第二轮.幻灯片列表[0].文本框列表[0].id).toBe('标题-甲')
  })

  it('当前写入器遇到不支持的对象时拒绝有损保存', async () => {
    await expect(写入pptx({ 幻灯片: [{ 对象列表: [{ id: '图一', 类型: '图片' }] }] })).rejects.toThrow(/有损保存/)
  })

  describe('读取pptx', () => {
    // 注意：读取结果契约为 { 演示文稿: { 幻灯片列表, 当前索引 }, 警告 }。
    it('应该能读取有效 PPTX', async () => {
      const result = await 读取pptx(await 构造有效演示([文字幻灯片('测试文本')]))
      expect(result.演示文稿).toBeDefined()
      expect(result.演示文稿.幻灯片列表).toBeDefined()
      expect(result.演示文稿.当前索引).toBe(0)
      expect(result.警告).toBeDefined()
    })

    it('应该能提取幻灯片文本', async () => {
      const result = await 读取pptx(await 构造有效演示([文字幻灯片('第一页内容'), 文字幻灯片('第二页内容')]))
      expect(result.演示文稿.幻灯片列表.length).toBe(2)
      expect(result.演示文稿.幻灯片列表[0].title).toContain('第一页内容')
      expect(result.演示文稿.幻灯片列表[1].title).toContain('第二页内容')
    })

    it('应该返回 HTML 转义文本', async () => {
      const result = await 读取pptx(await 构造有效演示([文字幻灯片('转义&lt;测试&gt;')]))
      expect(result.演示文稿.幻灯片列表[0].title).toContain('转义<测试>')
    })

    it('应该解码数字字符引用', async () => {
      const result = await 读取pptx(await 构造有效演示([文字幻灯片('&#39;单引号&#x26;和号&#60;左尖括号&#62;右尖括号')]))
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

    it('缺失保存模型明确报错，不生成默认内容', async () => {
      await expect(写入pptx(null)).rejects.toThrow('缺少幻灯片列表')
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
    const 读回 = await 读取pptx(buffer)
    expect(读回.演示文稿.幻灯片列表[0].文本框列表[0].text).toBe('红蓝')
    expect(读回.警告).toContain('混合文字样式未完整导入')
  })
})

describe('读取 PPTX 的保真警告', () => {
  const 构造演示 = (幻灯片Xml, 额外文件 = {}) => 构造有效演示([幻灯片Xml], 额外文件)

  it('只有可导入文本时没有笼统警告', async () => {
    const 结果 = await 读取pptx(await 构造演示(文字幻灯片('正文')))
    expect(结果.警告).toEqual([])
  })

  it('图片、无文字图形和图表分别生成警告', async () => {
    const 数据 = await 构造演示(
      '<p:sld><p:cSld><p:spTree>' +
      '<p:pic/><p:sp><p:spPr><a:prstGeom prst="rect"/></p:spPr></p:sp>' +
      '<p:graphicFrame><a:graphic><a:graphicData uri="图表"/></a:graphic></p:graphicFrame>' +
      '</p:spTree></p:cSld></p:sld>'
    )
    const 结果 = await 读取pptx(数据)
    expect(结果.警告).toContain('图片未导入')
    expect(结果.警告).toContain('图形未导入')
    expect(结果.警告).toContain('图表或表格未导入')
  })

  it('只对幻灯片实际包含的媒体、动画和切换效果生成警告', async () => {
    const 数据 = await 构造演示(
      '<p:sld><p:cSld><p:spTree/></p:cSld><p:video/><p:timing/><p:transition><p:ripple/></p:transition></p:sld>',
      { 'ppt/media/orphan.mp4': '孤立媒体' }
    )
    const 结果 = await 读取pptx(数据)
    expect(结果.警告).toContain('媒体未导入')
    expect(结果.警告).toContain('动画未导入')
    expect(结果.警告).toContain('幻灯片切换效果未完整导入')
  })

  it('母版实际包含图形时提示母版对象未导入', async () => {
    const 数据 = await 构造演示(文字幻灯片('正文'), {
      'ppt/slides/_rels/slide1.xml.rels': '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>',
      'ppt/slideLayouts/slideLayout1.xml': '<p:sldLayout/>',
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels': '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>',
      'ppt/slideMasters/slideMaster1.xml': '<p:sldMaster><p:spTree><p:sp><p:spPr><a:prstGeom prst="star5"/></p:spPr></p:sp></p:spTree></p:sldMaster>',
    })
    const 结果 = await 读取pptx(数据)
    expect(结果.警告).toContain('母版图形未导入')
  })
})
