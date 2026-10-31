import { expect, it } from 'vitest'
import { 组装打印HTML } from './printPages'

it('打印 HTML 每页一张图并按原始纸张尺寸分页，混合纵横页各自保留尺寸', () => {
  const html = 组装打印HTML([
    { 图片: 'data:image/png;base64,AA', 宽pt: 595.28, 高pt: 841.89 },
    { 图片: 'data:image/png;base64,BB', 宽pt: 841.89, 高pt: 595.28 },
    { 图片: 'data:image/png;base64,CC', 宽pt: 595.28, 高pt: 841.89 },
  ], '报告<1>')
  expect(html.match(/<img /g)).toHaveLength(3)
  expect(html).toContain('@page p0 { size: 595.28pt 841.89pt; margin: 0; }')
  expect(html).toContain('@page p1 { size: 841.89pt 595.28pt; margin: 0; }')
  expect(html).not.toContain('@page p2')
  // 打印块比纸张矮 1pt，避免分页取整后每页多出空白页
  expect(html).toContain('.sheet.p0 { page: p0; width: 595.28pt; height: 840.89pt; }')
  expect(html).toContain('<title>报告&lt;1&gt;</title>')
  expect(html).toContain('break-after: page')
})
