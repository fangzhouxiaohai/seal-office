const JSZip = require('jszip')
const { 写入pptx, 读取pptx } = require('../pptxCodec')
const { 生成版式标识 } = require('./masters')

const 主题 = {
  标识: '海豹-锐蓝',
  名称: '海豹锐蓝',
  配色: {
    背景1: '#FFFFFF', 文本1: '#10233F', 背景2: '#EEF3FF', 文本2: '#4A5C78',
    强调1: '#1B4FD8', 强调2: '#00A0C6', 强调3: '#F2994A', 强调4: '#6C4BD8', 强调5: '#C0392B', 强调6: '#147D8C',
    超链接: '#1B4FD8',
  },
  字体: { 标题: '微软雅黑', 正文: '微软雅黑' },
}

const 占位符标题 = { 标识: '占位-标题', 类型: '标题', x: 80, y: 60, width: 800, height: 120, 字号: 40, 对齐: 'center', 加粗: true, 颜色引用: '文本1' }
const 占位符正文 = { 标识: '占位-正文', 类型: '正文', x: 80, y: 220, width: 800, height: 240, 字号: 24, 对齐: 'left', 颜色引用: '文本1' }

const 母版列表 = [
  {
    标识: '默认母版',
    名称: '默认母版',
    背景填充: { 类型: '纯色', 颜色: '#FFFFFF' },
    版式列表: [
      { 标识: 生成版式标识('默认母版', '标题幻灯片'), 名称: '标题幻灯片', 母版标识: '默认母版', 占位符列表: [{ ...占位符标题, y: 140, height: 140, 字号: 44 }] },
      { 标识: 生成版式标识('默认母版', '标题和内容'), 名称: '标题和内容', 母版标识: '默认母版', 占位符列表: [占位符标题, 占位符正文] },
      { 标识: 生成版式标识('默认母版', '空白'), 名称: '空白', 母版标识: '默认母版', 占位符列表: [] },
    ],
  },
  {
    标识: '深色母版',
    名称: '深色母版',
    背景填充: { 类型: '纯色', 颜色: '#1B1F27' },
    版式列表: [
      { 标识: 生成版式标识('深色母版', '标题和内容'), 名称: '标题和内容', 母版标识: '深色母版', 占位符列表: [{ ...占位符标题, 颜色引用: '文本1' }] },
    ],
  },
]

const 造模型 = () => ({
  循环放映: false,
  主题,
  母版列表,
  页面尺寸: { 宽: 960, 高: 720 },
  页脚设置: { 页脚文本: '海豹办公', 显示日期: true, 日期文本: '2026-10-04', 显示页码: true, 首页不显示: true },
  资源条目: [],
  幻灯片: [
    {
      id: 'slide-a',
      背景色: '#FFFFFF',
      版式标识: 生成版式标识('默认母版', '标题和内容'),
      母版标识: '默认母版',
      背景填充: { 类型: '渐变', 起始色: '#FFFFFF', 结束色: '#DCE6FF', 角度: 90 },
      备注: '第一页备注',
      文本框: [
        {
          id: 'box-标题', x: 80, y: 60, width: 800, height: 120, text: '主题色标题', 字号: 40, 加粗: true, 斜体: false, 下划线: false,
          颜色: '#10233F', 颜色引用: '文本1', 字体: '微软雅黑', 对齐: 'center', 片段: [],
          占位符: '标题', 占位符标识: '占位-标题', 占位符继承: true,
        },
        {
          id: 'box-显式黑', x: 80, y: 220, width: 800, height: 100, text: '显式黑色标题', 字号: 32, 加粗: true, 斜体: false, 下划线: false,
          颜色: '#000000', 字体: '微软雅黑', 对齐: 'left', 片段: [],
        },
      ],
    },
    {
      id: 'slide-b',
      背景色: '#1B1F27',
      版式标识: 生成版式标识('深色母版', '标题和内容'),
      母版标识: '深色母版',
      文本框: [
        {
          id: 'box-二页', x: 60, y: 60, width: 840, height: 120, text: '第二页标题', 字号: 40, 加粗: true, 斜体: false, 下划线: false,
          颜色: '#10233F', 颜色引用: '文本1', 字体: '微软雅黑', 对齐: 'left', 片段: [],
          占位符: '标题', 占位符标识: '占位-标题', 占位符继承: true,
        },
      ],
    },
  ],
})

