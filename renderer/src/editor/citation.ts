// 引文与书目：维护文献条目，为正文生成引文标记，并据此生成参考文献列表。
// 文献数据保存在编辑会话内，不写入文件。

export interface 文献 {
  id: string
  作者: string
  标题: string
  年份: string
  来源: string
}

const 引文类名 = 'wps-citation'

/** 生成一个引文标记，形如 [1] */
export function 生成引文标记(序号: number): string {
  return `<span class="${引文类名}" data-序号="${序号}">[${序号}]</span>`
}

/** 提取文档中出现的引文序号，按升序去重 */
export function 提取引文序号(html: string): number[] {
  if (html.length === 0) {
    return []
  }
  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  const 序号列表 = Array.from(文档.body.querySelectorAll(`.${引文类名}`))
    .map((节点) => Number.parseInt(节点.getAttribute('data-序号') ?? '0', 10))
    .filter((值) => Number.isFinite(值) && 值 > 0)
  return [...new Set(序号列表)].sort((甲, 乙) => 甲 - 乙)
}

/** 按作者、标题、来源、年份的顺序拼接单条文献，缺失要素不产生多余分隔符 */
export function 格式化文献(文献: 文献): string {
  const 部分 = [文献.作者, 文献.标题, 文献.来源, 文献.年份]
    .map((项) => 项.trim())
    .filter((项) => 项.length > 0)
  return `${部分.join('. ')}.`
}

/** 生成参考文献列表；无文献时返回空字符串 */
export function 生成书目Html(文献列表: 文献[]): string {
  if (文献列表.length === 0) {
    return ''
  }
  const 行 = 文献列表
    .map((项, 下标) => `<p style="margin:0 0 4px">[${下标 + 1}] ${格式化文献(项)}</p>`)
    .join('')
  return (
    '<div class="wps-bibliography" contenteditable="false">' +
    '<p style="font-weight:600;margin:0 0 8px">参考文献</p>' +
    行 +
    '</div>'
  )
}

/** 依据现有文献数量生成下一个标识 */
export function 生成文献标识(现有: 文献[]): string {
  return `ref-${现有.length + 1}`
}

/** 新建一条空白文献 */
export function 新建文献(现有: 文献[]): 文献 {
  return { id: 生成文献标识(现有), 作者: '', 标题: '', 年份: '', 来源: '' }
}
