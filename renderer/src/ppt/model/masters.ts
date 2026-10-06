// 母版、版式与占位符继承模型。
// 继承优先级固定为：单页覆盖 > 版式 > 母版 > 文稿主题。全部为纯函数。
import { 创建文本框, 默认背景色, type 幻灯片, type 演示文稿, type 文本框 } from '../deck'
import {
  解析页面主题,
  校验背景填充,
  type 背景填充,
  type 主题定义,
  type 主题配色,
  type 主题色槽,
  type 页面尺寸,
} from './themes'

export type 占位符类型 = '标题' | '正文' | '页脚' | '日期' | '页码'

export const 占位符类型列表: 占位符类型[] = ['标题', '正文', '页脚', '日期', '页码']

export interface 占位符定义 {
  标识: string
  类型: 占位符类型
  x: number
  y: number
  width: number
  height: number
  字号: number
  对齐: 'left' | 'center' | 'right'
  加粗?: boolean
  颜色引用?: 主题色槽
}

export interface 版式定义 {
  标识: string
  名称: string
  母版标识?: string
  占位符列表: 占位符定义[]
  背景填充?: 背景填充
}

export interface 母版定义 {
  标识: string
  名称: string
  版式列表: 版式定义[]
  背景填充?: 背景填充
  配色?: Partial<主题配色>
  字体?: Partial<{ 标题: string; 正文: string }>
}

export interface 继承解析结果 {
  母版: 母版定义
  版式: 版式定义 | null
  主题: 主题定义
  配色: 主题配色
  字体: { 标题: string; 正文: string }
  占位符列表: 占位符定义[]
  页面尺寸: 页面尺寸
}

export const 默认母版标识 = '母版-默认'

/** 版式占位符使用跨版式稳定的标识，切换版式时同一占位符可继续继承。 */
export const 占位符标识 = { 标题: '占位-标题', 正文: '占位-正文', 页脚: '占位-页脚', 日期: '占位-日期', 页码: '占位-页码' } as const

export const 占位符默认几何: Record<占位符类型, Omit<占位符定义, '标识' | '类型'>> = {
  标题: { x: 80, y: 140, width: 800, height: 140, 字号: 44, 对齐: 'center', 加粗: true, 颜色引用: '文本1' },
  正文: { x: 80, y: 220, width: 800, height: 240, 字号: 24, 对齐: 'left', 颜色引用: '文本1' },
  页脚: { x: 240, y: 486, width: 480, height: 30, 字号: 12, 对齐: 'center', 颜色引用: '文本2' },
  日期: { x: 24, y: 486, width: 200, height: 30, 字号: 12, 对齐: 'left', 颜色引用: '文本2' },
  页码: { x: 736, y: 486, width: 200, height: 30, 字号: 12, 对齐: 'right', 颜色引用: '文本2' },
}

export function 创建占位符(类型: 占位符类型, 覆盖: Partial<占位符定义> = {}): 占位符定义 {
  if (!占位符类型列表.includes(类型)) throw new Error(`占位符定义无效：类型不受支持（${String(类型)}）`)
  return { 标识: 占位符标识[类型], 类型, ...占位符默认几何[类型], ...覆盖 }
}

/** 版式名称沿用旧模型的三种版式名时保持兼容字段同步。 */
export const 旧版式名称列表 = ['标题幻灯片', '标题和内容', '空白'] as const

export function 版式占位符列表(名称: string): 占位符定义[] {
  if (名称 === '标题幻灯片') return [创建占位符('标题', { y: 140, height: 140 })]
  if (名称 === '空白') return []
  return [创建占位符('标题'), 创建占位符('正文')]
}

let 标识计数 = 0
const 生成标识 = (前缀: string) => { 标识计数 += 1; return `${前缀}-${Date.now()}-${标识计数}` }

export function 创建母版(名称: string, 标识 = 生成标识('母版')): 母版定义 {
  if (typeof 名称 !== 'string' || !名称.trim()) throw new Error('创建母版失败：请填写母版名称')
  return { 标识, 名称: 名称.trim(), 版式列表: [] }
}

export function 创建版式(名称: string, 母版标识: string, 标识 = 生成标识('版式')): 版式定义 {
  if (typeof 名称 !== 'string' || !名称.trim()) throw new Error('新增版式失败：请填写版式名称')
  return { 标识, 名称: 名称.trim(), 母版标识, 占位符列表: 版式占位符列表(名称.trim()) }
}

