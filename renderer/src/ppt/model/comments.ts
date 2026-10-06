// 批注模型：批注与备注相互独立，批注按页面稳定标识与可选对象稳定标识记录线程。
// 全部为纯函数，返回新文稿，便于配合撤销重做与内容快照使用。
import type { 演示文稿 } from '../deck'

export interface 批注回复 {
  id: string
  作者: string
  内容: string
  时间: string
}

export interface 批注 {
  id: string
  页标识: string
  /** 关联的文本框或对象稳定标识；缺省表示整页批注 */
  对象标识?: string
  作者: string
  内容: string
  时间: string
  回复?: 批注回复[]
  /** 只在海豹办公中可编辑的解决状态，原生批注部件没有对应属性 */
  已解决?: boolean
}

export interface 批注位置 {
  页标识: string
  对象标识?: string
}

export const 默认批注作者 = '海豹办公用户'

const 是记录 = (值: unknown): 值 is Record<string, unknown> =>
  typeof 值 === 'object' && 值 !== null && !Array.isArray(值)

const 非空文字 = (值: unknown): 值 is string => typeof 值 === 'string' && 值.trim().length > 0

const 合法时间 = (值: unknown): 值 is string =>
  typeof 值 === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})?$/.test(值) && !Number.isNaN(Date.parse(值))

const 标识 = () => crypto.randomUUID()

/** 当前时间；提取为独立函数便于测试与调用方注入固定时间。 */
const 现在 = () => new Date().toISOString()

/** 校验批注列表结构；内容、作者与时间必须完整，不接受空白批注。 */
export function 校验批注列表(列表: unknown): asserts 列表 is 批注[] {
  if (列表 === undefined) return
  if (!Array.isArray(列表)) throw new Error('批注列表无效')
  const 已用标识 = new Set<string>()
  for (const 项 of 列表) {
    if (!是记录(项) || !非空文字(项.id)) throw new Error('批注标识无效')
    if (已用标识.has(项.id)) throw new Error(`批注标识重复：${项.id}`)
    已用标识.add(项.id)
    if (!非空文字(项.页标识)) throw new Error('批注页面标识无效')
    if (项.对象标识 !== undefined && !非空文字(项.对象标识)) throw new Error('批注对象标识无效')
    if (!非空文字(项.作者)) throw new Error('批注作者无效')
    if (!非空文字(项.内容)) throw new Error('批注内容无效')
    if (!合法时间(项.时间)) throw new Error('批注时间无效')
    if (项.已解决 !== undefined && typeof 项.已解决 !== 'boolean') throw new Error('批注解决状态无效')
    if (项.回复 !== undefined) {
      if (!Array.isArray(项.回复)) throw new Error('批注回复列表无效')
      for (const 回复 of 项.回复) {
        if (!是记录(回复) || !非空文字(回复.id) || !非空文字(回复.作者) || !非空文字(回复.内容) || !合法时间(回复.时间)) {
          throw new Error('批注回复无效')
        }
      }
    }
  }
}

const 列表 = (文稿: 演示文稿) => 文稿.批注列表 ?? []

const 页面存在 = (文稿: 演示文稿, 页标识: string) => 文稿.幻灯片列表.some(页 => 页.id === 页标识)

const 对象存在 = (文稿: 演示文稿, 页标识: string, 对象标识: string) => {
  const 页 = 文稿.幻灯片列表.find(项 => 项.id === 页标识)
  return Boolean(页 && (页.文本框列表.some(框 => 框.id === 对象标识) || (页.对象列表 ?? []).some(对象 => 对象.id === 对象标识)))
}

/** 读取指定页面的批注，按添加顺序返回。 */
export function 读取页面批注(文稿: 演示文稿, 页标识: string): 批注[] {
  return 列表(文稿).filter(项 => 项.页标识 === 页标识)
}

/** 添加一条批注；页面或对象不存在时拒绝，避免产生立即失效的引用。 */
export function 添加批注(
  文稿: 演示文稿,
  输入: { 页标识: string; 对象标识?: string; 内容: string; 作者?: string; 时间?: string }
): { 文稿: 演示文稿; 批注: 批注 } {
  if (!非空文字(输入?.页标识) || !页面存在(文稿, 输入.页标识)) throw new Error('批注页面不存在')
  if (!非空文字(输入.内容)) throw new Error('批注内容无效')
  if (输入.对象标识 !== undefined) {
    if (!非空文字(输入.对象标识) || !对象存在(文稿, 输入.页标识, 输入.对象标识)) throw new Error('批注对象不存在')
  }
  const 批注: 批注 = {
    id: 标识(),
    页标识: 输入.页标识,
    ...(输入.对象标识 === undefined ? {} : { 对象标识: 输入.对象标识 }),
    作者: 非空文字(输入.作者) ? 输入.作者 : 默认批注作者,
    内容: 输入.内容,
    时间: 输入.时间 ?? 现在(),
  }
  校验批注列表([批注])
  return { 文稿: { ...文稿, 批注列表: [...列表(文稿), 批注] }, 批注 }
}

