// 主题、配色、字体、背景、页脚与页面尺寸模型。
// 全部为纯函数：返回新对象，预览态只返回候选文稿，绝不写入原模型。
import type { 幻灯片, 文本框, 演示文稿 } from '../deck'

export interface 主题配色 {
  背景1: string
  文本1: string
  背景2: string
  文本2: string
  强调1: string
  强调2: string
  强调3: string
  强调4: string
  强调5: string
  强调6: string
  超链接: string
}

export type 主题色槽 = keyof 主题配色

export const 主题色槽列表: 主题色槽[] = [
  '背景1', '文本1', '背景2', '文本2', '强调1', '强调2', '强调3', '强调4', '强调5', '强调6', '超链接',
]

export type 背景填充 =
  | { 类型: '纯色'; 颜色: string }
  | { 类型: '渐变'; 起始色: string; 结束色: string; 角度: number }
  | { 类型: '图片'; 资源标识: string }

export interface 主题字体 {
  标题: string
  正文: string
}

export interface 主题定义 {
  标识: string
  名称: string
  配色: 主题配色
  字体: 主题字体
  背景?: 背景填充
  来源?: '内置' | '自定义' | '模板'
}

export interface 页脚设置 {
  页脚文本?: string
  显示日期?: boolean
  日期文本?: string
  显示页码?: boolean
  首页不显示?: boolean
}

export interface 页面尺寸 {
  宽: number
  高: number
}

export interface 页脚区域 {
  x: number
  y: number
  width: number
  height: number
}

/** 文字度量注入点：jsdom 内无法真实排版，回归测试使用同一纯函数。 */
export type 文字度量 = (文本: string, 字号: number, 宽度: number) => { 宽度: number; 高度: number }

export interface 文字溢出项 {
  页标识: string
  页序号: number
  框标识: string
  文本框: string
  需要高度: number
  可用高度: number
}

export interface 主题变更摘要 {
  更新文本框: number
  保留显式颜色: number
  更新字体: number
  更新背景: number
}

export interface 完整性结果 {
  通过: boolean
  问题: string[]
  未引用资源: string[]
}

export interface 美化选项 {
  页标识?: string
  左边距?: number
  右边距?: number
  上边距?: number
  统一标题字号?: number
  统一正文字号?: number
}

export const 默认页面尺寸: 页面尺寸 = { 宽: 960, 高: 540 }

export const 页面尺寸预设: Record<'16:9' | '4:3' | '16:10' | '3:2', 页面尺寸> = {
  '16:9': { 宽: 960, 高: 540 },
  '4:3': { 宽: 960, 高: 720 },
  '16:10': { 宽: 960, 高: 600 },
  '3:2': { 宽: 960, 高: 640 },
}

export const 默认主题标识 = '海豹-默认'