export function 创建默认母版(): 母版定义 {
  return {
    标识: 默认母版标识,
    名称: '默认母版',
    版式列表: 旧版式名称列表.map((名称) => ({
      标识: `版式-${名称}`,
      名称,
      母版标识: 默认母版标识,
      占位符列表: 版式占位符列表(名称),
    })),
  }
}

export function 查找版式(母版列表: 母版定义[], 版式标识: string): { 母版: 母版定义; 版式: 版式定义 } | null {
  for (const 母版 of 母版列表) {
    const 版式 = 母版.版式列表.find((项) => 项.标识 === 版式标识)
    if (版式) return { 母版, 版式 }
  }
  return null
}

export function 新增版式(母版列表: 母版定义[], 母版标识: string, 名称: string): 母版定义[] {
  return 母版列表.map((母版) => (母版.标识 === 母版标识
    ? { ...母版, 版式列表: [...母版.版式列表, 创建版式(名称, 母版标识)] }
    : 母版))
}

export function 编辑占位符(
  母版列表: 母版定义[],
  母版标识: string,
  版式标识: string,
  占位符: 占位符定义
): 母版定义[] {
  校验占位符(占位符)
  let 已找到 = false
  const 结果 = 母版列表.map((母版) => {
    if (母版.标识 !== 母版标识) return 母版
    return {
      ...母版,
      版式列表: 母版.版式列表.map((版式) => {
        if (版式.标识 !== 版式标识) return 版式
        已找到 = true
        const 已有 = 版式.占位符列表.some((项) => 项.标识 === 占位符.标识)
        return {
          ...版式,
          占位符列表: 已有
            ? 版式.占位符列表.map((项) => (项.标识 === 占位符.标识 ? { ...占位符 } : 项))
            : [...版式.占位符列表, { ...占位符 }],
        }
      }),
    }
  })
  if (!已找到) throw new Error(`编辑占位符失败：版式不存在（${版式标识}）`)
  return 结果
}

export function 删除版式(
  母版列表: 母版定义[],
  母版标识: string,
  版式标识: string,
  引用中的版式标识: string[] = []
): 母版定义[] {
  if (引用中的版式标识.includes(版式标识)) {
    throw new Error('删除版式失败：仍有幻灯片引用该版式，请先为这些页面选择其他版式')
  }
  return 母版列表.map((母版) => (母版.标识 === 母版标识
    ? { ...母版, 版式列表: 母版.版式列表.filter((项) => 项.标识 !== 版式标识) }
    : 母版))
}

/** 保存前复制母版结构，避免母版被后续编辑就地修改。 */
export function 保存母版列表(母版列表: 母版定义[]): 母版定义[] {
  校验母版列表(母版列表)
  return 母版列表.map((母版) => ({
    ...母版,
    ...(母版.配色 ? { 配色: { ...母版.配色 } } : {}),
    ...(母版.字体 ? { 字体: { ...母版.字体 } } : {}),
    ...(母版.背景填充 ? { 背景填充: { ...母版.背景填充 } } : {}),
    版式列表: 母版.版式列表.map((版式) => ({
      ...版式,
      ...(版式.背景填充 ? { 背景填充: { ...版式.背景填充 } } : {}),
      占位符列表: 版式.占位符列表.map((项) => ({ ...项 })),
    })),
  }))
}

function 校验占位符(占位符: unknown): void {
  if (typeof 占位符 !== 'object' || 占位符 === null) throw new Error('占位符定义无效：不是对象')
  const 项 = 占位符 as Record<string, unknown>
  if (typeof 项.标识 !== 'string' || !项.标识.trim()) throw new Error('占位符定义无效：缺少标识')
  if (!占位符类型列表.includes(项.类型 as 占位符类型)) throw new Error(`占位符定义无效：类型不受支持（${String(项.类型)}）`)
  for (const 键 of ['x', 'y', 'width', 'height', '字号'] as const) {
    if (typeof 项[键] !== 'number' || !Number.isFinite(项[键]) || (键 === 'width' || 键 === 'height' || 键 === '字号' ? (项[键] as number) <= 0 : false)) {
      throw new Error(`占位符定义无效：${键} 不是有效数值`)
    }
  }
  if (!['left', 'center', 'right'].includes(String(项.对齐))) throw new Error('占位符定义无效：对齐方式不受支持')
  if (项.加粗 !== undefined && typeof 项.加粗 !== 'boolean') throw new Error('占位符定义无效：加粗必须是布尔值')
}

