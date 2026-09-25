// 图表、公式与 SmartArt：以字符串形式生成可直接插入文档的图形标记。
// 全部为纯函数，不依赖外部图表库，输出为内联 SVG 或结构化 HTML。

export type 图表类型 = '柱形图' | '折线图' | '饼图'

export interface 图表数据 {
  类别: string[]
  数值: number[]
}

const 图表宽 = 480
const 图表高 = 260
const 边距 = { 上: 24, 右: 24, 下: 40, 左: 48 }
/** 与设计令牌 --brand 保持一致的图表配色 */
const 图表配色 = ['#2B6CF6', '#00A870', '#ED7B2F', '#7C4DFF', '#E34D59', '#00B8D9']

/** HTML 实体编码：防止用户输入中包含恶意标签时注入到 SVG 或 HTML 中 */
function 实体编码(文本: string): string {
  return 文本
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 取有效的数据对，长度以较短者为准 */
function 取有效数据(数据: 图表数据): Array<{ 类别: string; 数值: number }> {
  const 长度 = Math.min(数据.类别.length, 数据.数值.length)
  const 结果: Array<{ 类别: string; 数值: number }> = []
  for (let i = 0; i < 长度; i += 1) {
    const 值 = 数据.数值[i]
    结果.push({ 类别: 数据.类别[i], 数值: Number.isFinite(值) ? 值 : 0 })
  }
  return 结果
}

function 生成柱形图(项列表: Array<{ 类别: string; 数值: number }>): string {
  const 绘图宽 = 图表宽 - 边距.左 - 边距.右
  const 绘图高 = 图表高 - 边距.上 - 边距.下
  const 最大值 = Math.max(1, ...项列表.map((项) => 项.数值))
  const 槽宽 = 绘图宽 / 项列表.length
  const 柱宽 = Math.min(48, 槽宽 * 0.6)

  const 柱与标签 = 项列表
    .map((项, 下标) => {
      const 高 = (项.数值 / 最大值) * 绘图高
      const x = 边距.左 + 槽宽 * 下标 + (槽宽 - 柱宽) / 2
      const y = 边距.上 + 绘图高 - 高
      const 颜色 = 图表配色[下标 % 图表配色.length]
      return (
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${柱宽.toFixed(1)}" height="${高.toFixed(1)}" rx="3" fill="${颜色}" />` +
        `<text x="${(x + 柱宽 / 2).toFixed(1)}" y="${图表高 - 边距.下 + 18}" text-anchor="middle" font-size="12" fill="#5C6472">${项.类别}</text>` +
        `<text x="${(x + 柱宽 / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="12" fill="#1A1D24">${项.数值}</text>`
      )
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${图表宽} ${图表高}" width="${图表宽}" height="${图表高}">` +
    `<line x1="${边距.左}" y1="${图表高 - 边距.下}" x2="${图表宽 - 边距.右}" y2="${图表高 - 边距.下}" stroke="#E8EBF0" />` +
    柱与标签 +
    '</svg>'
}

function 生成折线图(项列表: Array<{ 类别: string; 数值: number }>): string {
  const 绘图宽 = 图表宽 - 边距.左 - 边距.右
  const 绘图高 = 图表高 - 边距.上 - 边距.下
  const 最大值 = Math.max(1, ...项列表.map((项) => 项.数值))
  const 步长 = 项列表.length > 1 ? 绘图宽 / (项列表.length - 1) : 0

  const 坐标 = 项列表.map((项, 下标) => ({
    x: 边距.左 + 步长 * 下标,
    y: 边距.上 + 绘图高 - (项.数值 / 最大值) * 绘图高,
    项,
  }))

  const 折线点 = 坐标.map((点) => `${点.x.toFixed(1)},${点.y.toFixed(1)}`).join(' ')
  const 点与标签 = 坐标
    .map((点) =>
      `<circle cx="${点.x.toFixed(1)}" cy="${点.y.toFixed(1)}" r="4" fill="#2B6CF6" />` +
      `<text x="${点.x.toFixed(1)}" y="${图表高 - 边距.下 + 18}" text-anchor="middle" font-size="12" fill="#5C6472">${点.项.类别}</text>`
    )
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${图表宽} ${图表高}" width="${图表宽}" height="${图表高}">` +
    `<polyline points="${折线点}" fill="none" stroke="#2B6CF6" stroke-width="2" stroke-linejoin="round" />` +
    `<line x1="${边距.左}" y1="${图表高 - 边距.下}" x2="${图表宽 - 边距.右}" y2="${图表高 - 边距.下}" stroke="#E8EBF0" />` +
    点与标签 +
    '</svg>'
}

function 生成饼图(项列表: Array<{ 类别: string; 数值: number }>): string {
  const 中心x = 图表宽 / 2
  const 中心y = 图表高 / 2
  const 半径 = 90
  const 合计 = 项列表.reduce((累计, 项) => 累计 + Math.max(0, 项.数值), 0)

  // 合计为零时均分为等份，避免出现无效路径
  const 份数 = 项列表.length
  const 角度列表 = 项列表.map((项) =>
    合计 > 0 ? (Math.max(0, 项.数值) / 合计) * 360 : 360 / 份数
  )

  let 起始角 = -90
  const 扇形 = 项列表
    .map((项, 下标) => {
      const 角度 = 角度列表[下标]
      const 结束角 = 起始角 + 角度
      const 起点 = 极坐标(中心x, 中心y, 半径, 起始角)
      const 终点 = 极坐标(中心x, 中心y, 半径, 结束角)
      const 大弧 = 角度 > 180 ? 1 : 0
      const 路径 =
        `<path d="M ${中心x} ${中心y} L ${起点.x.toFixed(1)} ${起点.y.toFixed(1)} ` +
        `A ${半径} ${半径} 0 ${大弧} 1 ${终点.x.toFixed(1)} ${终点.y.toFixed(1)} Z" ` +
        `fill="${图表配色[下标 % 图表配色.length]}" />`
      // 在扇形中部标注类别
      const 中部 = 极坐标(中心x, 中心y, 半径 * 0.62, 起始角 + 角度 / 2)
      起始角 = 结束角
      return (
        路径 +
        `<text x="${中部.x.toFixed(1)}" y="${中部.y.toFixed(1)}" text-anchor="middle" font-size="11" fill="#FFFFFF">${项.类别}</text>`
      )
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${图表宽} ${图表高}" width="${图表宽}" height="${图表高}">${扇形}</svg>`
}

function 极坐标(中心x: number, 中心y: number, 半径: number, 角度: number): { x: number; y: number } {
  const 弧度 = (角度 * Math.PI) / 180
  return { x: 中心x + 半径 * Math.cos(弧度), y: 中心y + 半径 * Math.sin(弧度) }
}

/** 生成图表 SVG；数据为空时返回空字符串 */
export function 生成图表Svg(类型: 图表类型, 数据: 图表数据): string {
  const 项列表 = 取有效数据(数据)
  if (项列表.length === 0) {
    return ''
  }
  switch (类型) {
    case '折线图':
      return 生成折线图(项列表)
    case '饼图':
      return 生成饼图(项列表)
    case '柱形图':
    default:
      return 生成柱形图(项列表)
  }
}

export interface 公式模板 {
  键: string
  名称: string
}

/** 可插入的公式结构模板 */
export const 公式模板列表: 公式模板[] = [
  { 键: '分数', 名称: '分数' },
  { 键: '平方根', 名称: '平方根' },
  { 键: '求和', 名称: '求和' },
  { 键: '积分', 名称: '积分' },
  { 键: '上标', 名称: '上标' },
  { 键: '下标', 名称: '下标' },
]

/** 生成公式结构；公式以结构化 HTML 承载，可直接在文档中修改内容 */
export function 生成公式Html(键: string): string {
  switch (键) {
    case '分数':
      return (
        '<span class="wps-formula">' +
        '<span class="wps-formula__分数"><span class="wps-formula__分子">a</span>' +
        '<span class="wps-formula__分母">b</span></span></span>'
      )
    case '平方根':
      return '<span class="wps-formula">√<span class="wps-formula__根号内">x</span></span>'
    case '求和':
      return '<span class="wps-formula">∑<sub>i=1</sub><sup>n</sup> a<sub>i</sub></span>'
    case '积分':
      return '<span class="wps-formula">∫<sub>a</sub><sup>b</sup> f(x) dx</span>'
    case '上标':
      return '<span class="wps-formula">x<sup>2</sup></span>'
    case '下标':
      return '<span class="wps-formula">x<sub>1</sub></span>'
    default:
      return ''
  }
}

export type SmartArt类型 = '流程' | '层级' | '循环'

/** 新建图表时使用的示例数据，内容可在文档中直接替换 */
export const 示例图表数据: 图表数据 = {
  类别: ['一月', '二月', '三月', '四月'],
  数值: [120, 200, 150, 80],
}

/** 新建 SmartArt 时使用的示例节点 */
export const 示例SmartArt节点: string[] = ['节点一', '节点二', '节点三']

/** 生成 SmartArt 结构；节点文本为空时返回空字符串 */
export function 生成SmartArtHtml(类型: SmartArt类型, 节点文本: string[]): string {
  const 节点 = 节点文本.map((项) => 项.trim()).filter((项) => 项.length > 0)
  if (节点.length === 0) {
    return ''
  }

  const 图形 = 节点
    .map((文本, 下标) => {
      const 颜色 = 图表配色[下标 % 图表配色.length]
      // 对用户输入做 HTML 实体编码，防止 XSS 注入
      const 安全文本 = 实体编码(文本)
      if (类型 === '层级') {
        return (
          `<div class="wps-smartart__node" style="margin-left:${下标 * 24}px;border-color:${颜色}">` +
          `<span class="wps-smartart__label">${安全文本}</span></div>`
        )
      }
      return (
        `<div class="wps-smartart__node" style="border-color:${颜色}">` +
        `<span class="wps-smartart__label">${安全文本}</span></div>`
      )
    })
    .join('')

  const 修饰类 = 类型 === '层级' ? 'wps-smartart--层级' : 'wps-smartart--横向'
  return `<div class="wps-smartart ${修饰类}" contenteditable="false">${图形}</div><p><br></p>`
}
