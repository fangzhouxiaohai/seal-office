// Zotero 返回数据归一化。
//
// 独立成模块的原因：这里有两个必须锁定的事实，只有在真实 Zotero 10.0.7 上
// 实测才发现，靠推测写不出来：
//
// 1. Local API 的 `format=csljson` 返回的 `id` 是**完整 URI**
//    （`http://zotero.org/users/local/<库>/items/<条目键>`），不是条目键。
//    直接拿它当文档内 id，会导致同一文献从不同来源加入时被判为两条，
//    回链（zoteroItemKey）也会写成 URI，刷新时匹配不上。
// 2. csljson 只输出 Zotero 转译器真正认得的字段。条目标题、作者等在
//    Zotero 中为空时，csljson 里同样缺失——这不是我们的 bug，是数据本身为空，
//    因此不能伪造默认题名。
import { zoteroItemToCsl, type Zotero条目数据 } from './zoteroItemToCsl'
import type { Csl条目 } from './types'

/** 与主进程一致的返回结构 */
export interface Zotero读取结果 {
  格式: 'csljson' | 'json'
  会话: { 版本: string; 实例: string }
  条目: Array<Record<string, unknown>>
}

/** 从 CSL-JSON 的 id（可能是 URI）中取出 Zotero 条目键 */
export function 提取条目键(id: unknown): string {
  const 原文 = typeof id === 'string' ? id.trim() : ''
  if (原文.length === 0) return ''
  // .../items/<KEY>；键为大写字母与数字
  const 匹配 = /\/items\/([A-Z0-9]+)(?:[/?#]|$)/.exec(原文)
  if (匹配) return 匹配[1]
  // 已经是纯键时原样返回
  if (/^[A-Z0-9]{8}$/.test(原文)) return 原文
  return ''
}

/**
 * 把 Local API 的两种返回格式统一成 CSL 条目。
 *
 * csljson 的 id 会被换成真实条目键，并写入 `zoteroItemKey`，
 * 这样「加入文献库」的重复判定与后续刷新都能对上。
 */
export function 归一Zotero条目(结果: Zotero读取结果): {
  条目: Csl条目[]
  跳过: Array<{ 标识: string; 原因: string }>
} {
  const 条目: Csl条目[] = []
  const 跳过: Array<{ 标识: string; 原因: string }> = []
  const 已收录 = new Set<string>()

  for (const 一项 of 结果.条目) {
    if (!一项 || typeof 一项 !== 'object') {
      跳过.push({ 标识: '未知条目', 原因: 'Zotero 返回了非对象条目' })
      continue
    }
    try {
      let 转换后: Csl条目
      if (结果.格式 === 'csljson') {
        const 键 = 提取条目键(一项.id)
        if (!键) throw new Error('条目缺少可识别的 Zotero 条目键')
        转换后 = {
          ...(一项 as unknown as Csl条目),
          id: 键,
          zoteroItemKey: 键,
        }
      } else {
        转换后 = zoteroItemToCsl(一项 as Zotero条目数据) as unknown as Csl条目
      }
      // 同一批次里重复出现的条目只保留一次
      if (已收录.has(转换后.id)) continue
      已收录.add(转换后.id)
      条目.push(转换后)
    } catch (错误) {
      const 候选 = (一项?.key ?? (一项?.data as Record<string, unknown> | undefined)?.key
        ?? 提取条目键(一项?.id) ?? '未知条目') as string
      跳过.push({ 标识: 候选, 原因: 错误 instanceof Error ? 错误.message : '无法转换' })
    }
  }
  return { 条目, 跳过 }
}