const 更新批注 = (文稿: 演示文稿, 批注标识: string, 修改: (项: 批注) => 批注): 演示文稿 => {
  if (!列表(文稿).some(项 => 项.id === 批注标识)) throw new Error('批注不存在')
  const 结果 = { ...文稿, 批注列表: 列表(文稿).map(项 => (项.id === 批注标识 ? 修改(项) : 项)) }
  校验批注列表(结果.批注列表)
  return 结果
}

/** 回复批注；作者与时间缺省时使用默认作者与当前时间。 */
export function 回复批注(文稿: 演示文稿, 批注标识: string, 内容: string, 作者?: string, 时间?: string): 演示文稿 {
  if (!非空文字(内容)) throw new Error('批注回复内容无效')
  return 更新批注(文稿, 批注标识, 项 => ({
    ...项,
    回复: [...(项.回复 ?? []), { id: 标识(), 作者: 非空文字(作者) ? 作者 : 默认批注作者, 内容, 时间: 时间 ?? 现在() }],
  }))
}

/** 修改批注正文，保留回复与解决状态。 */
export function 修改批注内容(文稿: 演示文稿, 批注标识: string, 内容: string): 演示文稿 {
  if (!非空文字(内容)) throw new Error('批注内容无效')
  return 更新批注(文稿, 批注标识, 项 => ({ ...项, 内容 }))
}

/** 设置解决状态；解决状态只在本应用中可编辑。 */
export function 设置批注解决(文稿: 演示文稿, 批注标识: string, 已解决: boolean): 演示文稿 {
  if (typeof 已解决 !== 'boolean') throw new Error('批注解决状态无效')
  return 更新批注(文稿, 批注标识, 项 => ({ ...项, 已解决 }))
}

/** 删除单条批注；撤销由调用方的历史记录负责。 */
export function 删除批注(文稿: 演示文稿, 批注标识: string): 演示文稿 {
  if (!列表(文稿).some(项 => 项.id === 批注标识)) throw new Error('批注不存在')
  return { ...文稿, 批注列表: 列表(文稿).filter(项 => 项.id !== 批注标识) }
}

/** 删除页面时同步移除该页批注，避免悬挂引用。 */
export function 删除页面批注(文稿: 演示文稿, 页标识: string): 演示文稿 {
  const 保留 = 列表(文稿).filter(项 => 项.页标识 !== 页标识)
  if (保留.length === 列表(文稿).length) return 文稿
  return { ...文稿, 批注列表: 保留 }
}

/** 页面或对象已不存在时批注标记为失效，但内容与回复继续保留。 */
export function 批注对象失效(文稿: 演示文稿, 批注: 批注): boolean {
  if (!页面存在(文稿, 批注.页标识)) return true
  if (批注.对象标识 === undefined) return false
  return !对象存在(文稿, 批注.页标识, 批注.对象标识)
}

/** 按页面顺序查找上一条或下一条批注；到达首尾时返回 null。 */
export function 批注导航(文稿: 演示文稿, 当前页标识: string, 方向: -1 | 1): 批注位置 | null {
  const 页序号 = new Map(文稿.幻灯片列表.map((页, 序号) => [页.id, 序号]))
  const 当前序号 = 页序号.get(当前页标识) ?? (方向 === 1 ? -1 : 文稿.幻灯片列表.length)
  const 候选 = 文稿.幻灯片列表
    .map((页, 序号) => ({ 序号, 页 }))
    .filter(项 => 方向 === 1 ? 项.序号 > 当前序号 : 项.序号 < 当前序号)
    .filter(项 => 列表(文稿).some(批注 => 批注.页标识 === 项.页.id))
  if (候选.length === 0) return null
  const 目标 = 方向 === 1 ? 候选[0] : 候选[候选.length - 1]
  const 首条 = 列表(文稿).find(批注 => 批注.页标识 === 目标.页.id)!
  return { 页标识: 目标.页.id, 对象标识: 首条.对象标识 }
}

export function 批注统计(文稿: 演示文稿): { 总数: number; 未解决: number; 已解决: number } {
  const 全部 = 列表(文稿)
  const 已解决 = 全部.filter(项 => 项.已解决).length
  return { 总数: 全部.length, 未解决: 全部.length - 已解决, 已解决 }
}