/** 自制主题：颜色与字体全部为十六进制与系统字体，避免授权与缺失风险。 */
export const 内置主题列表: 主题定义[] = [
  {
    标识: 默认主题标识,
    名称: '海豹默认',
    配色: {
      背景1: '#FFFFFF', 文本1: '#1A1D24', 背景2: '#F5F7FA', 文本2: '#5A6472',
      强调1: '#2B6CF6', 强调2: '#00A38C', 强调3: '#ED7D31', 强调4: '#7030A0', 强调5: '#C00000', 强调6: '#00838F',
      超链接: '#0563C1',
    },
    字体: { 标题: '微软雅黑', 正文: '微软雅黑' },
    背景: { 类型: '纯色', 颜色: '#FFFFFF' },
    来源: '内置',
  },
  {
    标识: '海豹-锐蓝',
    名称: '海豹锐蓝',
    配色: {
      背景1: '#FFFFFF', 文本1: '#10233F', 背景2: '#EEF3FF', 文本2: '#4A5C78',
      强调1: '#1B4FD8', 强调2: '#00A0C6', 强调3: '#F2994A', 强调4: '#6C4BD8', 强调5: '#C0392B', 强调6: '#147D8C',
      超链接: '#1B4FD8',
    },
    字体: { 标题: '微软雅黑', 正文: '微软雅黑' },
    背景: { 类型: '纯色', 颜色: '#FFFFFF' },
    来源: '内置',
  },
  {
    标识: '海豹-墨绿',
    名称: '海豹墨绿',
    配色: {
      背景1: '#FBFDFB', 文本1: '#16281F', 背景2: '#E8F3EC', 文本2: '#4B6157',
      强调1: '#1F7A4C', 强调2: '#7BAE3F', 强调3: '#D98324', 强调4: '#2E6E7E', 强调5: '#A63A2E', 强调6: '#4C6B2F',
      超链接: '#1F7A4C',
    },
    字体: { 标题: '微软雅黑', 正文: '微软雅黑' },
    背景: { 类型: '纯色', 颜色: '#FBFDFB' },
    来源: '内置',
  },
  {
    标识: '海豹-暖橙',
    名称: '海豹暖橙',
    配色: {
      背景1: '#FFFDF9', 文本1: '#33241A', 背景2: '#FDF0E3', 文本2: '#6B5546',
      强调1: '#E0662B', 强调2: '#F2A03D', 强调3: '#B03A2E', 强调4: '#8E5A2B', 强调5: '#5B4636', 强调6: '#C98A2B',
      超链接: '#C2531F',
    },
    字体: { 标题: '微软雅黑', 正文: '微软雅黑' },
    背景: { 类型: '纯色', 颜色: '#FFFDF9' },
    来源: '内置',
  },
  {
    标识: '海豹-石板',
    名称: '海豹石板',
    配色: {
      背景1: '#FFFFFF', 文本1: '#242A33', 背景2: '#F2F4F7', 文本2: '#5B6472',
      强调1: '#3D5A80', 强调2: '#5C7A99', 强调3: '#98A6B5', 强调4: '#2F3E4E', 强调5: '#7A5C3E', 强调6: '#4E7A6B',
      超链接: '#3D5A80',
    },
    字体: { 标题: '微软雅黑', 正文: '微软雅黑' },
    背景: { 类型: '纯色', 颜色: '#FFFFFF' },
    来源: '内置',
  },
  {
    标识: '海豹-深色',
    名称: '海豹深色',
    配色: {
      背景1: '#1B1F27', 文本1: '#F2F4F8', 背景2: '#242A35', 文本2: '#B7C0CE',
      强调1: '#5B8DEF', 强调2: '#3DC9B0', 强调3: '#F2A65A', 强调4: '#B58BEA', 强调5: '#EF6F6C', 强调6: '#57C7D4',
      超链接: '#8AB4F8',
    },
    字体: { 标题: '微软雅黑', 正文: '微软雅黑' },
    背景: { 类型: '纯色', 颜色: '#1B1F27' },
    来源: '内置',
  },
]

const 是记录 = (值: unknown): 值 is Record<string, unknown> =>
  typeof 值 === 'object' && 值 !== null && !Array.isArray(值)
const 非空文字 = (值: unknown): 值 is string => typeof 值 === 'string' && 值.trim().length > 0
const 有限数 = (值: unknown): 值 is number => typeof 值 === 'number' && Number.isFinite(值)
const 颜色有效 = (值: unknown): 值 is string => typeof 值 === 'string' && /^#[0-9a-f]{6}$/i.test(值)
const 同色 = (甲: unknown, 乙: unknown) => typeof 甲 === 'string' && typeof 乙 === 'string' &&
  甲.toLowerCase() === 乙.toLowerCase()

export function 查找内置主题(标识: string): 主题定义 | undefined {
  return 内置主题列表.find((项) => 项.标识 === 标识)
}

/** 解析页面实际使用的主题：单页主题覆盖优先于整篇主题。 */
export function 解析页面主题(文稿: 演示文稿, 页: 幻灯片): 主题定义 {
  if (页.主题标识) {
    const 指定 = 查找内置主题(页.主题标识)
    if (指定) return 指定
  }
  return 文稿.主题 ?? 查找内置主题(默认主题标识)!
}

export function 校验主题定义(输入: unknown): asserts 输入 is 主题定义 {
  if (!是记录(输入) || !非空文字(输入.标识) || !非空文字(输入.名称) || !是记录(输入.配色)) {
    throw new Error('主题数据无效：缺少标识、名称或配色')
  }
  for (const 槽 of 主题色槽列表) {
    if (!颜色有效(输入.配色[槽])) throw new Error(`主题数据无效：配色缺少 ${槽}`)
  }
  if (!是记录(输入.字体) || !非空文字(输入.字体.标题) || !非空文字(输入.字体.正文)) {
    throw new Error('主题数据无效：缺少标题或正文字体')
  }
  if (输入.背景 !== undefined) 校验背景填充(输入.背景)
  if (输入.来源 !== undefined && !['内置', '自定义', '模板'].includes(String(输入.来源))) {
    throw new Error('主题数据无效：来源不受支持')
  }
}

