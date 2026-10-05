const { 写入pptx, 读取pptx } = require('../pptxCodec')
const JSZip = require('jszip')
const ExcelJS = require('exceljs')
const fs = require('fs')
const 图表 = 种类 => ({ id: `图表-${种类}`, 类型: '图表', x: 80, y: 70, width: 720, height: 390, 图表: { 种类, 标题: '季度收入', 分类: ['第一季度','第二季度','第三季度'], 系列: [{ id: 'series-4', 名称: '华东', 数值: [12,24,18], 颜色: '#2B6CF6' }, ...(种类 === '饼图' ? [] : [{id:'series-8',名称:'华南',数值:[8,-4,16],颜色:'#718096'}])], 图例: '下', 横轴标题: '季度', 纵轴标题: '万元', 显示横轴: true, 显示纵轴: true, 数值格式: '#,##0' } })
const 模型 = 对象 => ({ 幻灯片: 对象.map((项,i) => ({id:`页${i}`,文本框:[],对象列表:[项]})) })
describe('原生图表和嵌入数据', () => {
  it('三类图表两轮保存重开，图表缓存和工作簿实际单元格一致', async () => {
    let 对象 = ['柱状图','折线图','饼图'].map(图表)
    for (let 轮=1;轮<=2;轮++) {
      const 字节=await 写入pptx(模型(对象)),包=await JSZip.loadAsync(字节)
      fs.mkdirSync('E:/Temp/ppt-task4',{recursive:true});fs.writeFileSync(`E:/Temp/ppt-task4/原生图表第${轮}轮.pptx`,字节)
      for (let i=0;i<3;i++) {
        const 图=await 包.file(`ppt/charts/seal-chart-${i+1}-1.xml`).async('string')
        expect(图).toContain(`<c:${['barChart','lineChart','pieChart'][i]}>`)
        expect(图).toContain('<c:externalData r:id="data"')
        expect(图).toContain('<c:idx val="4"/>')
        const 簿=new ExcelJS.Workbook();await 簿.xlsx.load(await 包.file(`ppt/embeddings/seal-chart-${i+1}-1.xlsx`).async('nodebuffer'))
        expect(簿.worksheets[0].getCell('B2').value).toBe(对象[i].图表.系列[0].数值[0])
      }
      const 结果=await 读取pptx(字节)
      expect(结果.警告).toEqual([])
      expect(结果.演示文稿.幻灯片列表.map(页=>页.对象列表[0])).toEqual(对象)
      对象=结果.演示文稿.幻灯片列表.map(页=>页.对象列表[0]);对象[0].图表.系列[0].数值[0]=35
    }
  })
  it('饼图分类颜色与折线标记写入实际原生样式', async () => {
    const 包=await JSZip.loadAsync(await 写入pptx(模型([图表('饼图'),图表('折线图')])))
    const 饼=await 包.file('ppt/charts/seal-chart-1-1.xml').async('string'),线=await 包.file('ppt/charts/seal-chart-2-1.xml').async('string')
    expect(饼.match(/<c:dPt>/g)).toHaveLength(3)
    expect(饼).toContain('<a:srgbClr val="718096"/>')
    expect(线).toContain('<c:marker><c:symbol val="circle"/>')
  })
  it('损坏数值和不支持属性直接拒绝保存，不写默认数据', async () => {
    const 对象=图表('柱状图');对象.图表.系列[0].数值[0]=NaN
    await expect(写入pptx(模型([对象]))).rejects.toThrow(/图表/)
  })
  it('读取工作簿真实数据，缓存不一致与未知效果必须警告', async () => {
    const 包=await JSZip.loadAsync(await 写入pptx(模型([图表('柱状图')])))
    const 路径='ppt/embeddings/seal-chart-1-1.xlsx',簿=new ExcelJS.Workbook()
    await 簿.xlsx.load(await 包.file(路径).async('nodebuffer'));簿.worksheets[0].getCell('B2').value=99;包.file(路径,await 簿.xlsx.writeBuffer())
    const 图路径='ppt/charts/seal-chart-1-1.xml';包.file(图路径,(await 包.file(图路径).async('string')).replace('<c:plotArea>','<c:plotArea><c:layout/>'))
    const 结果=await 读取pptx(await 包.generateAsync({type:'nodebuffer'}))
    expect(结果.演示文稿.幻灯片列表[0].对象列表[0].图表.系列[0].数值[0]).toBe(99)
    expect(结果.警告).toContain('图表缓存与嵌入工作簿不一致，已读取工作簿实际数据')
    expect(结果.警告).toContain('图表外部属性未完整导入')
  })
  it('组合图表、锁定、隐藏坐标轴、百分比与系列删除两轮保留', async () => {
    const 对象=图表('折线图');对象.锁定=true;对象.图表.显示横轴=false;对象.图表.图例='无';对象.图表.数值格式='0.00%';对象.图表.系列.splice(0,1)
    const 组={id:'图表组合',类型:'组合',x:80,y:70,width:720,height:390,子对象标识:[对象.id]}
    let 模={幻灯片:[{id:'组合页',文本框:[],对象列表:[组,对象]}]}
    for(let i=0;i<2;i++){
      const 结果=await 读取pptx(await 写入pptx(模))
      expect(结果.警告).toEqual([])
      expect(结果.演示文稿.幻灯片列表[0].对象列表).toEqual([组,对象])
      模={幻灯片:结果.演示文稿.幻灯片列表.map(页=>({...页,文本框:页.文本框列表}))}
    }
  })
  it('拒绝重复原生编号与外部不支持的图表字段', async () => {
    const 对象=图表('柱状图');对象.图表.系列[1].id='series-04'
    await expect(写入pptx(模型([对象]))).rejects.toThrow(/图表/)
    对象.图表.系列[1].id='series-8';对象.图表.自定义效果=true
    await expect(写入pptx(模型([对象]))).rejects.toThrow(/未知属性/)
  })
  it('图表之后的普通文字及工作簿额外内容不能静默丢失', async () => {
    const 包=await JSZip.loadAsync(await 写入pptx(模型([图表('柱状图')])))
    const 页路径='ppt/slides/slide1.xml'
    包.file(页路径,(await 包.file(页路径).async('string')).replace('</p:spTree>','<p:sp><p:txBody><a:p><a:r><a:t>上层备注</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>'))
    const 路径='ppt/embeddings/seal-chart-1-1.xlsx',簿=new ExcelJS.Workbook()
    await 簿.xlsx.load(await 包.file(路径).async('nodebuffer'));簿.addWorksheet('外部资料').getCell('A1').value='保留来源';包.file(路径,await 簿.xlsx.writeBuffer())
    const 结果=await 读取pptx(await 包.generateAsync({type:'nodebuffer'}))
    expect(结果.警告).toContain('图表与文字图层未完整导入')
    expect(结果.警告).toContain('图表数据工作簿外部内容未完整导入')
  })
  it('工作簿缺失不能以缓存冒充可编辑图表', async () => {
    const 包=await JSZip.loadAsync(await 写入pptx(模型([图表('折线图')])))
    包.remove('ppt/embeddings/seal-chart-1-1.xlsx')
    await expect(读取pptx(await 包.generateAsync({type:'nodebuffer'}))).rejects.toThrow(/工作簿|部件/)
  })
})

