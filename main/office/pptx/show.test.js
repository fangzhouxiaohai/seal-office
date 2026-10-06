const { 写入pptx, 读取pptx } = require('../pptxCodec')
const JSZip = require('jszip')
const 页 = (文本) => ({ id: `页-${文本}`, 背景色: '#FFFFFF', 文本框: [{ id: `框-${文本}`, text: 文本, x: 40, y: 60, width: 400, height: 80, 字号: 28 }] })
const 三页 = () => [页('一'), 页('二'), 页('三')]

async function 压缩包(模型) {
  return JSZip.loadAsync(await 写入pptx(模型))
}

it('自定义放映写入原生部件，两轮往返保持一致', async () => {
  let 模型 = {
    幻灯片: 三页(),
    自定义放映: [{ id: '放映甲', 名称: '验收甲', 页面标识列表: ['页-一', '页-三'] }, { id: '放映乙', 名称: '验收乙', 页面标识列表: ['页-二'] }],
    放映设置: { 范围: { 类型: '自定义放映', 放映标识: '放映甲' }, 换片方式: '手动' },
    循环放映: true,
  }
  for (let 轮 = 1; 轮 <= 2; 轮 += 1) {
    const 数据 = await 写入pptx(模型)
    const zip = await JSZip.loadAsync(数据)
    const 清单 = await zip.file('ppt/presentation.xml').async('string')
    const 属性 = await zip.file('ppt/presProps.xml').async('string')
    expect(清单).toContain('<p:custShowLst>')
    expect(清单).toContain('name="验收甲"')
    expect(清单).toMatch(/<p:custShow name="验收甲" id="1"><p:sldLst><p:sld r:id="rId2"\/><p:sld r:id="rId4"\/><\/p:sldLst><\/p:custShow>/)
    expect(清单.indexOf('<p:custShowLst>')).toBeGreaterThan(清单.indexOf('<p:notesSz'))
    expect(属性).toContain('<p:custShow id="1"/>')
    expect(属性).not.toContain('<p:sldAll/>')
    expect(属性).toContain('useTimings="0"')
    const 读取 = await 读取pptx(数据)
    expect(读取.警告).toEqual([])
    const 甲 = 读取.演示文稿.自定义放映.find(项 => 项.名称 === '验收甲')
    const 乙 = 读取.演示文稿.自定义放映.find(项 => 项.名称 === '验收乙')
    expect(甲.页面标识列表).toEqual(['页-一', '页-三'])
    expect(乙.页面标识列表).toEqual(['页-二'])
    expect(读取.演示文稿.放映设置).toEqual({ 范围: { 类型: '自定义放映', 放映标识: 甲.id }, 换片方式: '手动' })
    expect(读取.演示文稿.循环放映).toBe(true)
    // 第二轮写入读取结果后必须完全一致，证明原生标识按顺序稳定、引用不漂移
    if (轮 === 2) expect(读取.演示文稿.自定义放映).toEqual(模型.自定义放映)
    模型 = { ...读取.演示文稿, 幻灯片: 读取.演示文稿.幻灯片列表.map(页数据 => ({ ...页数据, 文本框: 页数据.文本框列表 })) }
  }
})

it('页码范围写入 sldRg，全部范围写回 sldAll 且不再保留自定义放映选择', async () => {
  const 页码模型 = { 幻灯片: 三页(), 放映设置: { 范围: { 类型: '页码范围', 起始: 2, 结束: 3 }, 换片方式: '使用计时' } }
  const 页码属性 = await (await 压缩包(页码模型)).file('ppt/presProps.xml').async('string')
  expect(页码属性).toContain('<p:sldRg st="2" end="3"/>')
  expect(页码属性).not.toContain('<p:custShow')
  expect((await 读取pptx(await 写入pptx(页码模型))).演示文稿.放映设置).toEqual(页码模型.放映设置)

  const 全部模型 = { 幻灯片: 三页(), 自定义放映: [{ id: '放映甲', 名称: '验收甲', 页面标识列表: ['页-一'] }], 放映设置: { 范围: { 类型: '全部' }, 换片方式: '使用计时' } }
  const 全部属性 = await (await 压缩包(全部模型)).file('ppt/presProps.xml').async('string')
  expect(全部属性).toContain('<p:sldAll/>')
  expect(全部属性).not.toContain('<p:custShow id=')
  expect(全部属性).not.toContain('useTimings="0"')
})

it('自定义放映按页面标识引用，页面顺序调整后引用不变', async () => {
  const 模型 = { 幻灯片: 三页(), 自定义放映: [{ id: '放映甲', 名称: '甲', 页面标识列表: ['页-三', '页-一'] }] }
  const 读取 = await 读取pptx(await 写入pptx({ ...模型, 幻灯片: [模型.幻灯片[2], 模型.幻灯片[0], 模型.幻灯片[1]] }))
  expect(读取.警告).toEqual([])
  expect(读取.演示文稿.自定义放映[0].页面标识列表).toEqual(['页-三', '页-一'])
})

it('外部文件的自定义放映引用缺失页面时丢弃该引用并告警，不假装完整导入', async () => {
  const zip = await 压缩包({ 幻灯片: 三页(), 自定义放映: [{ id: '放映甲', 名称: '甲', 页面标识列表: ['页-一'] }] })
  const 清单 = (await zip.file('ppt/presentation.xml').async('string')).replace('<p:sld r:id="rId2"/>', '<p:sld r:id="rId1"/>')
  zip.file('ppt/presentation.xml', 清单)
  const 读取 = await 读取pptx(await zip.generateAsync({ type: 'nodebuffer' }))
  expect(读取.演示文稿.自定义放映).toEqual([])
  expect(读取.警告).toContain('自定义放映未完整导入')
})

it('外部文件缺失自定义放映标识或名称时拒绝导入并告警', async () => {
  const zip = await 压缩包({ 幻灯片: 三页(), 自定义放映: [{ id: '放映甲', 名称: '甲', 页面标识列表: ['页-一'] }] })
  const 清单 = (await zip.file('ppt/presentation.xml').async('string')).replace(' id="1"', '')
  zip.file('ppt/presentation.xml', 清单)
  const 读取 = await 读取pptx(await zip.generateAsync({ type: 'nodebuffer' }))
  expect(读取.警告).toContain('自定义放映未完整导入')
})

it('显式空自定义放映设置被拒绝，不允许静默套用默认值', async () => {
  await expect(写入pptx({ 幻灯片: 三页(), 自定义放映: null })).rejects.toThrow('参数')
  await expect(写入pptx({ 幻灯片: 三页(), 放映设置: null })).rejects.toThrow('参数')
})

it('未知的全局放映子节点继续以警告保护来源文件', async () => {
  const zip = await 压缩包({ 幻灯片: 三页(), 放映设置: { 范围: { 类型: '全部' }, 换片方式: '使用计时' } })
  const 属性 = (await zip.file('ppt/presProps.xml').async('string')).replace('<p:sldAll/>', '<p:sldAll/><p:penClr><a:srgbClr val="FF0000"/></p:penClr>')
  zip.file('ppt/presProps.xml', 属性)
  expect((await 读取pptx(await zip.generateAsync({ type: 'nodebuffer' }))).警告).toContain('全局放映设置未完整导入')
})