export function 校验母版列表(输入: unknown): asserts 输入 is 母版定义[] {
  if (!Array.isArray(输入)) throw new Error('母版列表无效：不是数组')
  const 母版标识集 = new Set<string>()
  for (const 母版 of 输入) {
    if (typeof 母版 !== 'object' || 母版 === null) throw new Error('母版列表无效：存在非对象条目')
    const 项 = 母版 as Record<string, unknown>
    if (typeof 项.标识 !== 'string' || !项.标识.trim() || typeof 项.名称 !== 'string' || !项.名称.trim()) {
      throw new Error('母版列表无效：母版缺少标识或名称')
    }
    if (母版标识集.has(项.标识)) throw new Error(`母版列表无效：母版标识重复（${项.标识}）`)
    母版标识集.add(项.标识)
    if (!Array.isArray(项.版式列表)) throw new Error(`母版列表无效：${项.标识} 缺少版式列表`)
    if (项.背景填充 !== undefined) 校验背景填充(项.背景填充)
    for (const 版式 of 项.版式列表) {
      if (typeof 版式 !== 'object' || 版式 === null) throw new Error('母版列表无效：存在非对象版式')
      const 版式项 = 版式 as Record<string, unknown>
      if (typeof 版式项.标识 !== 'string' || !版式项.标识.trim() || typeof 版式项.名称 !== 'string' || !版式项.名称.trim()) {
        throw new Error('母版列表无效：版式缺少标识或名称')
      }
      if (!Array.isArray(版式项.占位符列表)) throw new Error(`母版列表无效：版式 ${版式项.标识} 缺少占位符列表`)
      if (版式项.背景填充 !== undefined) 校验背景填充(版式项.背景填充)
      const 占位符标识集 = new Set<string>()
      for (const 占位符 of 版式项.占位符列表) {
        校验占位符(占位符)
        const 标 = (占位符 as 占位符定义).标识
        if (占位符标识集.has(标)) throw new Error(`母版列表无效：版式 ${版式项.标识} 占位符标识重复（${标}）`)
        占位符标识集.add(标)
      }
    }
  }
}

function 取母版列表(文稿: 演示文稿): 母版定义[] {
  return 文稿.母版列表 && 文稿.母版列表.length > 0 ? 文稿.母版列表 : [创建默认母版()]
}

/** 按固定优先级解析页面继承：单页覆盖 > 版式 > 母版 > 主题。 */
export function 解析页面继承(文稿: 演示文稿, 页: 幻灯片): 继承解析结果 {
  const 母版列表 = 取母版列表(文稿)
  const 母版 = 母版列表.find((项) => 项.标识 === 页.母版标识) ?? 母版列表[0]
  const 版式 = 母版.版式列表.find((项) => 项.标识 === 页.版式标识)
    ?? 母版.版式列表.find((项) => 项.名称 === 页.版式)
    ?? null
  const 主题 = 解析页面主题(文稿, 页)
  const 配色: 主题配色 = { ...主题.配色, ...(母版.配色 ?? {}) }
  const 字体 = { ...主题.字体, ...(母版.字体 ?? {}) }
  return {
    母版,
    版式,
    主题,
    配色,
    字体,
    占位符列表: 版式?.占位符列表 ?? [],
    页面尺寸: 文稿.页面尺寸 ?? { 宽: 960, 高: 540 },
  }
}

export function 解析页面背景(文稿: 演示文稿, 页: 幻灯片): 背景填充 {
  if (页.背景填充 !== undefined) return 页.背景填充
  if (页.背景继承 === false) return { 类型: '纯色', 颜色: 页.背景色 || 默认背景色 }
  const 继承 = 解析页面继承(文稿, 页)
  return 继承.版式?.背景填充 ?? 继承.母版.背景填充 ?? 继承.主题.背景 ?? { 类型: '纯色', 颜色: 页.背景色 || 默认背景色 }
}

/** 清理版式定义中的可选字段，避免 undefined 进入模型快照。 */
export function 规整版式(版式: 版式定义): 版式定义 {
  return {
    标识: 版式.标识,
    名称: 版式.名称,
    母版标识: 版式.母版标识,
    占位符列表: 版式.占位符列表.map((项) => ({ ...项 })),
    ...(版式.背景填充 ? { 背景填充: 版式.背景填充 } : {}),
  }
}

