import { expect, it } from 'vitest'
import { 生成导出Html } from './exportHtml'
import { 默认导出选项 } from '../model/exportPlan'
import { 默认讲义设置, 默认备注设置 } from '../model/handout'
import { 创建演示文稿 } from '../deck'

const 准备文稿 = (数量: number) => {
  const 文稿 = 创建演示文稿('讲义样例')
  文稿.幻灯片列表 = Array.from({ length: 数量 }, (_, i) => ({
    ...文稿.幻灯片列表[0],
    id: `页${i + 1}`,
    title: `页${i + 1}`,
    备注: `第 ${i + 1} 页备注`,
  }))
  return 文稿
}

const 讲义选项 = (数量: number) => ({
  ...默认导出选项,
  格式: 'PDF' as const,
  讲义每页张数: 数量 as 1 | 2 | 3 | 6,
})

it('讲义 4 张按 2×2 排版，并输出页眉、页脚占位符、日期与页码', () => {
  const 文稿 = 准备文稿(5)
  const html = 生成导出Html(文稿, {
    ...讲义选项(4 as unknown as 1),
    讲义设置: { ...默认讲义设置, 每页张数: 4, 页眉: '培训讲义', 页脚: '第 <页码> 页', 显示日期: true, 显示页码: true },
  } as never)
  expect((html.match(/class="seal-export-page"/g) ?? []).length).toBe(2)
  expect(html).toContain('data-讲义张数="4"')
  expect(html).toContain('data-页数="1"')
  expect(html).toContain('培训讲义')
  expect(html).toContain('第 1 页')
  expect(html).toContain('第 2 页')
  expect(html).toMatch(/\d{4}-\d{2}-\d{2}/)
  expect((html.match(/seal-export-slide/g) ?? []).length).toBe(5)
})

it('讲义 9 张按 3×3 排版，最后一页不足也成页', () => {
  const 文稿 = 准备文稿(10)
  const html = 生成导出Html(文稿, {
    ...讲义选项(6),
    讲义每页张数: 9 as unknown as 6,
    讲义设置: { ...默认讲义设置, 每页张数: 9 },
  } as never)
  expect((html.match(/class="seal-export-page"/g) ?? []).length).toBe(2)
  expect(html).toContain('data-讲义张数="9"')
})

it('只备注排版时每页只有备注块与页码，不渲染幻灯片缩略图', () => {
  const 文稿 = 准备文稿(2)
  const html = 生成导出Html(文稿, {
    ...默认导出选项,
    格式: 'PDF',
    输出备注: true,
    备注设置: { ...默认备注设置, 排版: '仅备注', 页脚: '第 <页码> 页' },
  } as never)
  expect((html.match(/class="seal-export-page"/g) ?? []).length).toBe(2)
  expect(html).toContain('第 1 页备注')
  expect(html).toContain('第 1 页')
  expect(html).not.toContain('seal-export-slide')
})

it('幻灯片加备注排版同时渲染缩略图与备注，并带页眉页码', () => {
  const 文稿 = 准备文稿(1)
  const html = 生成导出Html(文稿, {
    ...默认导出选项,
    格式: 'PDF',
    输出备注: true,
    备注设置: { ...默认备注设置, 排版: '幻灯片加备注', 页眉: '备注页眉', 显示页码: true },
  } as never)
  expect(html).toContain('seal-export-slide')
  expect(html).toContain('备注页眉')
  expect(html).toContain('备注：第 1 页备注')
})

it('讲义设置与每页张数不一致或取值非法时给出真实原因', () => {
  const 文稿 = 准备文稿(2)
  expect(() => 生成导出Html(文稿, {
    ...讲义选项(2),
    讲义设置: { ...默认讲义设置, 每页张数: 4 },
  } as never)).toThrow('不一致')
  expect(() => 生成导出Html(文稿, {
    ...讲义选项(2),
    讲义设置: { ...默认讲义设置, 每页张数: 2, 页脚: 'x'.repeat(200) },
  } as never)).toThrow('页脚')
})
