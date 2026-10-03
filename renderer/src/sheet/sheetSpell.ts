import { 检查文本, type 拼写问题 } from '../editor/spellCheck'
import { 写入单元格, 读取单元格, type Sheet } from './model'

export interface 工作表拼写问题 {
  地址: string
  问题: 拼写问题
}

const 标点修正: Record<string, string> = { ',': '，', ';': '；', ':': '：', '!': '！', '?': '？' }

/** 只检查确定性较高的中文重复虚词及中文语境下的半角标点。 */
export function 扫描工作表拼写(工作表: Sheet, 地址列表: readonly string[]): 工作表拼写问题[] {
  return 地址列表.flatMap((地址) => {
    const 原值 = 读取单元格(工作表, 地址).原始值
    if (!原值 || 原值.startsWith('=')) return []
    return 检查文本(原值).map((问题) => ({ 地址, 问题 }))
  })
}

/** 应用已展示的建议；从文本末端回写，避免前一处修改使后续位置偏移。 */
export function 应用工作表拼写建议(工作表: Sheet, 问题列表: readonly 工作表拼写问题[]): Sheet {
  const 分组 = new Map<string, 拼写问题[]>()
  for (const { 地址, 问题 } of 问题列表) {
    分组.set(地址, [...(分组.get(地址) ?? []), 问题])
  }
  let 新表 = 工作表
  for (const [地址, 问题] of 分组) {
    let 文本 = 读取单元格(新表, 地址).原始值
    for (const 项 of 问题.sort((左, 右) => 右.位置 - 左.位置)) {
      if (文本.slice(项.位置, 项.位置 + 项.片段.length) !== 项.片段) continue
      const 替换 = 项.类型 === '重复字符' ? 项.片段[0] : 标点修正[项.片段]
      if (替换) 文本 = `${文本.slice(0, 项.位置)}${替换}${文本.slice(项.位置 + 项.片段.length)}`
    }
    新表 = 写入单元格(新表, 地址, 文本)
  }
  return 新表
}
