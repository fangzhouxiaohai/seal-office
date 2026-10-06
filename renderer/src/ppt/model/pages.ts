// 页面合并与拆分：纯函数，保持页面稳定标识唯一，并同步批注与动画引用。
import type { 演示文稿, 幻灯片 } from '../deck'

/** 演示文稿页面数量上限，与界面提示保持一致 */
export const 页面数量上限 = 100

const 生成标识 = (前缀: string) => `${前缀}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** 合并前校验：来源必须是演示文稿，合并后不能超过页面数量上限 */
export function 校验合并(目标: 演示文稿, 来源: 演示文稿): void {
  if (!目标 || !Array.isArray(目标.幻灯片列表)) throw new Error('目标演示文稿无效')
  if (!来源 || !Array.isArray(来源.幻灯片列表)) throw new Error('来源演示文稿无效')
  const 总数 = 目标.幻灯片列表.length + 来源.幻灯片列表.length
  if (总数 > 页面数量上限) throw new Error(`合并后共 ${总数} 页，超过 ${页面数量上限} 页上限，请分批合并`)
}

/** 深拷贝页面并换发新的页面与对象标识，避免合并后标识冲突 */
function 复制页面(页: 幻灯片, 映射: Map<string, string>): 幻灯片 {
  const 新页标识 = 生成标识('slide')
  映射.set(页.id, 新页标识)
  return { ...页, id: 新页标识 }
}

/** 合并：来源页面追加到目标末尾，批注引用按页面映射重写 */
export function 合并演示文稿(目标: 演示文稿, 来源: 演示文稿): 演示文稿 {
  校验合并(目标, 来源)
  const 映射 = new Map<string, string>()
  const 新页 = 来源.幻灯片列表.map(页 => 复制页面(页, 映射))
  const 来源批注 = (来源.批注列表 ?? []).map(批 => ({ ...批, id: 生成标识('批注'), 页标识: 映射.get(批.页标识) ?? 批.页标识 }))
  return {
    ...目标,
    幻灯片列表: [...目标.幻灯片列表, ...新页],
    当前索引: 目标.幻灯片列表.length,
    ...(目标.批注列表 || 来源批注.length ? { 批注列表: [...(目标.批注列表 ?? []), ...来源批注] } : {}),
  }
}

/** 拆分：把选定页面输出为新文稿；拒绝空选择、未知页面与整份全选 */
export function 拆分演示文稿(原稿: 演示文稿, 页面标识列表: string[], 新名称?: string): 演示文稿 {
  if (!原稿 || !Array.isArray(原稿.幻灯片列表)) throw new Error('演示文稿无效')
  if (!Array.isArray(页面标识列表) || 页面标识列表.length === 0) throw new Error('请至少选择一页再拆分')
  const 选定 = new Set(页面标识列表)
  const 页面 = 原稿.幻灯片列表.filter(页 => 选定.has(页.id))
  if (页面.length !== 选定.size) throw new Error('选定页面不存在或已被删除')
  if (页面.length === 原稿.幻灯片列表.length) throw new Error('不能把全部页面拆分出去，请至少保留一页在原文稿')
  const 映射 = new Map<string, string>()
  const 新页 = 页面.map(页 => 复制页面(页, 映射))
  const 批注 = (原稿.批注列表 ?? []).filter(批 => 选定.has(批.页标识)).map(批 => ({ ...批, id: 生成标识('批注'), 页标识: 映射.get(批.页标识) ?? 批.页标识 }))
  return {
    id: 生成标识('deck'),
    name: (新名称 ?? `${原稿.name.replace(/\.[^.]+$/, '')}-拆分.pptx`).trim() || '拆分演示.pptx',
    模型版本: 2,
    当前索引: 0,
    幻灯片列表: 新页,
    资源索引: { ...(原稿.资源索引 ?? {}) },
    ...(批注.length ? { 批注列表: 批注 } : {}),
    ...(原稿.循环放映 !== undefined ? { 循环放映: 原稿.循环放映 } : {}),
  }
}