describe('外部图表标识与对象树', () => {
  const 重命名 = async (字节, 标识列表) => {
    const 包 = await JSZip.loadAsync(字节), 路径 = 'ppt/slides/slide1.xml'
    let xml = await 包.file(路径).async('string')
    for (const id of 标识列表) xml = xml.replace(`name="seal-id:${Buffer.from(id).toString('base64url')}"`, 'name="外部对象名称"')
    包.file(路径, xml)
    return 包.generateAsync({ type: 'nodebuffer' })
  }
  it.each([false, true])('图表外部重命名后保留嵌套锁定组合和实际成员，组合也重命名=%s', async 重命名组合 => {
    const 对象 = 图表('柱状图')
    const 内组 = { id: '内层组合', 类型: '组合', x: 80, y: 70, width: 720, height: 390, 子对象标识: [对象.id] }
    const 外组 = { ...内组, id: '外层锁定组', 锁定: true, 子对象标识: [内组.id] }
    const 原字节 = await 写入pptx({ 幻灯片: [{ id: '页', 文本框: [], 对象列表: [外组, 内组, 对象] }] })
    let 结果 = await 读取pptx(await 重命名(原字节, [对象.id, ...(重命名组合 ? [内组.id, 外组.id] : [])]))
    expect(结果.警告).toContain('图表外部属性未完整导入')
    expect(结果.警告).not.toContain('组合非图片成员未完整导入')
    const 列表 = 结果.演示文稿.幻灯片列表[0].对象列表
    expect(列表.map(项 => 项.类型)).toEqual(['组合', '组合', '图表'])
    expect(列表[0].锁定).toBe(true)
    expect(列表[0].子对象标识).toEqual([列表[1].id])
    expect(列表[1].子对象标识).toEqual([列表[2].id])
    expect(列表[2].图表).toEqual(对象.图表)
    结果 = await 读取pptx(await 写入pptx({ 幻灯片: 结果.演示文稿.幻灯片列表.map(页 => ({ ...页, 文本框: 页.文本框列表 })) }))
    expect(结果.演示文稿.幻灯片列表[0].对象列表).toEqual(列表)
  })
  it('外部重命名同名图表保持与原生形状交错的图层顺序', async () => {
    const 形状 = id => ({ id, 类型: '图形', x: 60, y: 60, width: 120, height: 80, 形状: { 种类: '矩形', 文本: id, 填充: '#FFFFFF', 线条: '#334455', 线宽: 1, 颜色: '#112233', 字号: 20, 加粗: false } })
    const 甲 = 图表('柱状图'), 乙 = 图表('折线图')
    const 原字节 = await 写入pptx({ 幻灯片: [{ id: '页', 文本框: [], 对象列表: [形状('底层'), 甲, 形状('中层'), 乙, 形状('顶层')] }] })
    const 结果 = await 读取pptx(await 重命名(原字节, [甲.id, 乙.id]))
    const 列表 = 结果.演示文稿.幻灯片列表[0].对象列表
    expect(列表.map(项 => 项.形状?.文本 ?? 项.图表?.种类)).toEqual(['底层', '柱状图', '中层', '折线图', '顶层'])
    expect(new Set(列表.map(项 => 项.id)).size).toBe(5)
    expect(结果.警告).toContain('图表外部属性未完整导入')
  })
  it('真正缺失的组合成员仍警告且不能伪造组合', async () => {
    const 对象 = 图表('柱状图'), 组 = { id: '组合', 类型: '组合', x: 80, y: 70, width: 720, height: 390, 子对象标识: [对象.id] }
    const 包 = await JSZip.loadAsync(await 写入pptx({ 幻灯片: [{ id: '页', 文本框: [], 对象列表: [组, 对象] }] }))
    const 路径 = 'ppt/slides/slide1.xml'
    包.file(路径, (await 包.file(路径).async('string')).replace(/<p:graphicFrame\b[^>]*>[\s\S]*?<\/p:graphicFrame>/, ''))
    const 结果 = await 读取pptx(await 包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.警告).toContain('组合非图片成员未完整导入')
    expect(结果.演示文稿.幻灯片列表[0].对象列表 ?? []).toEqual([])
  })
})
