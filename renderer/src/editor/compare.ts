// 文档比较：按行做最长公共子序列比对，产出差异序列并转为修订标记。
// 用于「比较」与「合并」——比较给出差异统计，合并把差异写入文档作为修订标记，
// 再由已有的接受修订与拒绝修订命令收敛。

export type 差异类型 = '相同' | '新增' | '删除'

export interface 差异项 {
  类型: 差异类型
  文本: string
}

export interface 差异统计 {
  新增: number
  删除: number
}

/** 求最长公共子序列长度表，供回溯生成差异 */
function 求长度表(甲: string[], 乙: string[]): number[][] {
  const 表: number[][] = Array.from({ length: 甲.length + 1 }, () =>
    new Array<number>(乙.length + 1).fill(0)
  )
  for (let i = 甲.length - 1; i >= 0; i -= 1) {
    for (let j = 乙.length - 1; j >= 0; j -= 1) {
      表[i][j] = 甲[i] === 乙[j] ? 表[i + 1][j + 1] + 1 : Math.max(表[i + 1][j], 表[i][j + 1])
    }
  }
  return 表
}

/** 按行比较两段文本，返回按原顺序排列的差异序列 */
export function 比较文本(原文本: string, 新文本: string): 差异项[] {
  const 原行 = 原文本.split('\n')
  const 新行 = 新文本.split('\n')
  // 两侧都为空时按无差异处理，避免产生一个空行差异
  if (原文本.length === 0 && 新文本.length === 0) {
    return []
  }
  if (原文本.length === 0) {
    return 新行.filter((行) => 行.length > 0).map((行) => ({ 类型: '新增' as const, 文本: 行 }))
  }
  if (新文本.length === 0) {
    return 原行.filter((行) => 行.length > 0).map((行) => ({ 类型: '删除' as const, 文本: 行 }))
  }

  const 表 = 求长度表(原行, 新行)
  const 结果: 差异项[] = []
  let 甲 = 0
  let 乙 = 0
  while (甲 < 原行.length && 乙 < 新行.length) {
    if (原行[甲] === 新行[乙]) {
      结果.push({ 类型: '相同', 文本: 原行[甲] })
      甲 += 1
      乙 += 1
    } else if (表[甲 + 1][乙] >= 表[甲][乙 + 1]) {
      结果.push({ 类型: '删除', 文本: 原行[甲] })
      甲 += 1
    } else {
      结果.push({ 类型: '新增', 文本: 新行[乙] })
      乙 += 1
    }
  }
  while (甲 < 原行.length) {
    结果.push({ 类型: '删除', 文本: 原行[甲] })
    甲 += 1
  }
  while (乙 < 新行.length) {
    结果.push({ 类型: '新增', 文本: 新行[乙] })
    乙 += 1
  }
  return 结果
}

/** 统计新增与删除处数 */
export function 统计差异(差异列表: 差异项[]): 差异统计 {
  return {
    新增: 差异列表.filter((项) => 项.类型 === '新增').length,
    删除: 差异列表.filter((项) => 项.类型 === '删除').length,
  }
}

/** 把差异序列转为带修订标记的 HTML */
export function 生成修订Html(差异列表: 差异项[]): string {
  if (差异列表.length === 0) {
    return ''
  }
  return 差异列表
    .map((项) => {
      if (项.类型 === '相同') {
        return `<p>${项.文本}</p>`
      }
      if (项.类型 === '新增') {
        return `<p><span class="wps-insert">${项.文本}</span></p>`
      }
      return `<p><span class="wps-delete">${项.文本}</span></p>`
    })
    .join('')
}

/** 把一段 HTML 抽取为按段落分隔的纯文本，供比较使用 */
export function 抽取文本(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((行) => 行.trim())
    .filter((行) => 行.length > 0)
    .join('\n')
}