export function 校验背景填充(输入: unknown): asserts 输入 is 背景填充 {
  if (!是记录(输入)) throw new Error('背景填充无效：不是对象')
  if (输入.类型 === '纯色') {
    if (!颜色有效(输入.颜色)) throw new Error('背景填充无效：纯色需要有效颜色')
    return
  }
  if (输入.类型 === '渐变') {
    if (!颜色有效(输入.起始色) || !颜色有效(输入.结束色) || !有限数(输入.角度)) {
      throw new Error('背景填充无效：渐变需要起始色、结束色与角度')
    }
    return
  }
  if (输入.类型 === '图片') {
    if (!非空文字(输入.资源标识)) throw new Error('背景填充无效：图片背景缺少资源标识')
    return
  }
  throw new Error('背景填充无效：类型不受支持')
}

export function 校验页脚设置(输入: unknown): asserts 输入 is 页脚设置 {
  if (!是记录(输入)) throw new Error('页脚设置无效：不是对象')
  if (输入.页脚文本 !== undefined && typeof 输入.页脚文本 !== 'string') throw new Error('页脚设置无效：页脚文本必须是文字')
  if (输入.日期文本 !== undefined && typeof 输入.日期文本 !== 'string') throw new Error('页脚设置无效：日期文本必须是文字')
  for (const 键 of ['显示日期', '显示页码', '首页不显示'] as const) {
    if (输入[键] !== undefined && typeof 输入[键] !== 'boolean') throw new Error(`页脚设置无效：${键} 必须是布尔值`)
  }
}

export function 校验页面尺寸(尺寸: unknown): asserts 尺寸 is 页面尺寸 {
  if (!是记录(尺寸) || !有限数(尺寸.宽) || !有限数(尺寸.高) ||
      !Number.isInteger(尺寸.宽) || !Number.isInteger(尺寸.高) ||
      尺寸.宽 < 120 || 尺寸.宽 > 10000 || 尺寸.高 < 120 || 尺寸.高 > 10000) {
    throw new Error('页面尺寸无效：宽高必须是 120 到 10000 之间的整数')
  }
}

export function 读取页面尺寸(文稿: 演示文稿): 页面尺寸 {
  if (文稿.页面尺寸 === undefined) return { ...默认页面尺寸 }
  校验页面尺寸(文稿.页面尺寸)
  return { 宽: 文稿.页面尺寸.宽, 高: 文稿.页面尺寸.高 }
}

export function 页面方向(尺寸: 页面尺寸): '横向' | '纵向' {
  return 尺寸.宽 >= 尺寸.高 ? '横向' : '纵向'
}

export function 页脚位置(尺寸: 页面尺寸): { 页码: 页脚区域; 日期: 页脚区域; 页脚: 页脚区域 } {
  const 高 = Math.max(40, Math.round(尺寸.高 * 0.06))
  const 底 = 尺寸.高 - 高 - 8
  const 宽 = Math.min(240, Math.round(尺寸.宽 * 0.25))
  return {
    页码: { x: 尺寸.宽 - 宽 - 24, y: 底, width: 宽, height: 高 },
    日期: { x: 24, y: 底, width: 宽, height: 高 },
    页脚: { x: 宽 + 40, y: 底, width: Math.max(40, 尺寸.宽 - 2 * (宽 + 40)), height: 高 },
  }
}

/** 应用主题：只改写仍由主题驱动的颜色与字体，显式颜色与显式字体原样保留。 */
export function 应用主题(文稿: 演示文稿, 主题: 主题定义): 演示文稿 {
  校验主题定义(主题)
  const 变更: 主题变更摘要 = { 更新文本框: 0, 保留显式颜色: 0, 更新字体: 0, 更新背景: 0 }
  const 幻灯片列表 = 文稿.幻灯片列表.map((页) => {
    const 旧主题 = 解析页面主题(文稿, 页)
    const 目标主题 = 页.主题标识 && 页.主题标识 !== 主题.标识 ? 旧主题 : 主题
    const 文本框列表 = 页.文本框列表.map((框) => 主题化文本框(框, 旧主题, 目标主题, 变更))
    if (页.背景继承 !== false && 页.背景填充 === undefined) 变更.更新背景 += 1
    return { ...页, 文本框列表 }
  })
  return { ...文稿, 主题: { ...主题, 配色: { ...主题.配色 }, 字体: { ...主题.字体 } }, 幻灯片列表 }
}

