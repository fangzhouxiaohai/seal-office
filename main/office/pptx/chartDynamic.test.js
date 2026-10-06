const { 写入动画, 读取动画, 写入播放扩展, 收集图表构建 } = require('./animations')

const 图表 = (动态) => ({ id: '图表-1', 类型: '图表', x: 0, y: 0, width: 600, height: 360, 图表: { 种类: '柱状图', 标题: '收入', 分类: ['一', '二', '三'], 系列: [{ id: 'series-0', 名称: '甲', 数值: [1, 2, 3], 颜色: '#2B6CF6' }, { id: 'series-1', 名称: '乙', 数值: [4, 5, 6], 颜色: '#718096' }], 图例: '下', 横轴标题: '', 纵轴标题: '', 显示横轴: true, 显示纵轴: true, 数值格式: '0', ...(动态 ? { 动态 } : {}) } })
const 幻灯片 = (对象) => ({ id: '页-1', 切换: undefined, 动画序列: [{ id: 'a1', 对象标识: 对象.id, 效果: '图表分步', 触发: '单击', 持续毫秒: 1800 }], 对象列表: [对象] })
const xml = (标识) => `<p:sld><p:cSld><p:spTree><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="seal-id:${Buffer.from(标识, 'utf8').toString('base64url')}"/></p:nvGraphicFramePr></p:graphicFrame></p:spTree></p:cSld></p:sld>`

it('按系列动态图表写入原生图表构建清单', () => {
  const 页 = 幻灯片(图表({ 步进: '按系列', 每步毫秒: 600 }))
  const 动画 = 写入动画(xml('图表-1'), 页.动画序列, 收集图表构建(页))
  expect(动画).toContain('<p:bldLst>')
  expect(动画).toContain('<p:bldGraphic spid="7" grpId="0">')
  expect(动画).toContain('<p:bldSub><p:bldChart>')
  expect(动画).toContain('<p:series idx="0"/>')
  expect(动画).toContain('<p:series idx="1"/>')
  expect(动画).not.toContain('<p:category')
})

it('按分类动态图表写入分类构建项', () => {
  const 页 = 幻灯片(图表({ 步进: '按分类', 每步毫秒: 600 }))
  const 动画 = 写入动画(xml('图表-1'), 页.动画序列, 收集图表构建(页))
  expect(动画).toContain('<p:category idx="0"/>')
  expect(动画).toContain('<p:category idx="2"/>')
  expect(动画).not.toContain('<p:series idx=')
})

it('没有动态图表时不写构建清单', () => {
  const 页 = 幻灯片(图表(undefined))
  expect(写入动画(xml('图表-1'), 页.动画序列, 收集图表构建(页))).not.toContain('<p:bldLst>')
})

it('图表构建与动态参数一起保存在本机扩展中并可原样读回', () => {
  const 页 = 幻灯片(图表({ 步进: '按系列与数据点', 每步毫秒: 250 }))
  const 扩展 = 写入播放扩展(页)
  expect(扩展).toContain('seal:playback')
  const 完整 = xml('图表-1').replace('</p:sld>', `${写入动画(xml('图表-1'), 页.动画序列, 收集图表构建(页))}${扩展}</p:sld>`)
  expect(读取动画(完整)).toEqual(页.动画序列)
})

it('外部改写构建清单后读取判为动画未完整导入', () => {
  const 页 = 幻灯片(图表({ 步进: '按系列', 每步毫秒: 600 }))
  const 完整 = xml('图表-1').replace('</p:sld>', `${写入动画(xml('图表-1'), 页.动画序列, 收集图表构建(页))}${写入播放扩展(页)}</p:sld>`)
  expect(读取动画(完整.replace('<p:series idx="1"/>', '<p:category idx="1"/>'))).toBeNull()
})

it('构建清单只包含设置了动态且有图表分步动画的图表', () => {
  const 无动画 = 幻灯片(图表({ 步进: '按系列', 每步毫秒: 600 }))
  无动画.动画序列 = []
  expect(收集图表构建(无动画)).toEqual({})
  const 有动画 = 幻灯片(图表({ 步进: '按系列', 每步毫秒: 600 }))
  expect(收集图表构建(有动画)).toEqual({ '图表-1': { 动态: { 步进: '按系列', 每步毫秒: 600 }, 系列数: 2, 分类数: 3 } })
})
