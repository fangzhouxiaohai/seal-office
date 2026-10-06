const JSZip = require('jszip')
const pptxgen = require('pptxgenjs')
const {
  版式转母版参数,
  读取版式占位符,
  读取母版结构,
  写入多母版,
  生成母版标识,
  生成版式标识,
} = require('./masters')

const 主题 = {
  标识: '海豹-锐蓝',
  名称: '海豹锐蓝',
  配色: { 背景1: '#FFFFFF', 文本1: '#10233F', 背景2: '#EEF3FF', 文本2: '#4A5C78', 强调1: '#1B4FD8', 强调2: '#00A0C6', 强调3: '#F2994A', 强调4: '#6C4BD8', 强调5: '#C0392B', 强调6: '#147D8C', 超链接: '#1B4FD8' },
  字体: { 标题: '微软雅黑', 正文: '微软雅黑' },
}

const 造母版列表 = () => ([
  {
    标识: '默认母版',
    名称: '默认母版',
    背景填充: { 类型: '纯色', 颜色: '#FFFFFF' },
    版式列表: [
      { 标识: 生成版式标识('默认母版', '标题幻灯片'), 名称: '标题幻灯片', 母版标识: '默认母版', 占位符列表: [{ 标识: '占位-标题', 类型: '标题', x: 80, y: 140, width: 800, height: 140, 字号: 44, 对齐: 'center', 加粗: true, 颜色引用: '文本1' }] },
      {
        标识: 生成版式标识('默认母版', '标题和内容'), 名称: '标题和内容', 母版标识: '默认母版',
        占位符列表: [
          { 标识: '占位-标题', 类型: '标题', x: 80, y: 60, width: 800, height: 120, 字号: 40, 对齐: 'center', 加粗: true, 颜色引用: '文本1' },
          { 标识: '占位-正文', 类型: '正文', x: 80, y: 220, width: 800, height: 240, 字号: 24, 对齐: 'left', 颜色引用: '文本1' },
        ],
      },
      { 标识: 生成版式标识('默认母版', '空白'), 名称: '空白', 母版标识: '默认母版', 占位符列表: [] },
    ],
  },
  {
    标识: '深色母版',
    名称: '深色母版',
    背景填充: { 类型: '纯色', 颜色: '#1B1F27' },
    版式列表: [
      { 标识: 生成版式标识('深色母版', '标题和内容'), 名称: '标题和内容', 母版标识: '深色母版', 占位符列表: [{ 标识: '占位-标题', 类型: '标题', x: 60, y: 60, width: 840, height: 120, 字号: 40, 对齐: 'left', 加粗: true, 颜色引用: '文本1' }] },
    ],
  },
])

/** 用与 写入pptx 相同的方式生成包含母版与版式的真实包 */
async function 生成基础包(母版列表) {
  const 文稿 = new pptxgen()
  文稿.layout = 'LAYOUT_WIDE'
  for (const 母版 of 母版列表) {
    for (const 版式 of 母版.版式列表) 文稿.defineSlideMaster(版式转母版参数(母版, 版式, 主题))
  }
  const 首页 = 母版列表[0].版式列表[1]
  文稿.addSlide({ masterName: 版式转母版参数(母版列表[0], 首页, 主题).title })
  const 包 = await JSZip.loadAsync(Buffer.from(await 文稿.write({ outputType: 'arraybuffer' })))
  return 包
}

