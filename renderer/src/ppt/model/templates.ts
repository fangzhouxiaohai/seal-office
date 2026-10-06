// 本地模板：预览、应用与资源归档。
// 模板应用只解引用模板主题与母版，保留文稿原有文字、图片、备注与链接。
import { type 演示文稿, type 幻灯片 } from '../deck'
import { 收集演示资源标识 } from './migrations'
import {
  应用主题,
  校验主题定义,
  校验页面尺寸,
  主题文本格式,
  type 存储后端,
  type 主题定义,
  type 页面尺寸,
  type 主题变更摘要,
} from './themes'
import { 保存母版列表, 校验母版列表, 套用版式, type 母版定义 } from './masters'

export interface 模板资源条目 {
  标识: string
  类型: string
  数据: string
}

export interface 本地模板 {
  标识: string
  名称: string
  主题: 主题定义
  母版列表: 母版定义[]
  页面尺寸?: 页面尺寸
  资源: 模板资源条目[]
}

export interface 本地模板库 {
  列出: () => 本地模板[]
  保存: (模板: 本地模板) => void
  删除: (标识: string) => void
}

export const 模板存储键 = 'seal-office.ppt.templates.v1'

const 是记录 = (值: unknown): 值 is Record<string, unknown> =>
  typeof 值 === 'object' && 值 !== null && !Array.isArray(值)

let 模板计数 = 0

/** 从当前文稿创建模板：主题、母版、页面尺寸与资源索引一并归档。 */
export function 从文稿创建模板(文稿: 演示文稿, 名称: string): 本地模板 {
  if (!是记录(文稿) || !Array.isArray(文稿.幻灯片列表)) throw new Error('创建模板失败：演示文稿结构无效')
  if (!文稿.主题) throw new Error('创建模板失败：当前文稿没有主题，请先应用主题再保存为模板')
  if (typeof 名称 !== 'string' || !名称.trim()) throw new Error('创建模板失败：请填写模板名称')
  校验主题定义(文稿.主题)
  模板计数 += 1
  return {
    标识: `模板-${Date.now()}-${模板计数}`,
    名称: 名称.trim(),
    主题: { ...文稿.主题, 配色: { ...文稿.主题.配色 }, 字体: { ...文稿.主题.字体 } },
    母版列表: 保存母版列表(文稿.母版列表 ?? []),
    ...(文稿.页面尺寸 ? { 页面尺寸: { ...文稿.页面尺寸 } } : {}),
    资源: Object.entries(文稿.资源索引 ?? {}).map(([标识, 元数据]) => ({ 标识, 类型: 元数据.类型, 数据: '' })),
  }
}

export function 校验本地模板(输入: unknown): asserts 输入 is 本地模板 {
  if (!是记录(输入) || typeof 输入.标识 !== 'string' || !输入.标识.trim() ||
      typeof 输入.名称 !== 'string' || !输入.名称.trim()) {
    throw new Error('模板数据无效：缺少标识或名称')
  }
  try {
    校验主题定义(输入.主题)
  } catch {
    throw new Error('模板数据无效：主题定义损坏')
  }
  校验母版列表(输入.母版列表)
  if (输入.页面尺寸 !== undefined) 校验页面尺寸(输入.页面尺寸)
  if (!Array.isArray(输入.资源)) throw new Error('模板数据无效：缺少资源列表')
  for (const 资源 of 输入.资源) {
    if (!是记录(资源) || typeof 资源.标识 !== 'string' || !资源.标识.trim() || typeof 资源.类型 !== 'string') {
      throw new Error('模板数据无效：资源条目损坏')
    }
  }
}

/** 收集模板引用的资源标识，并核对模板内是否归档了对应条目。 */
export function 收集模板资源(模板: 本地模板): { 引用: string[]; 缺失: string[] } {
  校验本地模板(模板)
  const 引用: string[] = []
  const 加入 = (填充?: { 类型: string; 资源标识?: string }) => {
    if (填充?.类型 === '图片' && 填充.资源标识) 引用.push(填充.资源标识)
  }
  加入(模板.主题.背景 as never)
  for (const 母版 of 模板.母版列表) {
    加入(母版.背景填充 as never)
    for (const 版式 of 母版.版式列表) 加入(版式.背景填充 as never)
  }
  const 已有 = new Set(模板.资源.map((项) => 项.标识))
  return { 引用, 缺失: 引用.filter((标识) => !已有.has(标识)) }
}