function 主题化文本框(框: 文本框, 旧主题: 主题定义, 新主题: 主题定义, 变更: 主题变更摘要): 文本框 {
  let 结果 = 框
  const 槽 = 框.颜色引用
  if (槽) {
    if (同色(框.颜色, 旧主题.配色[槽])) {
      const 新颜色 = 新主题.配色[槽]
      if (!同色(新颜色, 框.颜色)) {
        结果 = { ...结果, 颜色: 新颜色 }
        变更.更新文本框 += 1
      }
    } else {
      // 用户改过颜色：保留显式颜色并解除主题引用
      const { 颜色引用: _引用, ...其余 } = 结果
      结果 = 其余 as 文本框
      变更.保留显式颜色 += 1
    }
  } else {
    变更.保留显式颜色 += 1
  }
  const 字体用途 = 框.字体引用
  if (字体用途) {
    const 新字体 = 新主题.字体[字体用途]
    if (新字体 && 新字体 !== 结果.字体) {
      结果 = { ...结果, 字体: 新字体 }
      变更.更新字体 += 1
    }
  }
  return 结果
}

/** 从 PPTX 读回的主题若与内置或自定义主题一致，沿用其标识，避免每次打开都产生新标识。 */
export function 匹配内置主题(主题: 主题定义, 候选列表: 主题定义[] = 内置主题列表): 主题定义 {
  const 命中 = 候选列表.find((项) => 项 && 项.配色 && 项.字体 &&
    主题色槽列表.every((槽) => (项.配色[槽] ?? '').toLowerCase() === (主题.配色?.[槽] ?? '').toLowerCase()) &&
    项.字体.标题 === 主题.字体?.标题 && 项.字体.正文 === 主题.字体?.正文)
  if (命中) return { ...命中, 配色: { ...命中.配色 }, 字体: { ...命中.字体 } }
  return { ...主题, 标识: 主题.标识?.trim() ? 主题.标识 : `导入主题-${主题.名称}` }
}

/** 主题悬停预览：返回候选文稿与变更摘要，不写入原模型。 */
export function 预览主题(文稿: 演示文稿, 主题: 主题定义): { 文稿: 演示文稿; 变更: 主题变更摘要 } {
  const 候选 = 应用主题(文稿, 主题)
  const 变更: 主题变更摘要 = { 更新文本框: 0, 保留显式颜色: 0, 更新字体: 0, 更新背景: 0 }
  for (const [序号, 页] of 文稿.幻灯片列表.entries()) {
    const 新页 = 候选.幻灯片列表[序号]
    for (const [框序号, 框] of 页.文本框列表.entries()) {
      const 新框 = 新页.文本框列表[框序号]
      if (新框 && !同色(新框.颜色, 框.颜色)) 变更.更新文本框 += 1
      if (新框 && 新框.字体 !== 框.字体) 变更.更新字体 += 1
      if (框.颜色引用 === undefined) 变更.保留显式颜色 += 1
    }
    if (页.背景继承 !== false && 页.背景填充 === undefined) 变更.更新背景 += 1
  }
  return { 文稿: 候选, 变更 }
}

/** 更换配色方案：只更新使用主题色的对象，显式颜色保留。 */
export function 应用配色方案(文稿: 演示文稿, 配色: 主题配色): 演示文稿 {
  for (const 槽 of 主题色槽列表) {
    if (!颜色有效(配色[槽])) throw new Error(`配色方案无效：缺少 ${槽}`)
  }
  const 当前主题 = 文稿.主题 ?? 查找内置主题(默认主题标识)!
  return 应用主题(文稿, { ...当前主题, 配色: { ...配色 } })
}

export interface 统一字体结果 {
  文稿: 演示文稿
  应用数量: number
  跳过显式字体: number
}

/** 统一字体：默认只改写占位符驱动或未显式设置字体的文本框。 */
export function 统一字体(
  文稿: 演示文稿,
  设置: { 标题字体?: string; 正文字体?: string; 覆盖显式字体?: boolean }
): 统一字体结果 {
  if (设置.标题字体 !== undefined && !非空文字(设置.标题字体)) throw new Error('统一字体失败：标题字体无效')
  if (设置.正文字体 !== undefined && !非空文字(设置.正文字体)) throw new Error('统一字体失败：正文字体无效')
  if (设置.标题字体 === undefined && 设置.正文字体 === undefined) throw new Error('统一字体失败：请至少指定一种字体')
  let 应用数量 = 0
  let 跳过显式字体 = 0
  const 幻灯片列表 = 文稿.幻灯片列表.map((页) => ({
    ...页,
    文本框列表: 页.文本框列表.map((框) => {
      const 用途 = 框.字体引用 ?? (框.占位符 === '标题' ? '标题' : '正文')
      const 目标 = 用途 === '标题' ? 设置.标题字体 : 设置.正文字体
      if (目标 === undefined) return 框
      if (!框.字体引用 && !设置.覆盖显式字体) {
        if (框.字体显式 || 框.字体 !== undefined) {
          if (框.字体 === 目标) return 框
          跳过显式字体 += 1
          return 框
        }
      }
      if (框.字体显式 && !设置.覆盖显式字体) {
        if (框.字体 !== 目标) 跳过显式字体 += 1
        return 框
      }
      if (框.字体 === 目标) return 框
      应用数量 += 1
      return { ...框, 字体: 目标 }
    }),
  }))
  return { 文稿: { ...文稿, 幻灯片列表 }, 应用数量, 跳过显式字体 }
}

