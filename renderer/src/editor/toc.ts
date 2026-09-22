// 目录与大纲：从文档 HTML 中提取标题层级，用于生成目录与导航窗格。

export interface 目录项 {
  /** 标题级别，1 至 6 */
  级别: number
  /** 标题文本 */
  文本: string
  /** 在文档中的出现顺序，从 0 开始 */
  序号: number
}

const 标题选择器 = 'h1, h2, h3, h4, h5, h6'

/**
 * 提取文档大纲。
 * 使用 DOM 解析而非正则，避免标题属性或嵌套标签造成误判。
 */
export function 提取大纲(html: string): 目录项[] {
  if (html.length === 0) {
    return []
  }

  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  const 节点列表 = Array.from(文档.body.querySelectorAll(标题选择器))

  return 节点列表
    .map((节点, 下标) => ({
      级别: Number.parseInt(节点.tagName.slice(1), 10),
      文本: (节点.textContent ?? '').trim(),
      序号: 下标,
    }))
    .filter((项) => 项.文本.length > 0)
}

/**
 * 生成目录区块的 HTML。
 * 目录整体标记为不可编辑，避免用户误改；层级以左缩进体现。
 */
export function 生成目录Html(条目: 目录项[]): string {
  if (条目.length === 0) {
    return ''
  }

  const 行 = 条目
    .map((项) => {
      const 缩进 = Math.max(0, 项.级别 - 1) * 16
      return `<p style="margin:0 0 4px;padding-left:${缩进}px">${项.文本}</p>`
    })
    .join('')

  return (
    '<div class="wps-toc" contenteditable="false">' +
    '<p style="font-weight:600;margin:0 0 8px">目录</p>' +
    行 +
    '</div>'
  )
}
