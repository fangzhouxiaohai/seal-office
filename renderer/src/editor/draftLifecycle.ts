import type { Sheet } from '../sheet/model'
import type { 演示文稿 } from '../ppt/deck'

export type 单文档草稿结果 = { 成功: false; 错误: string } | (
  { 成功: true; 已修改: boolean } & ({ 类型: 'table'; 模型: Sheet[] } | { 类型: 'ppt'; 模型: 演示文稿 })
)
export type 编辑草稿准备结果 = { 成功: false; 标识: string; 错误: string } | {
  成功: true
  已提交: string[]
  表格文档模型: Record<string, Sheet[]>
  演示文档模型: Record<string, 演示文稿>
}

/** Per workspace, never a process-global registry. Snapshots are returned directly
 * so callers do not depend on React having rendered a queued model update yet. */
export function 创建草稿生命周期() {
  const handlers = new Map<string, () => 单文档草稿结果>()
  return {
    注册(标识: string, 处理: () => 单文档草稿结果) {
      handlers.set(标识, 处理)
      return () => { if (handlers.get(标识) === 处理) handlers.delete(标识) }
    },
    准备(标识?: string): 编辑草稿准备结果 {
      const result: Extract<编辑草稿准备结果, { 成功: true }> = { 成功: true, 已提交: [], 表格文档模型: {}, 演示文档模型: {} }
      for (const [id, prepare] of handlers) {
        if (标识 !== undefined && 标识 !== id) continue
        try {
          const draft = prepare()
          if (!draft.成功) return { 成功: false, 标识: id, 错误: draft.错误 }
          if (draft.类型 === 'table') result.表格文档模型[id] = draft.模型
          else result.演示文档模型[id] = draft.模型
          if (draft.已修改) result.已提交.push(id)
        } catch (error) { return { 成功: false, 标识: id, 错误: error instanceof Error ? error.message : '无法提交编辑草稿，请先完成当前编辑' } }
      }
      return result
    },
  }
}