describe('母版与版式部件', () => {
  it('版式转母版参数携带背景、占位符与页码开关', () => {
    const 母版列表 = 造母版列表()
    const 参数 = 版式转母版参数(母版列表[0], 母版列表[0].版式列表[1], 主题)
    expect(参数.title).toBe(生成版式标识('默认母版', '标题和内容'))
    expect(参数.background).toEqual({ color: 'FFFFFF' })
    expect(参数.objects).toHaveLength(2)
    const 标题 = 参数.objects[0].placeholder.options
    expect(标题.type).toBe('title')
    expect(标题.w).toBeCloseTo(800 / 72, 3)
    expect(标题.h).toBeCloseTo(120 / 72, 3)
    expect(标题.fontFace).toBe('微软雅黑')
    expect(标题.fontSize).toBe(40)
    expect(参数.slideNumber).toBeUndefined()
  })

  it('读取版式占位符还原类型、位置与字号', async () => {
    const 母版列表 = 造母版列表()
    const 包 = await 生成基础包(母版列表)
    const xml = await 包.file('ppt/slideLayouts/slideLayout2.xml').async('string')
    const 占位符列表 = 读取版式占位符(xml)
    expect(占位符列表.map((项) => 项.标识)).toEqual(['占位-标题'])
    const 标题 = 占位符列表[0]
    expect(标题.类型).toBe('标题')
    expect(标题.x).toBeCloseTo(80, 0)
    expect(标题.y).toBeCloseTo(140, 0)
    expect(标题.width).toBeCloseTo(800, 0)
    expect(标题.height).toBeCloseTo(140, 0)
    expect(标题.字号).toBe(44)
    expect(标题.对齐).toBe('center')
    expect(标题.加粗).toBe(true)
  })

  it('读取母版结构还原母版、版式与幻灯片归属', async () => {
    const 母版列表 = 造母版列表()
    const 包 = await 生成基础包(母版列表)
    await 写入多母版(包, 母版列表)
    const 结构 = await 读取母版结构(包)
    expect(结构.母版列表.map((项) => 项.标识)).toEqual(['默认母版', '深色母版'])
    expect(结构.母版列表[0].版式列表.map((项) => 项.名称)).toEqual(['标题幻灯片', '标题和内容', '空白'])
    expect(结构.母版列表[0].版式列表[1].占位符列表.map((项) => 项.标识)).toEqual(['占位-标题', '占位-正文'])
    expect(结构.幻灯片位置['ppt/slides/slide1.xml'].版式标识).toBe(生成版式标识('默认母版', '标题和内容'))
    expect(结构.母版列表[0].背景填充).toEqual({ 类型: '纯色', 颜色: '#FFFFFF' })
  })

  it('写入多母版生成真实母版部件、关系与内容类型', async () => {
    const 母版列表 = 造母版列表()
    const 包 = await 生成基础包(母版列表)
    await 写入多母版(包, 母版列表)
    expect(包.file('ppt/slideMasters/slideMaster2.xml')).toBeTruthy()
    const 母版二 = await 包.file('ppt/slideMasters/slideMaster2.xml').async('string')
    expect(母版二).toContain('<p:cSld name="深色母版"')
    expect(母版二).toMatch(/<a:solidFill><a:srgbClr val="1B1F27"\/><\/a:solidFill>/)
    const 清单 = await 包.file('ppt/presentation.xml').async('string')
    expect((清单.match(/<p:sldMasterId /g) ?? [])).toHaveLength(2)
    const 清单关系 = await 包.file('ppt/_rels/presentation.xml.rels').async('string')
    expect(清单关系).toContain('slideMasters/slideMaster2.xml')
    const 类型 = await 包.file('[Content_Types].xml').async('string')
    expect(类型).toContain('/ppt/slideMasters/slideMaster2.xml')
    const 关系二 = await 包.file('ppt/slideMasters/_rels/slideMaster2.xml.rels').async('string')
    expect(关系二).toContain('slideLayouts/slideLayout5.xml')
    const 版式关系 = await 包.file('ppt/slideLayouts/_rels/slideLayout5.xml.rels').async('string')
    expect(版式关系).toContain('slideMasters/slideMaster2.xml')
    // 读取链路必须按关系还原两个母版
    const 结构 = await 读取母版结构(包)
    expect(结构.母版列表.map((项) => 项.标识)).toEqual(['默认母版', '深色母版'])
    expect(结构.母版列表[1].背景填充).toEqual({ 类型: '纯色', 颜色: '#1B1F27' })
  })

  it('生成标识可稳定还原', () => {
    expect(生成版式标识('默认母版', '标题和内容')).toBe('默认母版::标题和内容')
    expect(生成母版标识('默认母版')).toBe('默认母版')
  })
})