export function 收集文稿字体(文稿: 演示文稿): Array<{ 字体: string; 用途: '标题' | '正文'; 数量: number }> {
  const 统计 = new Map<string, { 字体: string; 用途: '标题' | '正文'; 数量: number }>()
  for (const 页 of 文稿.幻灯片列表) {
    for (const 框 of 页.文本框列表) {
      const 字体 = 框.字体 ?? (解析页面主题(文稿, 页).字体[框.字体引用 ?? (框.占位符 === '标题' ? '标题' : '正文')])
      if (!非空文字(字体)) continue
      const 用途 = (框.字体引用 ?? (框.占位符 === '标题' ? '标题' : '正文')) as '标题' | '正文'
      const 键 = `${用途}|${字体}`
      const 已有 = 统计.get(键)
      if (已有) 已有.数量 += 1
      else 统计.set(键, { 字体, 用途, 数量: 1 })
    }
  }
  return Array.from(统计.values())
}

/** 缺失字体检查：检测器由界面注入（浏览器使用 document.fonts.check）。 */
export function 检查缺失字体(文稿: 演示文稿, 检测: (字体: string) => boolean): Array<{ 字体: string; 数量: number }> {
  const 统计 = new Map<string, number>()
  for (const 项 of 收集文稿字体(文稿)) {
    if (检测(项.字体)) continue
    统计.set(项.字体, (统计.get(项.字体) ?? 0) + 项.数量)
  }
  return Array.from(统计, ([字体, 数量]) => ({ 字体, 数量 })).sort((甲, 乙) => 乙.数量 - 甲.数量)
}

/** 默认估算：中文按字号等宽，西文按 0.55 倍宽折算，行高 1.35。 */
export function 默认文字度量(文本: string, 字号: number, 宽度: number): { 宽度: number; 高度: number } {
  const 内宽 = Math.max(1, 宽度 - 12)
  const 每行字符数 = Math.max(1, Math.floor(内宽 / (字号 * 0.95)))
  let 行数 = 0
  for (const 段 of String(文本).split('\n')) 行数 += Math.max(1, Math.ceil(段.length / 每行字符数))
  return { 宽度, 高度: Math.round(行数 * 字号 * 1.35 + 8) }
}

/** 文字溢出风险预览：返回明确的需要高度与可用高度，供界面逐条展示。 */
export function 检查文字溢出(文稿: 演示文稿, 度量: 文字度量 = 默认文字度量): 文字溢出项[] {
  const 结果: 文字溢出项[] = []
  for (const [页序号, 页] of 文稿.幻灯片列表.entries()) {
    for (const 框 of 页.文本框列表) {
      if (!框.text) continue
      const 需要 = 度量(框.text, 框.字号, 框.width)
      if (需要.高度 > 框.height + 1) {
        结果.push({ 页标识: 页.id, 页序号, 框标识: 框.id, 文本框: 框.text.slice(0, 40), 需要高度: 需要.高度, 可用高度: 框.height })
      }
    }
  }
  return 结果
}

function 收集背景图片引用(文稿: 演示文稿): string[] {
  const 结果: string[] = []
  const 加入 = (填充?: 背景填充) => { if (填充?.类型 === '图片') 结果.push(填充.资源标识) }
  加入(文稿.主题?.背景)
  for (const 母版 of 文稿.母版列表 ?? []) {
    加入(母版.背景填充)
    for (const 版式 of 母版.版式列表) 加入(版式.背景填充)
  }
  for (const 页 of 文稿.幻灯片列表) 加入(页.背景填充)
  return 结果
}

/** 设置背景：纯色、渐变、图片，支持当前页或全部；图片背景必须已有资源。 */
export function 设置背景(文稿: 演示文稿, 填充: 背景填充 | null, 范围: '当前页' | '全部'): 演示文稿 {
  if (填充 !== null) {
    校验背景填充(填充)
    if (填充.类型 === '图片' && !Object.prototype.hasOwnProperty.call(文稿.资源索引 ?? {}, 填充.资源标识)) {
      throw new Error(`背景图片缺少资源字节：${填充.资源标识}，请先插入该图片再设置为背景`)
    }
  }
  const 修改页 = (页: 幻灯片): 幻灯片 => {
    if (填充 === null) return { ...页, 背景填充: undefined, 背景色: '#FFFFFF' }
    if (填充.类型 === '纯色') return { ...页, 背景填充: 填充, 背景色: 填充.颜色 }
    return { ...页, 背景填充: 填充 }
  }
  if (范围 === '全部') {
    return { ...文稿, 幻灯片列表: 文稿.幻灯片列表.map(修改页) }
  }
  const 当前 = 文稿.幻灯片列表[文稿.当前索引]
  if (!当前) return 文稿
  return { ...文稿, 幻灯片列表: 文稿.幻灯片列表.map((页) => (页.id === 当前.id ? 修改页(页) : 页)) }
}

