import { 创建演示文稿, 创建文本框, type 演示文稿 } from '../ppt/deck'
import { 创建图形 } from '../ppt/model/elements'
export const designTemplates = [
  { id: 'event', name: '活动海报', title: '让创意成为行动', subtitle: '年度创意交流 · 分享灵感与实践', footer: '时间 / 地点 / 主办方', color: '#1D4ED8', paper: '#EEF4FF', width: 960, height: 1280, label: '交流活动' },
  { id: 'brand', name: '品牌方图', title: '把想法，带向更远', subtitle: '品牌故事 / 产品价值 / 核心主张', footer: '品牌名称 · 发现更多可能', color: '#166653', paper: '#EFF7F2', width: 1080, height: 1080, label: '品牌传播' },
  { id: 'banner', name: '横幅封面', title: '下一步，从这里出发', subtitle: '项目启动 · 团队共识 · 目标同行', footer: '项目名称  /  日期', color: '#5037A5', paper: '#F3F0FA', width: 1440, height: 600, label: '项目启动' },
  { id: 'invitation', name: '邀请函', title: '诚邀同行，共启新篇', subtitle: '一场关于合作、信任与未来的对话', footer: '活动时间  /  活动地点  /  联系方式', color: '#8D3929', paper: '#FCF3EA', width: 960, height: 1280, label: '诚挚邀请' },
  { id: 'course', name: '课程宣传', title: '从理解到实践', subtitle: '系统学习 · 案例拆解 · 练习反馈', footer: '讲师介绍  /  课程时间  /  报名方式', color: '#0C6577', paper: '#ECF7F9', width: 960, height: 1280, label: '专题课程' },
  { id: 'infographic', name: '信息长图', title: '把复杂问题讲清楚', subtitle: '发现问题 → 分析原因 → 制定行动', footer: '资料来源  /  更新日期', color: '#9B4E0B', paper: '#FFF7ED', width: 960, height: 1600, label: '工作方法' },
] as const
export function createDesign(id: string, width?: number, height?: number): 演示文稿 {
  const template = designTemplates.find(t => t.id === id)
  if (!template && id !== 'blank') throw new Error('设计模板不存在')
  const w = width ?? template?.width ?? 1080, h = height ?? template?.height ?? 1080
  if (![w,h].every(n => Number.isInteger(n) && n >= 200 && n <= 2400)) throw new Error('设计尺寸须为200至2400的整数')
  const deck = 创建演示文稿(`${template?.name ?? '空白设计'}.pptx`), slide = deck.幻灯片列表[0]
  deck.页面尺寸 = { 宽: w, 高: h }; slide.版式 = '空白'; slide.文本框列表 = []; slide.对象列表 = []; slide.背景色 = template?.paper ?? '#FFFFFF'
  if (!template) return deck
  const scale = Math.min(w / 960, h / 960), pad = 64 * scale
  const line = 创建图形('矩形'); Object.assign(line, { x: pad, y: pad, width: w * .15, height: 10 * scale, 形状: { ...line.形状!, 填充: template.color, 线条: template.color } })
  const circle = 创建图形('椭圆'); Object.assign(circle, { x: w * .66, y: h * .52, width: w * .25, height: w * .25, 形状: { ...circle.形状!, 填充: template.color, 线条: template.color } })
  const small = 创建图形('矩形'); Object.assign(small, { x: pad, y: h * .55, width: w * .48, height: h * .18, 形状: { ...small.形状!, 填充: '#FFFFFF', 线条: template.color, 线宽: 2 } })
  slide.对象列表 = [line, circle, small]
  slide.文本框列表 = [
    { ...创建文本框(pad, h * .12, w - pad * 2, 50 * scale, template.label, 24 * scale), 颜色: template.color },
    { ...创建文本框(pad, h * .22, w - pad * 2, h * .19, template.title, 54 * scale), 加粗: true, 颜色: template.color },
    { ...创建文本框(pad, h * .43, w - pad * 2, h * .08, template.subtitle, 24 * scale), 颜色: '#3C4658' },
    { ...创建文本框(pad + 22 * scale, h * .59, w * .43, h * .11, id === 'infographic' ? '01 明确目标\n02 拆解路径\n03 复盘改进' : '把核心信息\n放在这里', 26 * scale), 颜色: template.color },
    { ...创建文本框(pad, h * .87, w - pad * 2, h * .08, template.footer, 20 * scale), 颜色: '#5C6472' },
  ]
  // The wide cover uses a separate editorial arrangement rather than compressing a portrait poster.
  if (id === 'banner') { slide.文本框列表[1].height = h * .2; slide.文本框列表[1].字号 = 48 * scale; Object.assign(circle, { x: w * .75, y: h * .4, width: h * .5, height: h * .5 }); slide.对象列表 = [line, circle]; slide.文本框列表.splice(3, 1) }
  return deck
}