/** 按版式创建幻灯片：占位符文本框携带主题颜色与字体引用。 */
export function 按版式创建幻灯片(版式: 版式定义, 主题: 主题定义, 标题: string): 幻灯片 {
  if (!版式 || typeof 版式 !== 'object') throw new Error('创建幻灯片失败：版式无效')
  const legacy名称 = (旧版式名称列表 as readonly string[]).includes(版式.名称) ? 版式.名称 : '标题和内容'
  const 页: 幻灯片 = {
    id: 生成标识('slide'),
    title: 标题,
    版式: legacy名称 as 幻灯片['版式'],
    版式标识: 版式.标识,
    母版标识: 版式.母版标识,
    背景色: 主题.配色.背景1 ?? 默认背景色,
    文本框列表: 版式.占位符列表
      .filter((项) => 项.类型 === '标题' || 项.类型 === '正文')
      .map((项) => 按占位符创建文本框(项, 主题)),
  }
  return 页
}

function 按占位符创建文本框(占位符: 占位符定义, 主题: 主题定义): 文本框 {
  const 用途 = 占位符.类型 === '标题' ? '标题' : '正文'
  const 槽 = 占位符.颜色引用 ?? '文本1'
  const 框 = 创建文本框(
    占位符.x, 占位符.y, 占位符.width, 占位符.height,
    占位符.类型 === '标题' ? '单击此处添加标题' : '单击此处添加正文',
    占位符.字号
  )
  框.对齐 = 占位符.对齐
  框.加粗 = 占位符.加粗 === true
  框.占位符 = 占位符.类型
  框.占位符标识 = 占位符.标识
  框.占位符继承 = true
  框.颜色引用 = 槽
  框.颜色 = 主题.配色[槽]
  框.字体引用 = 用途
  框.字体 = 主题.字体[用途]
  return 框
}

/** 单页覆盖：把该文本框标记为不再跟随版式占位符。 */
export function 标记占位符覆盖(页: 幻灯片, 框标识: string): 幻灯片 {
  return {
    ...页,
    文本框列表: 页.文本框列表.map((框) => (框.id === 框标识 ? { ...框, 占位符继承: false } : 框)),
  }
}

function 同步占位符几何(框: 文本框, 占位符: 占位符定义, 主题: 主题定义): { 框: 文本框; 变更: boolean } {
  const 槽 = 占位符.颜色引用 ?? 框.颜色引用
  const 新框: 文本框 = {
    ...框,
    x: 占位符.x, y: 占位符.y, width: 占位符.width, height: 占位符.height,
    字号: 占位符.字号, 对齐: 占位符.对齐,
    ...(占位符.加粗 === undefined ? {} : { 加粗: 占位符.加粗 }),
    ...(槽 ? { 颜色引用: 槽, 颜色: 主题.配色[槽] } : {}),
  }
  const 变更 = 新框.x !== 框.x || 新框.y !== 框.y || 新框.width !== 框.width ||
    新框.height !== 框.height || 新框.字号 !== 框.字号 || 新框.对齐 !== 框.对齐 || 新框.颜色 !== 框.颜色
  return { 框: 变更 ? 新框 : 框, 变更 }
}

/** 同步占位符：只更新仍处于继承状态的文本框，单页覆盖保持不变。 */
export function 同步占位符(文稿: 演示文稿, 页标识: string): { 文稿: 演示文稿; 更新数量: number } {
  const 页 = 文稿.幻灯片列表.find((项) => 项.id === 页标识)
  if (!页) return { 文稿, 更新数量: 0 }
  const 继承 = 解析页面继承(文稿, 页)
  let 更新数量 = 0
  const 文本框列表 = 页.文本框列表.map((框) => {
    if (框.占位符继承 === false || !框.占位符标识) return 框
    const 占位符 = 继承.占位符列表.find((项) => 项.标识 === 框.占位符标识)
    if (!占位符) return 框
    const 结果 = 同步占位符几何(框, 占位符, 继承.主题)
    if (结果.变更) 更新数量 += 1
    return 结果.框
  })
  const 新版 = { ...页, 文本框列表 }
  return { 文稿: { ...文稿, 幻灯片列表: 文稿.幻灯片列表.map((项) => (项.id === 页标识 ? 新版 : 项)) }, 更新数量 }
}

