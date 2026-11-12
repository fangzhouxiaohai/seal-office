import { describe, expect, it } from 'vitest'
import { 识别模板列表, 单据模板列表, 扫描模板列表, 取识别模板 } from './templates'
import { 翻译界面文本 } from '../i18n/interfaceLanguage'

describe('识别模板定义', () => {
  it('覆盖证件、试卷与六类行业单据，扫描工具箱与单据识别共用同一份定义', () => {
    const 标识 = 识别模板列表.map(模板 => 模板.标识)
    expect(标识).toEqual(expect.arrayContaining(['id-card', 'business-license', 'bank-card', 'exam', 'delivery-note', 'weighbridge', 'invoice', 'expense', 'stock-in', 'receipt']))
    expect(new Set(标识).size).toBe(标识.length)
    expect(单据模板列表.map(模板 => 模板.标识)).toEqual(['delivery-note', 'weighbridge', 'invoice', 'expense', 'stock-in', 'receipt'])
    // 扫描工具箱里的“票据”直接引用单据模板对象，不复制一套。
    for (const 模板 of 单据模板列表) expect(扫描模板列表).toContain(模板)
    expect(取识别模板('delivery-note')).toBe(单据模板列表[0])
    expect(取识别模板('不存在')).toBeNull()
  })

  it('每个模板与字段都有中英双语名称，且英文界面能翻译出同一英文名', () => {
    for (const 模板 of 识别模板列表) {
      expect(模板.名称).toMatch(/[㐀-鿿]/u)
      expect(模板.英文名).toMatch(/^[A-Za-z]/)
      expect(翻译界面文本(模板.名称, 'en-US'), 模板.名称).toBe(模板.英文名)
      for (const 字段 of [...模板.表头字段, ...模板.明细字段]) {
        expect(字段.名称, 模板.标识).toMatch(/[㐀-鿿]/u)
        expect(字段.英文名, 字段.名称).toMatch(/^[A-Za-z]/)
        expect(翻译界面文本(字段.名称, 'en-US'), 字段.名称).toBe(字段.英文名)
        expect(字段.别名.length).toBeGreaterThan(0)
      }
    }
  })

  it('单据模板字段满足计划示例，送货单至少包含品名、规格、数量、单位、金额五列', () => {
    const 列名 = (标识: string) => { const 模板 = 取识别模板(标识)!; return [...模板.表头字段, ...模板.明细字段].map(字段 => 字段.名称) }
    expect(列名('delivery-note')).toEqual(expect.arrayContaining(['单号', '日期', '品名', '规格', '数量', '单位', '单价', '毛重', '金额']))
    expect(列名('weighbridge')).toEqual(expect.arrayContaining(['车牌号', '货名', '毛重', '皮重', '净重', '过磅时间']))
    expect(列名('invoice')).toEqual(expect.arrayContaining(['发票号码', '开票日期', '购买方', '金额', '税率', '价税合计']))
    expect(列名('expense')).toEqual(expect.arrayContaining(['报销人', '事由', '金额', '日期', '审批状态']))
    expect(列名('stock-in')).toEqual(expect.arrayContaining(['单号', '日期', '货品', '数量', '库位', '经办人']))
    expect(列名('receipt')).toEqual(expect.arrayContaining(['商品', '数量', '单价', '小计', '合计', '支付方式']))
  })

  it('校验规则引用的字段都在模板中存在', () => {
    for (const 模板 of 识别模板列表) {
      const 键 = new Set([...模板.表头字段, ...模板.明细字段].map(字段 => 字段.键))
      for (const 规则 of 模板.校验规则) for (const 引用 of 规则.字段) expect(键.has(引用), `${模板.标识}:${引用}`).toBe(true)
    }
  })
})