/** 应用模板的核心计算：不落库，供预览与确认共用。 */
function 计算应用模板(文稿: 演示文稿, 模板: 本地模板): { 文稿: 演示文稿; 变更: 主题变更摘要 } {
  校验本地模板(模板)
  const { 缺失 } = 收集模板资源(模板)
  if (缺失.length > 0) throw new Error(`应用模板失败：模板资源归档不完整（${缺失.join('、')}）`)
  const 主题化 = 应用主题(文稿, 模板.主题)
  const 资源索引 = { ...主题化.资源索引 }
  for (const 资源 of 模板.资源) {
    if (资源索引[资源.标识]) continue
    if (!资源.数据) throw new Error(`应用模板失败：模板资源缺少字节（${资源.标识}），请重新导入该模板`)
    资源索引[资源.标识] = {
      指纹: 资源.标识,
      类型: 资源.类型,
      字节数: Math.floor(资源.数据.length / 4) * 3 - (资源.数据.endsWith('==') ? 2 : 资源.数据.endsWith('=') ? 1 : 0),
    }
  }
  let 结果: 演示文稿 = {
    ...主题化,
    母版列表: 保存母版列表(模板.母版列表),
    ...(模板.页面尺寸 ? { 页面尺寸: { ...模板.页面尺寸 } } : {}),
    资源索引,
  }
  // 页面按同名版式重新绑定母版，保留单页覆盖、对象与备注
  for (const 页 of 结果.幻灯片列表) {
    const 目标母版 = 模板.母版列表.find((母版) => 母版.版式列表.some((版式) => 版式.标识 === 页.版式标识))
      ?? 模板.母版列表.find((母版) => 母版.版式列表.some((版式) => 版式.名称 === 页.版式))
    if (!目标母版) continue
    const 版式 = 目标母版.版式列表.find((项) => 项.标识 === 页.版式标识)
      ?? 目标母版.版式列表.find((项) => 项.名称 === 页.版式)
    if (!版式) continue
    结果 = { ...结果, 幻灯片列表: 结果.幻灯片列表.map((项) => (项.id === 页.id ? { ...项, 母版标识: 目标母版.标识 } : 项)) }
    结果 = 套用版式(结果, 页.id, 版式.标识)
  }
  const 变更: 主题变更摘要 = { 更新文本框: 0, 保留显式颜色: 0, 更新字体: 0, 更新背景: 0 }
  for (const [序号, 页] of 文稿.幻灯片列表.entries()) {
    const 新页 = 结果.幻灯片列表[序号]
    if (!新页) continue
    for (const [框序号, 框] of 页.文本框列表.entries()) {
      const 新框 = 新页.文本框列表[框序号]
      if (新框 && 新框.颜色.toLowerCase() !== 框.颜色.toLowerCase()) 变更.更新文本框 += 1
      if (新框 && 新框.字体 !== 框.字体) 变更.更新字体 += 1
      if (!框.颜色引用) 变更.保留显式颜色 += 1
    }
    if (页.背景填充 === undefined && 页.背景继承 !== false) 变更.更新背景 += 1
  }
  return { 文稿: 结果, 变更 }
}

/** 模板预览：返回候选文稿，不写入原模型。 */
export function 预览本地模板(文稿: 演示文稿, 模板: 本地模板): { 文稿: 演示文稿; 变更: 主题变更摘要 } {
  return 计算应用模板(文稿, 模板)
}

export function 应用本地模板(文稿: 演示文稿, 模板: 本地模板): 演示文稿 {
  if (!模板) throw new Error('应用模板失败：模板无效')
  return 计算应用模板(文稿, 模板).文稿
}