/** 套用版式：保留已有文本框、对象与备注，只补齐缺失占位符并同步继承中的几何。 */
export function 套用版式(文稿: 演示文稿, 页标识: string, 版式标识: string): 演示文稿 {
  const 页 = 文稿.幻灯片列表.find((项) => 项.id === 页标识)
  if (!页) return 文稿
  const 母版列表 = 取母版列表(文稿)
  const 找到 = 查找版式(母版列表, 版式标识)
  if (!找到) throw new Error(`套用版式失败：找不到版式（${版式标识}）`)
  const { 版式 } = 找到
  const 主题 = 解析页面主题(文稿, 页)
  const 新增: 文本框[] = []
  const 文本框列表 = 页.文本框列表.map((框) => {
    if (!框.占位符标识) return 框
    const 占位符 = 版式.占位符列表.find((项) => 项.标识 === 框.占位符标识)
    if (!占位符) return 框
    return 框.占位符继承 === false ? 框 : 同步占位符几何(框, 占位符, 主题).框
  })
  for (const 占位符 of 版式.占位符列表) {
    if (占位符.类型 !== '标题' && 占位符.类型 !== '正文') continue
    if (文本框列表.some((框) => 框.占位符标识 === 占位符.标识)) continue
    新增.push(按占位符创建文本框(占位符, 主题))
  }
  const legacy名称 = (旧版式名称列表 as readonly string[]).includes(版式.名称) ? 版式.名称 : 页.版式
  const 新版: 幻灯片 = {
    ...页,
    版式: legacy名称 as 幻灯片['版式'],
    版式标识: 版式.标识,
    母版标识: 版式.母版标识 ?? 页.母版标识,
    文本框列表: [...文本框列表, ...新增],
  }
  return { ...文稿, 幻灯片列表: 文稿.幻灯片列表.map((项) => (项.id === 页标识 ? 新版 : 项)) }
}

/** 应用母版：替换同标识母版并同步受影响页面，显式颜色与内容保持原样。 */
export function 应用母版(文稿: 演示文稿, 母版: 母版定义): 演示文稿 {
  校验母版列表([母版])
  const 已有 = 取母版列表(文稿)
  const 母版列表 = 已有.some((项) => 项.标识 === 母版.标识)
    ? 已有.map((项) => (项.标识 === 母版.标识 ? 母版 : 项))
    : [...已有, 母版]
  let 结果: 演示文稿 = { ...文稿, 母版列表 }
  for (const 页 of 文稿.幻灯片列表) {
    if (页.母版标识 !== undefined && 页.母版标识 !== 母版.标识) continue
    结果 = 同步占位符(结果, 页.id).文稿
  }
  return 结果
}

export interface 继承选项 {
  背景?: boolean
  占位符?: boolean
}

/** 解除继承：把当前继承值固化为单页覆盖，后续母版与版式变化不再影响本页。 */
export function 解除继承(文稿: 演示文稿, 页标识: string, 选项: 继承选项 = {}): 演示文稿 {
  const 背景 = 选项.背景 !== false
  const 占位符 = 选项.占位符 !== false
  const 页 = 文稿.幻灯片列表.find((项) => 项.id === 页标识)
  if (!页) return 文稿
  const 新版: 幻灯片 = {
    ...页,
    ...(背景 ? { 背景填充: 解析页面背景(文稿, 页), 背景继承: false } : {}),
    ...(占位符 ? { 文本框列表: 页.文本框列表.map((框) => (框.占位符标识 ? { ...框, 占位符继承: false } : 框)) } : {}),
  }
  return { ...文稿, 幻灯片列表: 文稿.幻灯片列表.map((项) => (项.id === 页标识 ? 新版 : 项)) }
}

/** 恢复继承：清除单页覆盖并重新跟随版式占位符。 */
export function 恢复继承(文稿: 演示文稿, 页标识: string, 选项: 继承选项 = {}): 演示文稿 {
  const 背景 = 选项.背景 !== false
  const 占位符 = 选项.占位符 !== false
  const 页 = 文稿.幻灯片列表.find((项) => 项.id === 页标识)
  if (!页) return 文稿
  let 新版: 幻灯片 = { ...页 }
  if (背景) {
    const { 背景填充: _背景覆盖, 背景继承: _背景继承, ...无背景 } = 新版
    新版 = 无背景 as 幻灯片
  }
  if (占位符) {
    新版 = { ...新版, 文本框列表: 新版.文本框列表.map((框) => (框.占位符标识 ? { ...框, 占位符继承: true } : 框)) }
  }
  const 结果 = { ...文稿, 幻灯片列表: 文稿.幻灯片列表.map((项) => (项.id === 页标识 ? 新版 : 项)) }
  return 占位符 ? 同步占位符(结果, 页标识).文稿 : 结果
}
