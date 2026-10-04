const { 写入pptx, 读取pptx } = require('../pptxCodec')
const JSZip = require('jszip')
const 图形 = { id: '原生矩形', 类型: '图形', x: 72, y: 60, width: 160, height: 80, 旋转: 37, 形状: { 种类: '矩形', 文本: '可编辑节点', 填充: '#FFFFFF', 线条: '#334455', 线宽: 2, 颜色: '#112233', 字号: 24, 加粗: false } }
const 单元 = 文本 => ({ 文本, 背景: '#FFFFFF', 颜色: '#112233', 字号: 18, 加粗: false, 对齐: 'left' })
const 表格 = { id: '原生表格', 类型: '表格', x: 300, y: 70, width: 400, height: 150, 表格: { 单元格: [[单元('合并标题'), 单元('')], [单元('收入'), { ...单元('128'), 背景: '#DDEEFF', 加粗: true }]], 行高: [75,75], 列宽: [200,200], 合并: [{ 行: 0, 列: 0, 行数: 1, 列数: 2 }] } }
describe('任务三原生往返', () => {
  it('原生形状被移到普通文字下面时给出图层风险', async () => {
    const 包 = await JSZip.loadAsync(await 写入pptx({ 幻灯片: [{id:'页',文本框:[],对象列表:[图形]}] }))
    const 路径 = 'ppt/slides/slide1.xml', xml = await 包.file(路径).async('string')
    包.file(路径,xml.replace('</p:spTree>','<p:sp><p:txBody><a:p><a:r><a:t>上层文字</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>'))
    const 结果 = await 读取pptx(await 包.generateAsync({type:'nodebuffer'}))
    expect(结果.警告).toContain('原生对象与普通文字图层未完整导入')
  })
  it('未知图形效果不可由本机元数据掩盖', async () => {
    const 包 = await JSZip.loadAsync(await 写入pptx({ 幻灯片: [{ id: '页', 文本框: [], 对象列表: [图形,表格] }] }))
    const 路径 = 'ppt/slides/slide1.xml'
    const xml = await 包.file(路径).async('string')
    包.file(路径,xml.replace('<a:prstGeom prst="rect">','<a:effectLst/><a:prstGeom prst="rect">'))
    const 结果 = await 读取pptx(await 包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.警告).toContain('原生对象已被外部修改，语义结构未完整导入')
    expect(结果.演示文稿.幻灯片列表[0].对象列表.some(项 => 项.id === 图形.id)).toBe(false)
  })
  it('原生组合包含图片以外节点且保留本机语义类型', async () => {
    const 列表 = [{ ...图形, id: '节点一' }, { ...图形, id: '节点二', x: 500 }, { id: '语义组', 类型: '组合', x: 72, y: 60, width: 600, height: 100, 子对象标识: ['节点一','节点二'], 语义类型: '层级' }]
    const 结果 = await 读取pptx(await 写入pptx({ 幻灯片: [{ id: '页', 文本框: [], 对象列表: 列表 }] }))
    expect(结果.警告).toEqual([])
    expect(结果.演示文稿.幻灯片列表[0].对象列表.find(项 => 项.id === '语义组')).toEqual(列表[2])
  })
  it('语义连线写为绑定原生节点连接点的连接器', async () => {
    const 甲 = { ...图形, id: '甲', 旋转: 0 }, 乙 = { ...图形, id: '乙', x: 500, 旋转: 0 }
    const 线 = { id: '线', 类型: '图形', x: 232, y: 100, width: 268, height: 1, 形状: { ...图形.形状, 种类: '连接线', 文本: '' }, 连接: { 起点: { 对象: '甲', 边: '右' }, 终点: { 对象: '乙', 边: '左' }, 起点位置: {x:232,y:100}, 终点位置: {x:500,y:100} } }
    const 数据 = await 写入pptx({ 幻灯片: [{ id:'页',文本框:[],对象列表:[线,甲,乙] }] })
    const 包 = await JSZip.loadAsync(数据), xml = await 包.file('ppt/slides/slide1.xml').async('string')
    expect(xml).toContain('<p:cxnSp>')
    expect(xml).toMatch(/<a:stCxn id="\d+" idx="3"\/>/)
    expect(xml).toMatch(/<a:endCxn id="\d+" idx="1"\/>/)
    const 结果 = await 读取pptx(数据)
    expect(结果.警告).toEqual([])
    expect(结果.演示文稿.幻灯片列表[0].对象列表).toEqual([线,甲,乙])
  })
  it('两轮重开保留原生形状旋转和表格合并格式', async () => {
    let 模型 = { 幻灯片: [{ id: '页', 背景色: '#FFFFFF', 文本框: [], 对象列表: [图形, 表格] }] }
    for (let 轮 = 0; 轮 < 2; 轮++) {
      const 数据 = await 写入pptx(模型)
      const 包 = await JSZip.loadAsync(数据)
      const xml = await 包.file('ppt/slides/slide1.xml').async('string')
      expect(xml).toContain('<a:tbl>'); expect(xml).toContain('gridSpan="2"'); expect(xml).toContain('rot="2220000"')
      const 结果 = await 读取pptx(数据)
      expect(结果.警告).toEqual([])
      expect(结果.演示文稿.幻灯片列表[0].对象列表).toEqual([图形, 表格])
      模型 = { 幻灯片: 结果.演示文稿.幻灯片列表.map(页 => ({ ...页, 文本框: 页.文本框列表 })) }
    }
  })
})