describe('主题、母版、页面尺寸与背景的真实文件往返', () => {
  it('写入后压缩包内含真实主题、母版、版式、页面尺寸与背景部件', async () => {
    const 数据 = await 写入pptx(造模型())
    const 包 = await JSZip.loadAsync(数据)
    const 主题Xml = await 包.file('ppt/theme/theme1.xml').async('string')
    expect(主题Xml).toContain('<a:clrScheme name="海豹锐蓝">')
    expect(主题Xml).toMatch(/<a:dk1><a:srgbClr val="10233F"\/><\/a:dk1>/)
    expect(主题Xml).toContain('<a:majorFont><a:latin typeface="微软雅黑"')

    const 清单 = await 包.file('ppt/presentation.xml').async('string')
    expect(清单).toContain('<p:sldSz cx="12192000" cy="9144000"/>')
    expect((清单.match(/<p:sldMasterId /g) ?? [])).toHaveLength(2)

    const 母版一 = await 包.file('ppt/slideMasters/slideMaster1.xml').async('string')
    expect(母版一).toContain('<p:cSld name="默认母版"')
    // 索引中的内容类型必须为每个母版与版式登记真实的 Override
    const 类型 = await 包.file('[Content_Types].xml').async('string')
    expect(类型).toContain('/ppt/slideMasters/slideMaster1.xml')
    expect(类型).toContain('/ppt/slideMasters/slideMaster2.xml')
    expect(类型).toContain('/ppt/theme/theme1.xml')

    const 版式 = await 包.file('ppt/slideLayouts/slideLayout2.xml').async('string')
    expect(版式).toContain('<p:cSld name="标题幻灯片"')
    const 版式关系 = await 包.file('ppt/slideLayouts/_rels/slideLayout2.xml.rels').async('string')
    expect(版式关系).toContain('slideMasters/slideMaster1.xml')

    const 第一页 = await 包.file('ppt/slides/slide1.xml').async('string')
    expect(第一页).toContain('<a:gradFill')
    expect(第一页).toContain('<a:schemeClr val="tx1"/>')
    expect(第一页).toContain('<a:srgbClr val="000000"/>')
    // 首页不显示页脚：第一页没有页脚形状，第二页有原生页码字段
    expect(第一页).not.toContain('type="slidenum"')
    const 第二页Xml = await 包.file('ppt/slides/slide2.xml').async('string')
    expect(第二页Xml).toContain('type="slidenum"')
    expect(第二页Xml).toContain('>海豹办公<')
    // 图片背景之外的对象与备注仍在
    const 备注 = await 包.file('ppt/notesSlides/notesSlide1.xml').async('string')
    expect(备注).toContain('第一页备注')
  })

  it('本机读回还原主题、母版版式、页面尺寸、背景、页脚与主题色引用', async () => {
    const 数据 = await 写入pptx(造模型())
    const 结果 = await 读取pptx(数据)
    const 文稿 = 结果.演示文稿
    expect(文稿.主题.名称).toBe('海豹锐蓝')
    expect(文稿.主题.配色.文本1).toBe('#10233F')
    expect(文稿.主题.配色.强调1).toBe('#1B4FD8')
    expect(文稿.主题.字体.标题).toBe('微软雅黑')
    expect(文稿.页面尺寸).toEqual({ 宽: 960, 高: 720 })
    expect(文稿.母版列表.map((项) => 项.标识)).toEqual(['默认母版', '深色母版'])
    const 版式 = 文稿.母版列表[0].版式列表
    expect(版式.map((项) => 项.名称)).toEqual(['标题幻灯片', '标题和内容', '空白'])
    expect(版式[1].占位符列表.map((项) => 项.标识)).toEqual(['占位-标题', '占位-正文'])
    expect(版式[1].占位符列表[0].x).toBeCloseTo(80, 0)
    expect(版式[1].占位符列表[0].字号).toBe(40)
    expect(文稿.母版列表[0].背景填充).toEqual({ 类型: '纯色', 颜色: '#FFFFFF' })

    const 第一页 = 文稿.幻灯片列表[0]
    expect(第一页.版式标识).toBe(生成版式标识('默认母版', '标题和内容'))
    expect(第一页.母版标识).toBe('默认母版')
    expect(第一页.背景填充).toEqual({ 类型: '渐变', 起始色: '#FFFFFF', 结束色: '#DCE6FF', 角度: 90 })
    expect(第一页.备注).toBe('第一页备注')
    const 标题框 = 第一页.文本框列表.find((框) => 框.text === '主题色标题')
    expect(标题框.颜色引用).toBe('文本1')
    expect(标题框.颜色).toBe('#10233F')
    expect(标题框.占位符).toBe('标题')
    expect(标题框.占位符标识).toBe('占位-标题')
    expect(标题框.占位符继承).toBe(true)
    const 显式黑 = 第一页.文本框列表.find((框) => 框.text === '显式黑色标题')
    expect(显式黑.颜色).toBe('#000000')
    expect(显式黑.颜色引用).toBeUndefined()

    const 第二页 = 文稿.幻灯片列表[1]
    expect(第二页.母版标识).toBe('深色母版')
    expect(第二页.主题标识).toBeUndefined()

    // 页脚、日期与页码：首页不显示，其余页保留设置
    expect(文稿.页脚设置.页脚文本).toBe('海豹办公')
    expect(文稿.页脚设置.显示页码).toBe(true)
    expect(文稿.页脚设置.首页不显示).toBe(true)
    expect(第一页.页脚).toBeNull()
    expect(第二页.页脚?.显示页码).toBe(true)
    expect(结果.警告.join()).not.toContain('页面尺寸未完整导入')
  })

  it('文字、图片、备注与切换不因设计功能往返丢失', async () => {
    const 模型 = 造模型()
    模型.幻灯片[0].文本框.push({
      id: 'box-正文', x: 80, y: 220, width: 800, height: 240, text: '正文内容', 字号: 24, 加粗: false, 斜体: false, 下划线: false,
      颜色: '#10233F', 颜色引用: '文本1', 字体: '微软雅黑', 对齐: 'left', 片段: [],
      占位符: '正文', 占位符标识: '占位-正文', 占位符继承: true,
    })
    模型.幻灯片[0].切换 = { 效果: '淡入淡出', 持续毫秒: 700, 方向: '左', 方式: '外', 轴: '水平' }
    const 数据 = await 写入pptx(模型)
    const 结果 = await 读取pptx(数据)
    const 文本列表 = 结果.演示文稿.幻灯片列表.flatMap((页) => 页.文本框列表.map((框) => 框.text))
    expect(文本列表).toContain('正文内容')
    expect(文本列表).toContain('显式黑色标题')
    expect(文本列表).toContain('第二页标题')
    expect(结果.演示文稿.幻灯片列表[0].切换.持续毫秒).toBe(700)
    expect(结果.演示文稿.幻灯片列表[0].备注).toBe('第一页备注')
  })
})
