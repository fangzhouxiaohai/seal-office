import type { 演示文稿 } from '../deck'

/** 自定义放映：按页面稳定标识引用一组页面顺序，删除页面后由修复函数维护引用。 */
export interface 自定义放映 {
  id: string
  名称: string
  页面标识列表: string[]
}

export type 放映范围 =
  | { 类型: '全部' }
  | { 类型: '自定义放映'; 放映标识: string }
  | { 类型: '页码范围'; 起始: number; 结束: number }

export interface 放映设置 {
  范围: 放映范围
  换片方式: '使用计时' | '手动'
}

export function 默认放映设置(): 放映设置 {
  return { 范围: { 类型: '全部' }, 换片方式: '使用计时' }
}

const 是记录 = (值: unknown): 值 is Record<string, unknown> =>
  typeof 值 === 'object' && 值 !== null && !Array.isArray(值)
const 非空文字 = (值: unknown): 值 is string => typeof 值 === 'string' && 值.trim().length > 0

export function 读取放映设置(文稿: 演示文稿): 放映设置 {
  const 设置 = 文稿.放映设置
  return 设置 ? { 范围: { ...设置.范围 }, 换片方式: 设置.换片方式 } : 默认放映设置()
}

export function 校验放映设置(输入: unknown): asserts 输入 is 放映设置 {
  if (!是记录(输入) || !是记录(输入.范围)) throw new Error('放映设置无效：缺少放映范围')
  const 范围 = 输入.范围
  if (范围.类型 === '自定义放映') {
    if (!非空文字(范围.放映标识)) throw new Error('放映设置无效：请选择自定义放映')
  } else if (范围.类型 === '页码范围') {
    const 起 = 范围.起始, 止 = 范围.结束
    if (!Number.isInteger(起) || !Number.isInteger(止) || (起 as number) < 1 || (止 as number) < (起 as number)) {
      throw new Error('放映设置无效：页码范围需从第 1 页起且结束页不小于起始页')
    }
  } else if (范围.类型 !== '全部') {
    throw new Error('放映设置无效：放映范围只能是全部、自定义放映或页码范围')
  }
  if (!['使用计时', '手动'].includes(String(输入.换片方式))) {
    throw new Error('放映设置无效：换片方式只能是使用计时或手动')
  }
}

export function 校验自定义放映(输入: unknown, 页面标识: Set<string>): asserts 输入 is 自定义放映[] {
  if (!Array.isArray(输入)) throw new Error('放映设置无效：自定义放映必须是列表')
  const 已用标识 = new Set<string>()
  for (const 项 of 输入) {
    if (!是记录(项) || !非空文字(项.id) || !非空文字(项.名称)) {
      throw new Error('放映设置无效：自定义放映缺少标识或名称')
    }
    if (已用标识.has(项.id)) throw new Error(`放映设置无效：自定义放映标识重复（${项.id}）`)
    已用标识.add(项.id)
    if (!Array.isArray(项.页面标识列表)) throw new Error('放映设置无效：自定义放映缺少页面列表')
    const 本放映页面 = new Set<string>()
    for (const 页标识 of 项.页面标识列表) {
      if (!非空文字(页标识) || !页面标识.has(页标识)) {
        throw new Error(`放映设置无效：自定义放映引用了不存在的页面（${String(页标识)}）`)
      }
      if (本放映页面.has(页标识)) throw new Error(`放映设置无效：自定义放映重复引用同一页面（${页标识}）`)
      本放映页面.add(页标识)
    }
  }
}

/** 创建自定义放映；页面标识必须来自当前文稿且不重复。 */
export function 创建自定义放映(文稿: 演示文稿, 名称: string, 页面标识列表: string[]): 自定义放映 {
  if (!非空文字(名称)) throw new Error('请填写自定义放映名称')
  const 可用标识 = new Set(文稿.幻灯片列表.map(页 => 页.id))
  const 放映: 自定义放映 = { id: crypto.randomUUID(), 名称: 名称.trim(), 页面标识列表: [...页面标识列表] }
  校验自定义放映([放映], 可用标识)
  return 放映
}

/**
 * 删除页面后修复引用：移除失效页面标识，丢弃变空的自定义放映；
 * 所选自定义放映不存在时回退到全部范围。未发生修改时返回原对象。
 */
export function 修复自定义放映引用(文稿: 演示文稿): 演示文稿 {
  const 页面标识 = new Set(文稿.幻灯片列表.map(页 => 页.id))
  let 有修改 = false
  const 新放映 = (文稿.自定义放映 ?? []).flatMap(项 => {
    const 保留 = 项.页面标识列表.filter(标识 => 页面标识.has(标识))
    if (保留.length !== 项.页面标识列表.length) 有修改 = true
    if (保留.length === 0) { 有修改 = true; return [] }
    return [{ ...项, 页面标识列表: 保留 }]
  })
  let 新设置 = 文稿.放映设置
  if (新设置 !== undefined && 新设置.范围.类型 === '自定义放映') {
    const 所选标识 = 新设置.范围.放映标识
    if (!新放映.some(项 => 项.id === 所选标识)) {
      新设置 = { ...新设置, 范围: { 类型: '全部' } }
      有修改 = true
    }
  }
  if (!有修改) return 文稿
  return { ...文稿, 自定义放映: 新放映, ...(新设置 === 文稿.放映设置 ? {} : { 放映设置: 新设置 }) }
}

/** 计算实际放映顺序：常规放映跳过隐藏页，自定义放映按显式顺序包含隐藏页。 */
export function 计算放映序列(文稿: 演示文稿, 设置: 放映设置 = 读取放映设置(文稿)): number[] {
  校验放映设置(设置)
  const 页面列表 = 文稿.幻灯片列表
  const 可见 = (索引: number) => 页面列表[索引] !== undefined && !页面列表[索引].隐藏
  let 序列: number[] = []
  if (设置.范围.类型 === '全部') {
    序列 = 页面列表.map((_, 索引) => 索引).filter(可见)
  } else if (设置.范围.类型 === '自定义放映') {
    const 放映 = (文稿.自定义放映 ?? []).find(项 => 项.id === (设置.范围 as { 放映标识: string }).放映标识)
    if (!放映) throw new Error('所选自定义放映不存在，请重新选择放映范围')
    if (放映.页面标识列表.length === 0) throw new Error('所选自定义放映没有页面，请先添加页面后再放映')
    序列 = 放映.页面标识列表
      .map(标识 => 页面列表.findIndex(页 => 页.id === 标识))
      .filter(索引 => 索引 >= 0)
  } else {
    const { 起始, 结束 } = 设置.范围
    if (起始 > 页面列表.length) throw new Error('放映页码范围超出幻灯片数量，请重新设置范围')
    序列 = 页面列表
      .map((_, 索引) => 索引)
      .filter(索引 => 索引 + 1 >= 起始 && 索引 + 1 <= Math.min(结束, 页面列表.length))
      .filter(可见)
  }
  if (序列.length === 0) throw new Error('放映范围中没有可放映的幻灯片，请检查隐藏页与放映范围设置')
  return 序列
}
