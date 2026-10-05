const { 写入pptx, 读取pptx } = require('../pptxCodec')
const JSZip = require('jszip')
const 页 = (效果) => ({ id: '页', 背景色: '#FFFFFF', 文本框: [{ id: '文字', text: '播放核验', x: 50, y: 60, width: 300, height: 100, 字号: 24 }], 切换: { 效果, 持续毫秒: 750, 方向: '右', 方式: '内', 轴: '垂直' }, 换片: { 单击: false, 自动毫秒: 2300 }, 隐藏: true })
it.each(['切换','换片'])('写入时拒绝显式空%s设置', async 键 => {
  await expect(写入pptx({幻灯片:[{...页('无'),[键]:null}]})).rejects.toThrow('参数')
})
it('外部全局放映范围与禁用计时不能被静默忽略', async () => {
  const zip=await JSZip.loadAsync(await 写入pptx({幻灯片:[页('无')],循环放映:true}))
  const p=await zip.file('ppt/presProps.xml').async('string');zip.file('ppt/presProps.xml',p.replace('useTimings="1"','useTimings="0"').replace('<p:sldAll/>','<p:sldRg st="1" end="1"/>'))
  expect((await 读取pptx(await zip.generateAsync({type:'nodebuffer'}))).警告).toContain('全局放映设置未完整导入')
})
it('单引号外部切换属性也能保留方向与时长', async () => {
  const zip=await JSZip.loadAsync(await 写入pptx({幻灯片:[页('擦除')]})), 路径='ppt/slides/slide1.xml', 原=await zip.file(路径).async('string')
  zip.file(路径,原.replace(/<p:transition\b[\s\S]*?<\/p:transition>/,t=>t.replaceAll('"',"'")))
  expect((await 读取pptx(await zip.generateAsync({type:'nodebuffer'}))).演示文稿.幻灯片列表[0].切换).toMatchObject({效果:'擦除',方向:'右',持续毫秒:750})
})
it.each(['无','淡入淡出','推进','切出','擦除','形状','抽出','分割'])('%s 原生参数两轮往返', async 效果 => {
  let 模型 = 页(效果)
  for (let i=0;i<2;i++) {
    const 文件 = await 写入pptx({ 幻灯片: [模型], 循环放映: true }), zip = await JSZip.loadAsync(文件), xml = await zip.file('ppt/slides/slide1.xml').async('string')
    expect(xml).toContain('advTm="2300"'); expect(xml).toContain('p14:dur="750"'); expect(xml).toContain('show="0"')
    const 读取 = await 读取pptx(文件), 结果 = 读取.演示文稿.幻灯片列表[0]
    expect(读取.警告).toEqual([]); expect(结果.切换).toEqual(模型.切换); expect(结果.换片).toEqual(模型.换片); expect(结果.隐藏).toBe(true); expect(读取.演示文稿.循环放映).toBe(true)
    模型 = { ...结果, 文本框: 结果.文本框列表 }
  }
})
it('原生对象动画保留目标、顺序、触发和时长，篡改原生内容仍告警', async () => {
  const 模型 = 页('淡入淡出'); 模型.动画序列 = ['出现','淡入','淡出','进入','退出'].map((效果,i) => ({ id: `动画${i}`, 对象标识: '文字', 效果, 触发: ['单击','同时','之后'][i%3], 持续毫秒: 500 }))
  const 文件 = await 写入pptx({ 幻灯片: [模型] }); const 结果 = await 读取pptx(文件)
  expect(结果.演示文稿.幻灯片列表[0].动画序列).toEqual(模型.动画序列); expect(结果.警告).toEqual([])
  const zip = await JSZip.loadAsync(文件), xml = await zip.file('ppt/slides/slide1.xml').async('string'); expect(xml).toContain('<p:timing>'); expect(xml).toContain('spid="2"')
  zip.file('ppt/slides/slide1.xml', xml.replace('filter="fade"', 'filter="blinds"'))
  expect((await 读取pptx(await zip.generateAsync({type:'nodebuffer'}))).警告).toContain('动画未导入')
})

it('出现动画原生时长不被写死为一毫秒', async () => {
  const 模型=页('无'); 模型.动画序列=[{id:'出现',对象标识:'文字',效果:'出现',触发:'单击',持续毫秒:500}]
  const zip=await JSZip.loadAsync(await 写入pptx({幻灯片:[模型]})), xml=await zip.file('ppt/slides/slide1.xml').async('string')
  expect(xml.match(/<p:set>[\s\S]*?<\/p:set>/)[0]).toContain('dur="500"')
})
