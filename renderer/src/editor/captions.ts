// 题注与图表目录：为表格与图片生成带编号的题注，并据此生成图表目录。

export type 编号类型 = '表' | '图'

export interface 题注项 {
  类型: 编号类型
  序号: number
  文本: string
}

const 题注类名 = 'wps-caption'
const 编号正则 = /^(表|图)\s*(\d+)/

/** 生成一段题注 HTML */
export function 生成题注(类型: 编号类型, 序号: number, 说明 = ''): string {
  const 主体 = `${类型} ${序号}`
  const 文本 = 说明.trim().length > 0 ? `${主体} ${说明.trim()}` : 主体
  return `<p class="${题注类名}">${文本}</p>`
}

/**
 * 提取文档中的全部题注。
 * 使用 DOM 解析而非正则，避免正文中出现「表 1」字样被误判为题注。
 */
export function 提取题注(html: string): 题注项[] {
  if (html.length === 0) {
    return []
  }

  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  const 节点列表 = Array.from(文档.body.querySelectorAll(`.${题注类名}`))

  return 节点列表
    .map((节点) => {
      const 文本 = (节点.textContent ?? '').trim()
      const 匹配 = 编号正则.exec(文本)
      return {
        类型: (匹配?.[1] ?? '表') as 编号类型,
        序号: Number.parseInt(匹配?.[2] ?? '0', 10),
        文本,
      }
    })
    .filter((项) => 项.文本.length > 0)
}

/** 统计指定类型的题注数量，用于确定下一个编号 */
export function 统计题注(html: string, 类型: 编号类型): number {
  return 提取题注(html).filter((项) => 项.类型 === 类型).length
}

/** 生成图表目录区块的 HTML */
export function 生成图表目录Html(条目: 题注项[]): string {
  if (条目.length === 0) {
    return ''
  }

  const 行 = 条目
    .map((项) => `<p style="margin:0 0 4px">${项.文本}</p>`)
    .join('')

  return (
    '<div class="wps-toc" contenteditable="false">' +
    '<p style="font-weight:600;margin:0 0 8px">图表目录</p>' +
    行 +
    '</div>'
  )
}
