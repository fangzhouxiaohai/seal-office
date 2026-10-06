const { 写入切换, 读取切换 } = require('./transitions')

const 设置 = (效果, 额外 = {}) => ({ 效果, 持续毫秒: 700, 方向: '左', 方式: '外', 轴: '水平', ...额外 })
const 页 = 切换 => ({ 切换 })

it.each([
  ['溶解', '<p:dissolve/>'],
  ['涟漪', '<p14:ripple/>'],
  ['新闻快报', '<p:newsflash/>'],
  ['轮辐', '<p:wheel spokes="4"/>'],
  ['百叶窗', '<p:blinds dir="horz"/>'],
  ['梳理', '<p:comb dir="horz"/>'],
  ['平滑', '<p14:morph option="byObject"/>'],
])('%s 写入原生切换并可无风险读回', (效果, 片段) => {
  const xml = 写入切换(页(设置(效果)))
  expect(xml).toContain(片段)
  const 读 = 读取切换(`<p:sld>${xml}</p:sld>`)
  expect(读.风险).toBe(false)
  expect(读.切换).toMatchObject({ 效果, 持续毫秒: 700 })
})

it('轮辐写入登记的辐条根数并读回', () => {
  const xml = 写入切换(页(设置('轮辐', { 辐条: 8 })))
  expect(xml).toContain('<p:wheel spokes="8"/>')
  expect(读取切换(`<p:sld>${xml}</p:sld>`).切换.辐条).toBe(8)
})

it('百叶窗与梳理按轴写入水平或垂直方向', () => {
  for (const [效果, 轴, 方向] of [['百叶窗', '垂直', 'vert'], ['梳理', '垂直', 'vert'], ['百叶窗', '水平', 'horz'], ['梳理', '水平', 'horz']]) {
    const xml = 写入切换(页(设置(效果, { 轴 })))
    expect(xml).toContain(`dir="${方向}"`)
    expect(读取切换(`<p:sld>${xml}</p:sld>`).切换.轴).toBe(轴)
  }
})

it('平滑只支持按对象插值，其它原生选项判为未完整导入', () => {
  const xml = 写入切换(页(设置('平滑'))).replace('option="byObject"', 'option="byWord"')
  expect(读取切换(`<p:sld>${xml}</p:sld>`).风险).toBe(true)
})

it('未登记的原生高级切换判为风险而不是静默降级', () => {
  const xml = 写入切换(页(设置('溶解'))).replace('<p:dissolve/>', '<p:checker/>')
  expect(读取切换(`<p:sld>${xml}</p:sld>`).风险).toBe(true)
})

it('全部切换效果都能完成两轮读写一致', () => {
  for (const 效果 of ['无', '淡入淡出', '推进', '切出', '擦除', '形状', '抽出', '分割', '溶解', '涟漪', '新闻快报', '轮辐', '百叶窗', '梳理', '平滑']) {
    const 原 = 设置(效果)
    const 文件 = 写入切换(页(原)), 读 = 读取切换(`<p:sld>${文件}</p:sld>`)
    expect(读.风险, `${效果} 不应有风险`).toBe(false)
    expect(写入切换({ 切换: 读.切换 })).toBe(文件)
  }
})