/** 设置页脚、日期与页码：全部应用写入文稿默认值，当前页写入单页覆盖。 */
export function 设置页脚(文稿: 演示文稿, 设置: 页脚设置 | null, 范围: '当前页' | '全部'): 演示文稿 {
  if (设置 !== null) 校验页脚设置(设置)
  if (范围 === '全部') {
    return {
      ...文稿,
      页脚设置: 设置 ?? undefined,
      幻灯片列表: 文稿.幻灯片列表.map((页) => {
        if (页.页脚 === undefined) return 页
        const { 页脚: _覆盖, ...其余 } = 页
        return 其余 as 幻灯片
      }),
    }
  }
  const 当前 = 文稿.幻灯片列表[文稿.当前索引]
  if (!当前) return 文稿
  return { ...文稿, 幻灯片列表: 文稿.幻灯片列表.map((页) => (页.id === 当前.id ? { ...页, 页脚: 设置 } : 页)) }
}

/** 读取该页实际生效的页脚设置：单页覆盖优先，首页不显示在此处短路。 */
export function 读取有效页脚(文稿: 演示文稿, 页: 幻灯片, 序号: number): 页脚设置 | null {
  if (页.页脚 === null) return null
  const 基线 = 文稿.页脚设置
  const 合并: 页脚设置 | undefined = 页.页脚 || 基线 ? { ...(基线 ?? {}), ...(页.页脚 ?? {}) } : undefined
  if (!合并) return null
  if (合并.首页不显示 && 序号 === 0) return null
  if (合并.页脚文本 === undefined && !合并.显示日期 && !合并.显示页码) return null
  return 合并
}

/** 应用页面尺寸：显式选择缩放内容或保留对象坐标，一次调用只产生一份快照。 */
export function 应用页面尺寸(文稿: 演示文稿, 尺寸: 页面尺寸, 方式: '缩放内容' | '保留坐标'): 演示文稿 {
  校验页面尺寸(尺寸)
  if (方式 !== '缩放内容' && 方式 !== '保留坐标') throw new Error('页面尺寸方式无效：请选择缩放内容或保留坐标')
  const 当前 = 读取页面尺寸(文稿)
  if (当前.宽 === 尺寸.宽 && 当前.高 === 尺寸.高) return { ...文稿, 页面尺寸: { 宽: 尺寸.宽, 高: 尺寸.高 } }
  const 横比 = 尺寸.宽 / 当前.宽
  const 纵比 = 尺寸.高 / 当前.高
  const 缩放值 = (值: number, 比: number) => (方式 === '缩放内容' ? Math.round(值 * 比 * 100) / 100 : 值)
  const 幻灯片列表 = 文稿.幻灯片列表.map((页) => ({
    ...页,
    文本框列表: 页.文本框列表.map((框) => ({
      ...框,
      x: 缩放值(框.x, 横比), y: 缩放值(框.y, 纵比),
      width: 缩放值(框.width, 横比), height: 缩放值(框.height, 纵比),
    })),
    对象列表: 页.对象列表?.map((对象) => ({
      ...对象,
      x: 缩放值(对象.x, 横比), y: 缩放值(对象.y, 纵比),
      width: 缩放值(对象.width, 横比), height: 缩放值(对象.height, 纵比),
    })),
  }))
  return { ...文稿, 页面尺寸: { 宽: 尺寸.宽, 高: 尺寸.高 }, 幻灯片列表 }
}

export function 切换页面方向(文稿: 演示文稿, 方式: '缩放内容' | '保留坐标'): 演示文稿 {
  const 当前 = 读取页面尺寸(文稿)
  return 应用页面尺寸(文稿, { 宽: 当前.高, 高: 当前.宽 }, 方式)
}

