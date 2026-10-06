import { describe, expect, it } from 'vitest'
import { ALL_TEMPLATES, 生成演示模板文稿 } from './templates'
import { 从Html表格构建工作表 } from '../sheet/sheetImport'

describe('模板实际内容', () => {
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
      expect(文稿.幻灯片列表.length).toBeGreaterThanOrEqual(4)
      expect(文稿.幻灯片列表.every((页) => 页.文本框列表.length >= 2)).toBe(true)
      expect(文稿.幻灯片列表[1].文本框列表[1].text.length).toBeGreaterThan(5)
    }
  })
})
