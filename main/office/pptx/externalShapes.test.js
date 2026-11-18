const pptxgen = require('pptxgenjs')
const JSZip = require('jszip')
const { 读取pptx, 写入pptx } = require('../pptxCodec')

it('外部演示的矩形、圆角卡片、椭圆与横线可以编辑后写回原生图形', async () => {
  const deck = new pptxgen()
  const slide = deck.addSlide()
  slide.addText('标题', { x:.2, y:.2, w:3, h:.5 })
  slide.addShape(deck.ShapeType.rect, { x:1, y:1, w:2, h:1, fill:{ color:'FFF000' } })
  slide.addText('项目𠮷', { shape:deck.ShapeType.roundRect, x:2, y:2, w:1, h:.5, rotate:10,
    color:'001122', fontFace:'Arial', fontSize:14, bold:true, align:'right',
    fill:{ color:'AACCDD' }, line:{ color:'AABB00', width:2 } })
  slide.addShape(deck.ShapeType.ellipse, { x:2, y:1, w:2, h:1 })
  slide.addShape(deck.ShapeType.line, { x:2, y:4, w:1, h:0, line:{ color:'001122', width:1 } })
  const { 演示文稿, 警告 } = await 读取pptx(await deck.write({outputType:'nodebuffer'}))
  const page = 演示文稿.幻灯片列表[0]
  expect(page.文本框列表.map(box => box.text)).toEqual(['标题'])
  expect(page.对象列表.map(obj => obj.形状.种类)).toEqual(['矩形','圆角矩形','椭圆','直线'])
  expect(警告.filter(text => /图形未导入/.test(text))).toEqual([])
  expect(page.对象列表[1]).toMatchObject({x:144, y:144, width:72, height:36, 旋转:10,
    形状:{文本:'项目𠮷', 填充:'#AACCDD', 线条:'#AABB00', 线宽:2, 颜色:'#001122', 字体:'Arial', 字号:14, 加粗:true, 对齐:'right'}})
  page.对象列表[1].形状.文本 = '修改后的卡片'
  const saved = await 写入pptx({幻灯片:[{...page, 文本框:page.文本框列表}]})
  const xml = await (await JSZip.loadAsync(saved)).file('ppt/slides/slide1.xml').async('string')
  expect(xml).toContain('prst="roundRect"')
  expect(xml).toContain('cy="0"')
  expect((await 读取pptx(saved)).演示文稿.幻灯片列表[0].对象列表).toEqual(page.对象列表)
})