/** 本机美化：只做对齐与排版，不生成替代稿，不改文字、图片、备注与链接。 */
export function 本机美化(文稿: 演示文稿, 选项: 美化选项 = {}): { 文稿: 演示文稿; 调整列表: string[] } {
  const 尺寸 = 读取页面尺寸(文稿)
  const 左边距 = 选项.左边距 ?? 80
  const 右边距 = 选项.右边距 ?? 80
  const 上边距 = 选项.上边距 ?? 60
  const 标题字号 = 选项.统一标题字号 ?? 40
  const 正文字号 = 选项.统一正文字号 ?? 24
  if (![左边距, 右边距, 上边距, 标题字号, 正文字号].every(有限数) || 左边距 < 0 || 右边距 < 0 || 上边距 < 0) {
    throw new Error('美化参数无效：边距与字号必须是非负数')
  }
  const 内容宽 = Math.max(120, 尺寸.宽 - 左边距 - 右边距)
  const 调整列表: string[] = []
  const 幻灯片列表 = 文稿.幻灯片列表.map((页, 页序号) => {
    if (选项.页标识 !== undefined && 页.id !== 选项.页标识) return 页
    let 标题底 = 上边距
    let 标题高 = 0
    const 文本框列表 = 页.文本框列表.map((框) => {
      if (框.占位符 === '标题') {
        const 新框: 文本框 = { ...框, x: 左边距, y: 上边距, width: 内容宽, 字号: 标题字号 }
        标题底 = 新框.y + 新框.height
        标题高 = 新框.height
        if (新框.x !== 框.x || 新框.width !== 框.width || 新框.字号 !== 框.字号) {
          调整列表.push(`第 ${页序号 + 1} 页标题对齐到左边距 ${左边距}，字号 ${标题字号}`)
        }
        return 新框
      }
      if (框.占位符 === '正文') {
        const y = 标题高 > 0 ? 标题底 + 24 : Math.max(框.y, 上边距)
        const 新框: 文本框 = { ...框, x: 左边距, y, width: 内容宽, 字号: 正文字号 }
        if (新框.x !== 框.x || 新框.y !== 框.y || 新框.width !== 框.width || 新框.字号 !== 框.字号) {
          调整列表.push(`第 ${页序号 + 1} 页正文对齐到左边距 ${左边距}，与标题间距 24`)
        }
        return 新框
      }
      // 其他文本框只收回溢出画布的部分，不改动用户的对齐意图
      const x = Math.min(Math.max(0, 框.x), Math.max(0, 尺寸.宽 - 框.width))
      const y = Math.min(Math.max(0, 框.y), Math.max(0, 尺寸.高 - 框.height))
      if (x !== 框.x || y !== 框.y) {
        调整列表.push(`第 ${页序号 + 1} 页文本框收回到画布范围内`)
        return { ...框, x, y }
      }
      return 框
    })
    return { ...页, 文本框列表 }
  })
  return { 文稿: { ...文稿, 幻灯片列表 }, 调整列表 }
}

/** 美化预览：与确认应用使用同一纯函数，预览结果不写入文稿模型。 */
export function 预览本机美化(文稿: 演示文稿, 选项: 美化选项 = {}): 演示文稿 {
  return 本机美化(文稿, 选项).文稿
}

/** 检查文字与资源完整性，确认前必须展示实际原因。 */
export function 检查文稿完整性(文稿: 演示文稿): 完整性结果 {
  const 问题: string[] = []
  const 引用 = new Set<string>()
  for (const [页序号, 页] of 文稿.幻灯片列表.entries()) {
    for (const 对象 of 页.对象列表 ?? []) {
      if (!对象.资源标识) continue
      引用.add(对象.资源标识)
      if (!Object.prototype.hasOwnProperty.call(文稿.资源索引 ?? {}, 对象.资源标识)) {
        问题.push(`第 ${页序号 + 1} 页对象 ${对象.id} 缺失资源字节：${对象.资源标识}`)
      }
    }
    if (页.背景填充?.类型 === '图片') {
      引用.add(页.背景填充.资源标识)
      if (!Object.prototype.hasOwnProperty.call(文稿.资源索引 ?? {}, 页.背景填充.资源标识)) {
        问题.push(`第 ${页序号 + 1} 页背景图片缺失资源字节：${页.背景填充.资源标识}`)
      }
    }
    if (页.文本框列表.some((框) => 框.颜色引用 === undefined && !颜色有效(框.颜色))) {
      问题.push(`第 ${页序号 + 1} 页存在无效的文字颜色`)
    }
  }
  for (const 标识 of 收集背景图片引用(文稿)) {
    引用.add(标识)
    if (!Object.prototype.hasOwnProperty.call(文稿.资源索引 ?? {}, 标识)) {
      问题.push(`背景图片缺失资源字节：${标识}`)
    }
  }
  const 未引用资源 = Object.keys(文稿.资源索引 ?? {}).filter((标识) => !引用.has(标识))
  return { 通过: 问题.length === 0, 问题, 未引用资源 }
}

