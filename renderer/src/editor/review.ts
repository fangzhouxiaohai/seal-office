// 批注与修订：以显式标记承载协作信息，接受或拒绝时按标记收敛。
//
// 说明：修订采用「显式标记」机制——插入的内容包裹为 .wps-insert，
// 删除的内容包裹为 .wps-delete，由用户显式执行接受或拒绝来收敛。
// 不拦截键盘输入自动标记，因此不会在用户不知情时改变文档内容。

export interface 批注项 {
  编号: number
  内容: string
}

export interface 修订统计 {
  插入数: number
  删除数: number
}

export interface 修订结果 {
  文本: string
  /** 本次处理的修订处数 */
  修订数: number
}

const 批注类名 = 'wps-comment'
const 插入类名 = 'wps-insert'
const 删除类名 = 'wps-delete'

/** 转义 HTML 属性值中的双引号与尖括号 */
function 转义属性(文本: string): string {
  return 文本
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 生成一个批注标记 */
export function 生成批注(编号: number, 内容: string): string {
  return `<span class="${批注类名}" data-编号="${编号}" title="${转义属性(内容)}">[批注 ${编号}]</span>`
}

/** 提取文档中的全部批注 */
export function 提取批注(html: string): 批注项[] {
  if (html.length === 0) {
    return []
  }
  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(文档.body.querySelectorAll(`.${批注类名}`)).map((节点) => ({
    编号: Number.parseInt(节点.getAttribute('data-编号') ?? '0', 10),
    内容: 节点.getAttribute('title') ?? '',
  }))
}

/** 按编号删除批注，返回删除后的内容与删除处数 */
export function 删除批注(html: string, 编号: number): { 文本: string; 删除数: number } {
  if (html.length === 0) {
    return { 文本: html, 删除数: 0 }
  }
  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  const 目标 = Array.from(文档.body.querySelectorAll(`.${批注类名}[data-编号="${编号}"]`))
  目标.forEach((节点) => 节点.remove())
  return { 文本: 目标.length > 0 ? 文档.body.innerHTML : html, 删除数: 目标.length }
}

export function 生成插入标记(文本: string): string {
  return `<span class="${插入类名}">${文本}</span>`
}

export function 生成删除标记(文本: string): string {
  return `<span class="${删除类名}">${文本}</span>`
}

/** 统计插入与删除标记数量 */
export function 统计修订(html: string): 修订统计 {
  if (html.length === 0) {
    return { 插入数: 0, 删除数: 0 }
  }
  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  return {
    插入数: 文档.body.querySelectorAll(`.${插入类名}`).length,
    删除数: 文档.body.querySelectorAll(`.${删除类名}`).length,
  }
}

/** 把标记元素替换为其纯文本，用于接受修订 */
function 展开为文本(节点: Element, 文档: Document): void {
  节点.replaceWith(文档.createTextNode(节点.textContent ?? ''))
}

/** 接受修订：插入内容转为正文，删除内容移除 */
export function 接受修订(html: string): 修订结果 {
  if (html.length === 0) {
    return { 文本: html, 修订数: 0 }
  }
  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  const 插入节点 = Array.from(文档.body.querySelectorAll(`.${插入类名}`))
  const 删除节点 = Array.from(文档.body.querySelectorAll(`.${删除类名}`))

  插入节点.forEach((节点) => 展开为文本(节点, 文档))
  删除节点.forEach((节点) => 节点.remove())

  const 修订数 = 插入节点.length + 删除节点.length
  return { 文本: 修订数 > 0 ? 文档.body.innerHTML : html, 修订数 }
}

/** 拒绝修订：插入内容移除，删除内容恢复为正文 */
export function 拒绝修订(html: string): 修订结果 {
  if (html.length === 0) {
    return { 文本: html, 修订数: 0 }
  }
  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  const 插入节点 = Array.from(文档.body.querySelectorAll(`.${插入类名}`))
  const 删除节点 = Array.from(文档.body.querySelectorAll(`.${删除类名}`))

  插入节点.forEach((节点) => 节点.remove())
  删除节点.forEach((节点) => 展开为文本(节点, 文档))

  const 修订数 = 插入节点.length + 删除节点.length
  return { 文本: 修订数 > 0 ? 文档.body.innerHTML : html, 修订数 }
}
