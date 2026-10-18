import { 创建演示文稿, 创建幻灯片, 创建文本框, type 幻灯片, type 文本框, type 演示对象, type 演示文稿 } from '../../ppt/deck'
import type { 模板项 } from '../templates'
import { templatePhotoMetadata, type TemplatePhoto } from './photos'
import { templateStories, type TemplateStory } from './stories'

const W = 960, H = 540, total = 9
const uuid = () => `template-${crypto.randomUUID()}`
const lines = (value: string, limit: number) => value.split('\n').map(line => {
  const chars = Array.from(line), width = Math.ceil(chars.length / Math.max(1, Math.ceil(chars.length / limit)))
  return chars.reduce<string[]>((rows, char) => {
    if (!rows.length || Array.from(rows[rows.length - 1]).length >= width) rows.push(char)
    else rows[rows.length - 1] += char
    return rows
  }, []).join('\n')
}).join('\n')

function text(x: number, y: number, width: number, height: number, value: string, size: number, color: string, bold = false): 文本框 {
  return { ...创建文本框(x, y, width, height, value, size), 字体: 'Microsoft YaHei', 颜色: color, 加粗: bold }
}
function shape(x: number, y: number, width: number, height: number, value: string, fill: string, color: string, size = 22, kind: '矩形' | '圆角矩形' | '椭圆' | '箭头' = '矩形'): 演示对象 {
  return { id: uuid(), 类型: '图形', x, y, width, height, 形状: { 种类: kind, 文本: value, 填充: fill, 线条: fill, 线宽: 0, 颜色: color, 字号: size, 加粗: true } }
}
/** 按原始尺寸居中裁切；预览与 PPTX 共用裁切值，不拉伸摄影主体。 */
function photo(key: TemplatePhoto, x: number, y: number, width: number, height: number): 演示对象 {
  const meta = templatePhotoMetadata[key], source = meta.width / meta.height, target = width / height
  const dx = target < source ? (1 - target / source) / 2 : 0
  const dy = target > source ? (1 - source / target) / 2 : 0
  return { id: uuid(), 类型: '图片', x, y, width, height, 资源标识: meta.id, 裁剪: { 左: dx, 右: dx, 上: dy, 下: dy } }
}
function page(title: string, s: TemplateStory, number: number, name: string, background = '#FFFFFF', dark = false): 幻灯片 {
  const p = { ...创建幻灯片('空白', title), 背景色: background, 背景填充: { 类型: '纯色' as const, 颜色: background }, 背景继承: false, 对象列表: [] as 演示对象[] }
  p.备注 = '本页为可编辑示例内容；所有数据、分工与时间均为示例，使用前请按实际情况替换。摄影为海豹办公原创 AI 生成资产。'
  const color = dark ? '#FFFFFF' : s.ink
  p.文本框列表 = [text(50, 29, 850, 30, s.eyebrow, 13, dark ? '#D8E1E8' : s.accent), text(50, 73, 850, 62, title, 32, color, true)]
  p.文本框列表.push(text(50, 503, 690, 24, `${name}  ·  示例内容，请按实际情况修改`, 12, dark ? '#D8E1E8' : '#65717D'), { ...text(810, 501, 100, 26, `${String(number).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, 13, dark ? '#D8E1E8' : '#65717D'), 对齐: 'right' })
  return p
}

/** 原生对象组成的完整示例讲述结构；所有文字、图表数据、表格与流程均可编辑。 */
export function buildPresentationTemplate(template: 模板项): 演示文稿 | undefined {
  const s = templateStories[template.id]
  if (!s || template.演示设置?.章节) return undefined
  const deck = 创建演示文稿(`${template.名称}.pptx`), pages: 幻灯片[] = []
  const cover = page(template.名称, s, 1, template.名称, s.cover === 'split' ? s.ink : '#FFFFFF', s.cover === 'split')
  if (s.cover === 'split') {
    cover.文本框列表 = [text(50, 62, 420, 32, s.eyebrow, 13, '#D8E1E8'), text(50, 166, 420, 86, template.名称, 46, '#FFFFFF', true), text(50, 268, 400, 94, lines(s.subtitle, 16), 24, '#FFFFFF'), text(50, 412, 400, 58, '汇报人：__________\n日期：____ 年 __ 月', 16, '#D8E1E8'), text(50, 504, 350, 24, '示例内容 · 文字、图片与数据均可修改', 12, '#D8E1E8'), { ...text(410, 502, 70, 25, '01 / 09', 13, '#D8E1E8'), 对齐: 'right' }]
    cover.对象列表!.push(photo(s.hero, 504, 0, 456, 540))
  } else {
    cover.文本框列表 = [text(50, 300, 850, 30, s.eyebrow, 13, s.accent), text(50, 345, 410, 80, template.名称, 44, s.ink, true), text(496, 350, 410, 82, lines(s.subtitle, 16), 23, s.ink), text(50, 447, 850, 32, '主讲人：__________    日期：____ 年 __ 月', 16, '#65717D'), ...cover.文本框列表.slice(-2)]
    cover.对象列表!.push(photo(s.hero, 0, 0, 960, 276))
  }
  pages.push(cover)

  const agenda = page('先明确这次交流要达成什么', s, 2, template.名称)
  agenda.文本框列表.push(text(50, 142, 470, 70, lines(s.purpose, 22), 20, '#52616F'))
  s.agenda.forEach(([title, body], i) => {
    const y = 219 + i * 80
    agenda.文本框列表.push(text(50, y, 48, 42, `0${i + 1}`, 22, s.accent, true), text(111, y - 1, 420, 42, title, 23, s.ink, true), text(111, y + 42, 420, 33, body, 17, '#52616F'))
  })
  agenda.对象列表!.push(photo(s.secondary, 570, 151, 334, 304)); pages.push(agenda)

  const context = page(s.contextTitle, s, 3, template.名称)
  context.对象列表!.push(photo(s.hero, 56, 160, 375, 300))
  s.context.forEach(([title, body], i) => context.文本框列表.push(text(474, 155 + i * 103, 430, 40, title, 23, s.ink, true), text(474, 197 + i * 103, 430, 56, lines(body, 23), 17, '#52616F')))
  pages.push(context)

  const metrics = page(s.metricsTitle, s, 4, template.名称, s.tint)
  s.metrics.forEach(([value, title, body], i) => {
    const x = 56 + i * 286
    metrics.对象列表!.push(shape(x + 6, 163, 246, 3, '', s.accent, s.accent))
    metrics.文本框列表.push(text(x, 189, 258, 75, value, 42, s.accent, true), text(x, 273, 258, 42, title, 23, s.ink, true), text(x, 326, 258, 74, lines(body, 13), 17, '#52616F'))
  })
  metrics.文本框列表.push(text(56, 432, 848, 48, lines(s.metricsSummary, 39), 19, s.ink)); pages.push(metrics)

  const chart = page('把数据转化为一个清楚的判断', s, 5, template.名称)
  chart.对象列表!.push({ id: uuid(), 类型: '图表', x: 42, y: 145, width: 580, height: 316, 图表: { 种类: s.chart.kind, 标题: s.chart.title, 分类: [...s.chart.categories], 系列: s.chart.series.map((series, i) => ({ id: `series-${i}`, 名称: series.name, 数值: [...series.values], 颜色: i === 0 ? s.accent : '#A8B4C4' })), 图例: '下', 横轴标题: '', 纵轴标题: s.chart.unit, 显示横轴: true, 显示纵轴: true, 数值格式: '0' } }, photo(s.secondary, 660, 350, 244, 111))
  chart.文本框列表.push(text(654, 155, 255, 78, lines(s.chart.insight, 9), 24, s.ink, true), text(654, 242, 255, 94, s.chart.explanation, 18, '#52616F'), text(50, 470, 850, 27, '示例数据，仅用于展示图表结构；请在图表数据面板中替换。', 13, '#65717D'))
  pages.push(chart)

  const process = page(s.processTitle, s, 6, template.名称)
  process.文本框列表.push(text(50, 142, 850, 54, s.processIntro, 20, '#52616F'))
  s.steps.forEach(([title, body], i) => {
    const x = 56 + i * 220
    process.对象列表!.push(shape(x, 226, 184, 88, `0${i + 1}\n${title}`, i === 0 ? s.accent : s.tint, i === 0 ? '#FFFFFF' : s.ink, 22, '圆角矩形'))
    if (i < 3) process.对象列表!.push(shape(x + 192, 253, 20, 27, '', s.accent, s.accent, 12, '箭头'))
    process.文本框列表.push(text(x, 337, 184, 87, body, 17, '#52616F'))
  }); pages.push(process)

  const plan = page(s.planTitle, s, 7, template.名称)
  plan.对象列表!.push({ id: uuid(), 类型: '表格', x: 56, y: 166, width: 848, height: 232, 表格: { 单元格: s.plan.map((row, i) => row.map(value => ({ 文本: value, 背景: i === 0 ? s.accent : i % 2 ? '#FFFFFF' : s.tint, 颜色: i === 0 ? '#FFFFFF' : s.ink, 字号: 18, 加粗: i === 0, 对齐: 'left' as const }))), 行高: [58, 58, 58, 58], 列宽: [174, 242, 244, 188], 合并: [] } })
  plan.文本框列表.push(text(56, 427, 848, 52, '检查每项行动的交付物、负责人和完成标准，避免只写活动名称。', 19, '#52616F'))
  pages.push(plan)

  const risks = page('提前识别风险，保留调整空间', s, 8, template.名称)
  s.risks.forEach(([title, body], i) => {
    const y = 154 + i * 104
    risks.对象列表!.push(shape(56, y + 7, 42, 42, String(i + 1), s.tint, s.accent, 20, '椭圆'))
    risks.文本框列表.push(text(115, y, 520, 38, title, 22, s.ink, true), text(115, y + 41, 520, 58, lines(body, 28), 17, '#52616F'))
  })
  risks.对象列表!.push(photo(s.secondary, 670, 161, 234, 292)); pages.push(risks)

  const closing = page('下一步行动', s, 9, template.名称, s.ink, true)
  closing.文本框列表 = [text(450, 75, 450, 32, s.eyebrow, 13, '#D8E1E8'), text(450, 143, 450, 123, lines(s.closing, 11), 36, '#FFFFFF', true), ...s.actions.map((action, i) => text(450, 299 + i * 52, 450, 43, `${String(i + 1).padStart(2, '0')}  ${action}`, 20, '#FFFFFF')), text(450, 503, 340, 25, `${template.名称} · 示例内容`, 12, '#D8E1E8'), { ...text(810, 501, 100, 26, '09 / 09', 13, '#D8E1E8'), 对齐: 'right' as const }]
  closing.对象列表!.push(photo(s.hero, 0, 0, 390, 540)); pages.push(closing)

  const resources = [s.hero, s.secondary].map(key => templatePhotoMetadata[key])
  // PPTX 读取器按首个文字框生成页面大纲；把实际标题放在首位，坐标和绘制外观保持一致。
  for (const p of pages) p.文本框列表 = [p.文本框列表[1], p.文本框列表[0], ...p.文本框列表.slice(2)]
  return { ...deck, 页面尺寸: { 宽: W, 高: H }, 幻灯片列表: pages, 资源索引: Object.fromEntries(resources.map(meta => [meta.id, { 指纹: meta.id, 类型: meta.type, 字节数: meta.bytes }])) }
}