/** 核对模板应用后仍保留的正文引用，用于确认前的完整性检查。 */
export function 核对模板应用(原稿: 演示文稿, 应用后: 演示文稿): { 通过: boolean; 问题: string[] } {
  const 问题: string[] = []
  const 原引用 = new Set(收集演示资源标识(原稿))
  const 新引用 = new Set(收集演示资源标识(应用后))
  for (const 标识 of 原引用) if (!新引用.has(标识)) 问题.push(`模板应用后丢失图片引用：${标识}`)
  const 原文本 = 原稿.幻灯片列表.map((页) => 页.文本框列表.map((框) => 框.text).join('\n')).join('\n')
  const 新文本 = 应用后.幻灯片列表.map((页) => 页.文本框列表.map((框) => 框.text).join('\n')).join('\n')
  for (const 行 of 原文本.split('\n')) {
    if (行.trim() && !新文本.includes(行)) 问题.push(`模板应用后丢失文字：${行.slice(0, 20)}`)
  }
  for (const 页 of 原稿.幻灯片列表) {
    const 新页 = 应用后.幻灯片列表.find((项: 幻灯片) => 项.id === 页.id)
    if (!新页) { 问题.push(`模板应用后丢失页面：${页.title}`); continue }
    if ((页.备注 ?? '') !== (新页.备注 ?? '')) 问题.push(`模板应用后备注被修改：${页.title}`)
    if (JSON.stringify(页.对象列表 ?? []) !== JSON.stringify(新页.对象列表 ?? [])) 问题.push(`模板应用后对象被修改：${页.title}`)
  }
  return { 通过: 问题.length === 0, 问题 }
}

function 内置模板后端(): 存储后端 {
  const 全局 = globalThis as unknown as { localStorage?: 存储后端 }
  if (全局.localStorage && typeof 全局.localStorage.getItem === 'function') return 全局.localStorage
  const 数据 = new Map<string, string>()
  return {
    getItem: (键) => 数据.get(键) ?? null,
    setItem: (键, 值) => { 数据.set(键, 值) },
    removeItem: (键) => { 数据.delete(键) },
  }
}

export function 创建模板库(后端: 存储后端 = 内置模板后端()): 本地模板库 {
  const 读取原始 = (): 本地模板[] => {
    const 文本 = 后端.getItem(模板存储键)
    if (!文本) return []
    try {
      const 数据 = JSON.parse(文本) as unknown
      if (!Array.isArray(数据)) return []
      const 结果: 本地模板[] = []
      for (const 项 of 数据) {
        try { 校验本地模板(项); 结果.push(项 as 本地模板) } catch { /* 跳过损坏模板 */ }
      }
      return 结果
    } catch { return [] }
  }
  const 写入 = (列表: 本地模板[]) => 后端.setItem(模板存储键, JSON.stringify(列表))
  return {
    列出: 读取原始,
    保存: (模板) => {
      校验本地模板(模板)
      const 列表 = 读取原始().filter((项) => 项.标识 !== 模板.标识)
      列表.push(模板)
      写入(列表)
    },
    删除: (标识) => 写入(读取原始().filter((项) => 项.标识 !== 标识)),
  }
}

export function 读取模板库(库: 本地模板库): 本地模板[] {
  return 库.列出()
}

/** 模板也支持文本导入导出，格式与主题共用版本号约定。 */
export function 导出模板文本(模板: 本地模板): string {
  校验本地模板(模板)
  return JSON.stringify({ 格式: 主题文本格式, 版本: 1, 类型: '模板', 模板 }, null, 2)
}

export function 导入模板文本(文本: string): 本地模板 {
  let 数据: unknown
  try {
    数据 = JSON.parse(文本)
  } catch {
    throw new Error('导入模板失败：文件不是有效的模板数据')
  }
  if (!是记录(数据) || 数据.格式 !== 主题文本格式 || 数据.类型 !== '模板') {
    throw new Error('导入模板失败：文件格式不是海豹办公模板')
  }
  if (数据.版本 !== 1) throw new Error(`导入模板失败：不支持的模板版本 ${String(数据.版本)}`)
  校验本地模板(数据.模板)
  const 模板 = 数据.模板 as 本地模板
  return { ...模板, 标识: `模板-${Date.now()}-${(模板计数 += 1)}` }
}