// ==================== 自定义主题与本地主题库 ====================

export interface 存储后端 {
  getItem: (键: string) => string | null
  setItem: (键: string, 值: string) => void
  removeItem: (键: string) => void
}

export interface 本地主题库 {
  列出: () => 主题定义[]
  保存: (主题: 主题定义) => void
  删除: (标识: string) => void
}

export const 主题存储键 = 'seal-office.ppt.themes.v1'

function 内存后端(): 存储后端 {
  const 数据 = new Map<string, string>()
  return {
    getItem: (键) => 数据.get(键) ?? null,
    setItem: (键, 值) => { 数据.set(键, 值) },
    removeItem: (键) => { 数据.delete(键) },
  }
}

function 默认后端(): 存储后端 {
  const 全局 = globalThis as unknown as { localStorage?: 存储后端 }
  if (全局.localStorage && typeof 全局.localStorage.getItem === 'function') return 全局.localStorage
  return 内存后端()
}

export function 创建本地主题存储(后端: 存储后端 = 默认后端()): 本地主题库 {
  const 读取原始 = (): 主题定义[] => {
    const 文本 = 后端.getItem(主题存储键)
    if (!文本) return []
    try {
      const 数据 = JSON.parse(文本) as unknown
      if (!Array.isArray(数据)) return []
      const 结果: 主题定义[] = []
      for (const 项 of 数据) {
        try {
          校验主题定义(项)
          结果.push(项 as 主题定义)
        } catch { /* 单条损坏不影响其他主题，读取时跳过 */ }
      }
      return 结果
    } catch { return [] }
  }
  const 写入 = (列表: 主题定义[]) => 后端.setItem(主题存储键, JSON.stringify(列表))
  return {
    列出: 读取原始,
    保存: (主题) => {
      校验主题定义(主题)
      if (主题.来源 === '内置') throw new Error('内置主题不能保存到本地主题库')
      const 列表 = 读取原始().filter((项) => 项.标识 !== 主题.标识)
      列表.push(主题)
      写入(列表)
    },
    删除: (标识) => 写入(读取原始().filter((项) => 项.标识 !== 标识)),
  }
}

let 自定义主题序号 = 0

export function 创建自定义主题(名称: string, 基础主题: 主题定义): 主题定义 {
  if (!非空文字(名称)) throw new Error('自定义主题失败：请填写主题名称')
  校验主题定义(基础主题)
  自定义主题序号 += 1
  return {
    标识: `自定义-${Date.now()}-${自定义主题序号}`,
    名称: 名称.trim(),
    配色: { ...基础主题.配色 },
    字体: { ...基础主题.字体 },
    ...(基础主题.背景 ? { 背景: { ...基础主题.背景 } } : {}),
    来源: '自定义',
  }
}

export function 保存自定义主题(库: 本地主题库, 主题: 主题定义): void {
  库.保存(主题)
}

export function 读取主题库(库: 本地主题库): 主题定义[] {
  return 库.列出()
}

export function 合并主题库(库: 本地主题库, 主题列表: 主题定义[] = 内置主题列表): 主题定义[] {
  const 结果 = [...主题列表]
  for (const 主题 of 库.列出()) {
    const 下标 = 结果.findIndex((项) => 项.标识 === 主题.标识)
    if (下标 >= 0) 结果[下标] = 主题
    else 结果.push(主题)
  }
  return 结果
}

export function 使用自定义主题(文稿: 演示文稿, 主题: 主题定义): 演示文稿 {
  return 应用主题(文稿, { ...主题, 来源: 主题.来源 ?? '自定义' })
}

export const 主题文本格式 = '海豹办公主题'

export function 导出主题文本(主题: 主题定义): string {
  校验主题定义(主题)
  return JSON.stringify({ 格式: 主题文本格式, 版本: 1, 主题 }, null, 2)
}

export function 导入主题文本(文本: string): 主题定义 {
  let 数据: unknown
  try {
    数据 = JSON.parse(文本)
  } catch {
    throw new Error('导入主题失败：文件不是有效的主题数据')
  }
  if (!是记录(数据) || 数据.格式 !== 主题文本格式) throw new Error('导入主题失败：文件格式不是海豹办公主题')
  if (数据.版本 !== 1) throw new Error(`导入主题失败：不支持的主题版本 ${String(数据.版本)}`)
  const 主题 = 数据.主题
  校验主题定义(主题)
  return { ...(主题 as 主题定义), 来源: (主题 as 主题定义).来源 ?? '自定义' }
}
