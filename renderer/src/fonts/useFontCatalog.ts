import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { 导入字体, 初始化字体目录, 打开字体目录, 读取字体目录快照, 移除字体, 订阅字体目录, 确保字体已注册 } from './fontManager'
import type { 字体记录 } from './types'

export interface 字体族 {
  名称: string
  来源: 字体记录['来源']
  记录: 字体记录[]
  中文: boolean
}

const 来源名: Record<字体记录['来源'], string> = {
  embedded: '文档',
  custom: '我的',
  system: '系统',
  builtin: '内置',
  compat: '兼容',
}

export function 来源标签(来源: 字体记录['来源']): string {
  return 来源名[来源] ?? '系统'
}

/** 同一家族的不同字重合并为一条；优先展示文档嵌入和用户导入的字体。 */
export function 归并字体族(字体: 字体记录[]): 字体族[] {
  const 分组 = new Map<string, 字体族>()
  for (const 记录 of 字体) {
    const 键 = 记录.家族.trim().toLowerCase()
    if (!键) continue
    const 现有 = 分组.get(键)
    if (现有) {
      现有.记录.push(记录)
      if (记录.中文字形) 现有.中文 = true
      continue
    }
    分组.set(键, { 名称: 记录.家族, 来源: 记录.来源, 记录: [记录], 中文: 记录.中文字形 })
  }
  const 序: Record<string, number> = { embedded: 0, custom: 1, system: 2, builtin: 3, compat: 4 }
  return [...分组.values()].sort((左, 右) => {
    const 差 = (序[左.来源] ?? 9) - (序[右.来源] ?? 9)
    if (差 !== 0) return 差
    if (左.中文 !== 右.中文) return 左.中文 ? -1 : 1
    return 左.名称.localeCompare(右.名称, 'zh-CN')
  })
}

/** 字体目录订阅：选择器、设置页和文档预览共用同一份缓存，避免重复扫描。 */
export function useFontCatalog() {
  const 快照 = useSyncExternalStore(订阅字体目录, 读取字体目录快照, 读取字体目录快照)
  const [刷新中, set刷新中] = useState(false)
  useEffect(() => { void 初始化字体目录() }, [])
  const 字体族 = useMemo(() => 归并字体族(快照.字体), [快照])
  const 加载中 = 快照.状态 === '加载中'
  const 刷新 = async () => {
    set刷新中(true)
    try { await 初始化字体目录(true) } finally { set刷新中(false) }
  }
  const 导入 = async () => {
    const 结果 = await 导入字体()
    return 结果
  }
  const 选择字体 = async (名称: string) => {
    const 记录 = 快照.字体.filter((项) => 项.家族 === 名称 || 项.名称 === 名称)
    await 确保字体已注册(记录)
    return 记录
  }
  return {
    字体族,
    全部字体: 快照.字体,
    加载中,
    刷新中,
    状态: 快照.状态,
    错误: 快照.错误,
    刷新,
    导入,
    移除: 移除字体,
    打开目录: 打开字体目录,
    选择字体,
  }
}

export { 确保字体已注册 } from './fontManager'
