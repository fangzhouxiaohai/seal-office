const { 校验皮肤, 解析皮肤文本, 对比度, 皮肤颜色键, 皮肤最大字节, 背景图最大字节 } = require('./skinFormat')
const 内置皮肤 = require('./builtinSkins.json')

const 合法颜色 = {
  bg: '#F4F5FB', sidebar: '#FFFFFF', card: '#FFFFFF', toolbar: '#FBFBFE',
  text: '#1B1D2B', text2: '#5A6075', text3: '#6B7186', border: '#E7E8F2',
  brand: '#6A5CF5', brandHover: '#5848E8', brandSoft: '#EFEDFF',
  hover: '#F3F2FF', selected: '#ECEAFF', gradientFrom: '#7B6BFF', gradientTo: '#5B7CFA',
}
const 合法深色 = {
  bg: '#14151F', sidebar: '#1B1D29', card: '#1F2130', toolbar: '#1F2130',
  text: '#ECEDF5', text2: '#A3A7BC', text3: '#9095AC', border: '#30334A',
  brand: '#6A5CF5', brandHover: '#A196FF', brandSoft: '#2C2950',
  hover: '#282B3D', selected: '#332F5E', gradientFrom: '#9A8FFF', gradientTo: '#6B8BFF',
}
const 合法皮肤 = () => ({
  format: 'seal-skin', schema: 1, id: 'demo.ocean', name: '演示皮肤', author: '测试', version: '1.0.0',
  description: '用于测试', light: { ...合法颜色 }, dark: { ...合法深色 }, radius: { card: 12, control: 8 },
})
// 1x1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('皮肤格式校验', () => {
  it('接受完整合法的皮肤并返回规范化结果', () => {
    const 结果 = 校验皮肤(合法皮肤())
    expect(结果.id).toBe('demo.ocean')
    expect(结果.light.brand).toBe('#6A5CF5')
    expect(结果.radius).toEqual({ card: 12, control: 8 })
  })

  it('颜色键清单固定为 15 个', () => {
    expect(皮肤颜色键).toHaveLength(15)
  })

  it('拒绝缺少颜色键的皮肤', () => {
    const 皮肤 = 合法皮肤(); delete 皮肤.light.brand
    expect(() => 校验皮肤(皮肤)).toThrow(/浅色.*brand/)
  })

  it('拒绝未知颜色键与未知顶层字段', () => {
    const 甲 = 合法皮肤(); 甲.dark.extra = '#000000'
    expect(() => 校验皮肤(甲)).toThrow(/未知/)
    const 乙 = 合法皮肤(); 乙.css = 'body{}'
    expect(() => 校验皮肤(乙)).toThrow(/未知字段.*css/)
  })

  it('拒绝非 #RRGGBB 颜色', () => {
    const 皮肤 = 合法皮肤(); 皮肤.light.text = 'red'
    expect(() => 校验皮肤(皮肤)).toThrow(/#RRGGBB/)
    const 乙 = 合法皮肤(); 乙.light.text = 'url(javascript:1)'
    expect(() => 校验皮肤(乙)).toThrow(/#RRGGBB/)
  })

  it('正文对比度不足时拒绝并说明数值', () => {
    const 皮肤 = 合法皮肤(); 皮肤.light.text = '#CCCCCC'
    expect(() => 校验皮肤(皮肤)).toThrow(/对比度/)
  })

  it('主色上的白字对比度不足时拒绝', () => {
    const 皮肤 = 合法皮肤(); 皮肤.light.brand = '#FFE680'
    expect(() => 校验皮肤(皮肤)).toThrow(/主色/)
  })

  it('校验必填信息格式', () => {
    expect(() => 校验皮肤({ ...合法皮肤(), format: 'x' })).toThrow(/seal-skin/)
    expect(() => 校验皮肤({ ...合法皮肤(), id: 'A B' })).toThrow(/标识/)
    expect(() => 校验皮肤({ ...合法皮肤(), name: '' })).toThrow(/名称/)
    expect(() => 校验皮肤({ ...合法皮肤(), version: 'v1' })).toThrow(/版本/)
  })

  it('圆角超出范围时拒绝', () => {
    expect(() => 校验皮肤({ ...合法皮肤(), radius: { card: 40, control: 8 } })).toThrow(/圆角/)
  })

  it('接受合法 PNG 背景图', () => {
    const 结果 = 校验皮肤({ ...合法皮肤(), background: { image: 'data:image/png;base64,' + PNG, opacity: 0.2 } })
    expect(结果.background.opacity).toBe(0.2)
  })

  it('拒绝声明类型与文件头不符的背景图', () => {
    expect(() => 校验皮肤({ ...合法皮肤(), background: { image: 'data:image/jpeg;base64,' + PNG, opacity: 0.2 } })).toThrow(/背景图/)
  })

  it('拒绝 SVG 背景图与超限透明度', () => {
    expect(() => 校验皮肤({ ...合法皮肤(), background: { image: 'data:image/svg+xml;base64,PHN2Zz4=', opacity: 0.2 } })).toThrow(/背景图/)
    expect(() => 校验皮肤({ ...合法皮肤(), background: { image: 'data:image/png;base64,' + PNG, opacity: 0.9 } })).toThrow(/透明度/)
  })

  it('拒绝超过体积上限的背景图', () => {
    const 大图 = Buffer.alloc(背景图最大字节 + 10); Buffer.from(PNG, 'base64').copy(大图)
    expect(() => 校验皮肤({ ...合法皮肤(), background: { image: 'data:image/png;base64,' + 大图.toString('base64'), opacity: 0.1 } })).toThrow(/背景图/)
  })

  it('解析文本时拒绝非 JSON 与超限文件', () => {
    expect(() => 解析皮肤文本('not json')).toThrow(/JSON/)
    expect(() => 解析皮肤文本(' '.repeat(皮肤最大字节 + 1))).toThrow(/512/)
    expect(解析皮肤文本(JSON.stringify(合法皮肤())).name).toBe('演示皮肤')
  })

  it('对比度计算符合 WCAG 公式', () => {
    expect(对比度('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
    expect(对比度('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })
})

describe('内置皮肤', () => {
  it('恰好 10 套且标识唯一', () => {
    expect(内置皮肤).toHaveLength(10)
    expect(new Set(内置皮肤.map(s => s.id)).size).toBe(10)
  })

  it('全部通过格式与对比度校验', () => {
    for (const 皮肤 of 内置皮肤) expect(() => 校验皮肤(皮肤), 皮肤.name).not.toThrow()
  })

  it('默认皮肤海豹紫与 2.3.0 浅色配色一致', () => {
    const 默认 = 内置皮肤[0]
    expect(默认.id).toBe('seal.violet')
    expect(默认.light.brand).toBe('#6A5CF5')
    expect(默认.light.bg).toBe('#F4F5FB')
    expect(默认.dark.brand).toBe('#8D80FF')
  })
})
