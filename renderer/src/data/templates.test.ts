import { describe, expect, it } from 'vitest'
import { ALL_TEMPLATES, PPT_TEMPLATES, 生成演示模板文稿 } from './templates'
import { 从Html表格构建工作表 } from '../sheet/sheetImport'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { templatePhotoEntries } from './presentationTemplates/photos'
import { 构建演示保存模型 } from '../ppt/saveModel'
import { 校验原生元素 } from '../ppt/model/elements'
import type { 演示文稿 } from '../ppt/deck'
import { 重算工作簿 } from '../sheet/model'
import { 导出为Xlsx } from '../sheet/sheetExport'

const codec = createRequire(import.meta.url)('../../../main/office/pptxCodec.js')
const spreadsheetCodec = createRequire(import.meta.url)('../../../main/office/xlsxCodec.js')

describe('模板实际内容', () => {
  it('渠道投放与费用明细解析为真实公式，原生XLSX往返仍保留计算与公式', async () => {
    const template = ALL_TEMPLATES.find(item => item.id === 'table-marketing-001')!, sheet = 从Html表格构建工作表(template.内容, template.名称)!, workbook = 重算工作簿([sheet])
    expect(workbook[0].单元格.E2.显示值).toBe('40')
    expect(Number(workbook[0].单元格.F2.显示值)).toBeCloseTo(0.4)
    const raw = await spreadsheetCodec.写入xlsx(导出为Xlsx(workbook)), reopened = await spreadsheetCodec.读取xlsx(raw)
    expect(JSON.stringify(reopened)).toContain('IF(C2=0,0,B2/C2)')
    expect(JSON.stringify(reopened)).toContain('SUM(B2:B4)')
    const expenses = 从Html表格构建工作表(ALL_TEMPLATES.find(item => item.id === 'table-expense-001')!.内容, '费用')!
    expect(重算工作簿([expenses])[0].单元格.D5.显示值).toBe('0')
  })
  it('十二套九页主题具有不同内容，新增六套场景都有独立图表数据和流程', () => {
    expect(PPT_TEMPLATES).toHaveLength(12)
    const recommended = PPT_TEMPLATES.filter(item => item.推荐)
    expect(recommended.map(item => item.名称)).toEqual(['年度计划', '市场营销', '科技方案', '财务经营', '品牌活动', '学术答辩'])
    const decks = recommended.map(生成演示模板文稿)
    expect(new Set(decks.map(deck => deck.幻灯片列表[4].对象列表!.find(item => item.类型 === '图表')!.图表!.标题)).size).toBe(6)
    expect(new Set(decks.map(deck => deck.幻灯片列表[5].对象列表!.filter(item => item.形状?.文本).map(item => item.形状!.文本).join('|'))).size).toBe(6)
    for (const item of ['年度规划', '市场营销', '科技方案', '财务经营', '品牌活动', '学术答辩']) expect(recommended.some(template => template.场景 === item)).toBe(true)
  })
  it('每个文字模板都有正文结构，表格模板可解析为非空单元格', () => {
    expect(ALL_TEMPLATES.length).toBeGreaterThanOrEqual(20)
    for (const 模板 of ALL_TEMPLATES) {
      if (模板.分类 === 'word') {
        expect(模板.内容).toContain('<h')
        expect(模板.内容.replace(/<[^>]+>/g, '').trim().length).toBeGreaterThan(80)
      }
      if (模板.分类 === 'table') {
        const 工作表 = 从Html表格构建工作表(模板.内容, 模板.名称)
        expect(工作表?.单元格.A1?.原始值).toBeTruthy()
        expect(Object.keys(工作表?.单元格 ?? {}).length).toBeGreaterThan(5)
      }
    }
  })

  it('每个演示模板都有可编辑封面、内容页和结束页', () => {
    for (const 模板 of ALL_TEMPLATES.filter((项) => 项.分类 === 'ppt')) {
      const 文稿 = 生成演示模板文稿(模板)
      expect(文稿.幻灯片列表).toHaveLength(9)
      expect(文稿.幻灯片列表.every((页) => 页.文本框列表.length >= 2)).toBe(true)
      expect(文稿.幻灯片列表[1].文本框列表[1].text.length).toBeGreaterThan(5)
      expect(new Set(文稿.幻灯片列表.map(页 => 页.title)).size).toBe(9)
      expect(Object.keys(文稿.资源索引 ?? {})).toHaveLength(2)
      for (const [index, 页] of 文稿.幻灯片列表.entries()) {
        expect(页.备注).toContain('使用前')
        expect(页.文本框列表.some(框 => 框.text === `${String(index + 1).padStart(2, '0')} / 09`)).toBe(true)
        for (const 对象 of 页.对象列表 ?? []) 校验原生元素(对象)
        for (const 对象 of [...页.文本框列表, ...页.对象列表 ?? []]) {
          expect(对象.x).toBeGreaterThanOrEqual(0)
          expect(对象.y).toBeGreaterThanOrEqual(0)
          expect(对象.x + 对象.width).toBeLessThanOrEqual(960)
          expect(对象.y + 对象.height).toBeLessThanOrEqual(540)
        }
      }
    }
  })

  it.each(ALL_TEMPLATES.filter(项 => 项.分类 === 'ppt'))('$名称 的真实 PPTX 往返保留摄影、可编辑文字、图表、流程和行动表格', async 模板 => {
    const original = 生成演示模板文稿(模板)
    const assets = templatePhotoEntries(original)
    expect(assets).toHaveLength(2)
    const bytes = await codec.写入pptx(构建演示保存模型(original, assets))
    const zip = await JSZip.loadAsync(bytes)
    expect(Object.keys(zip.files).filter(name => /^ppt\/media\/.*\.png$/.test(name))).toHaveLength(2)
    expect(Object.keys(zip.files).some(name => /^ppt\/charts\/[^/]+\.xml$/.test(name))).toBe(true)
    const reopened = await codec.读取pptx(bytes)
    const deck = reopened.演示文稿 as 演示文稿
    expect(deck.幻灯片列表).toHaveLength(9)
    expect(deck.页面尺寸).toEqual({ 宽: 960, 高: 540 })
    const normalize = (value: string) => value.replace(/\r\n/g, '\n')
    for (let i = 0; i < original.幻灯片列表.length; i++) {
      const expected = original.幻灯片列表[i], actual = deck.幻灯片列表[i]
      expect(actual.文本框列表.map(框 => normalize(框.text))).toEqual(expected.文本框列表.map(框 => normalize(框.text)))
      actual.文本框列表.forEach((框, index) => expect(框).toMatchObject({ x: expected.文本框列表[index].x, y: expected.文本框列表[index].y, width: expected.文本框列表[index].width, height: expected.文本框列表[index].height, 字号: expected.文本框列表[index].字号, 颜色: expected.文本框列表[index].颜色, 加粗: expected.文本框列表[index].加粗 }))
      expect(actual.对象列表?.map(对象 => 对象.类型)).toEqual(expected.对象列表?.map(对象 => 对象.类型))
      for (const object of actual.对象列表 ?? []) {
        if (object.类型 === '图表') expect(object.图表).toMatchObject(expected.对象列表!.find(项 => 项.类型 === '图表')!.图表!)
        if (object.类型 === '表格') expect(object.表格?.单元格.map(row => row.map(cell => cell.文本))).toEqual(expected.对象列表!.find(项 => 项.类型 === '表格')!.表格!.单元格.map(row => row.map(cell => cell.文本)))
        if (object.类型 === '图片') {
          expect(assets.some(asset => asset.标识 === object.资源标识)).toBe(true)
          const expectedPhoto = expected.对象列表!.find(item => item.id === object.id)!
          for (const edge of ['左', '右', '上', '下'] as const) expect(object.裁剪![edge]).toBeCloseTo(expectedPhoto.裁剪![edge], 4)
        }
      }
    }
    // 实际修改数据和流程文字后再导出，验证不是一张不可编辑的截图。
    const nativeChart = deck.幻灯片列表[4].对象列表!.find(object => object.类型 === '图表')!
    nativeChart.图表!.系列[0].数值[0] = 321
    const nativeNode = deck.幻灯片列表[5].对象列表!.find(object => object.形状?.文本)!
    nativeNode.形状!.文本 = '修改后的流程节点'
    const edited = await codec.读取pptx(await codec.写入pptx(构建演示保存模型(deck, assets)))
    expect(edited.演示文稿.幻灯片列表[4].对象列表.find((object: { 类型: string }) => object.类型 === '图表').图表.系列[0].数值[0]).toBe(321)
    expect(edited.演示文稿.幻灯片列表[5].对象列表.some((object: { 形状?: { 文本: string } }) => object.形状?.文本 === '修改后的流程节点')).toBe(true)
  })
})
