import { 净化富文本 } from '../editor/sanitizeHtml'

const 临时标识 = 'data-seal-assistant-block'
const 段落选择器 = `p,h1,h2,h3,h4,h5,h6,li,td,th,pre,blockquote,div,[${临时标识}]`
export interface 文字段落 { 标识: string; 元素: HTMLElement; 原文: string }

/** 将混合容器中的直接文字划分成定位块，预览完成后删除临时包裹。 */
export function 构建文字根(html: string): HTMLDivElement {
  const 根 = document.createElement('div'); 根.innerHTML = 净化富文本(html)
  根.querySelectorAll(`[${临时标识}]`).forEach((项) => 项.removeAttribute(临时标识))
  for (const 容器 of [根, ...Array.from(根.querySelectorAll('div,li,td,th,blockquote,section,article'))]) {
    const 孩子 = Array.from(容器.childNodes)
    if (!孩子.some((项) => 项.nodeType === Node.ELEMENT_NODE && (项 as Element).matches('p,h1,h2,h3,h4,h5,h6,ul,ol,div,table,pre,blockquote,section,article'))) continue
    let 分组: Node[] = []
    const 包裹 = () => {
      if (分组.some((项) => Boolean(项.textContent?.trim()) || (项.nodeType === Node.ELEMENT_NODE && (项 as Element).matches('img,br')))) {
        const 块 = document.createElement('span'); 块.setAttribute(临时标识, '')
        容器.insertBefore(块, 分组[0]); 分组.forEach((项) => 块.appendChild(项))
      }
      分组 = []
    }
    for (const 项 of 孩子) {
      if (项.nodeType === Node.ELEMENT_NODE && (项 as Element).matches('p,h1,h2,h3,h4,h5,h6,ul,ol,div,table,pre,blockquote,section,article')) 包裹()
      else 分组.push(项)
    }
    包裹()
  }
  return 根
}

export function 清理文字定位块(根: HTMLElement) {
  根.querySelectorAll(`[${临时标识}]`).forEach((项) => 项.replaceWith(...Array.from(项.childNodes)))
}

export function 收集文字段落(根: HTMLElement): 文字段落[] {
  const 元素 = Array.from(根.querySelectorAll<HTMLElement>(段落选择器)).filter((项) => !项.querySelector(段落选择器))
  if (!元素.length) 元素.push(根)
  return 元素.map((项, 索引) => ({ 标识: `段落-${索引 + 1}`, 元素: 项, 原文: 段落文本(项) }))
}

export function 段落文本(元素: HTMLElement): string {
  let 文本 = ''
  const 遍历 = (节点: Node) => {
    if (节点.nodeType === Node.TEXT_NODE) 文本 += 节点.textContent ?? ''
    else if (节点.nodeName === 'BR') 文本 += '\n'
    else 节点.childNodes.forEach(遍历)
  }
  遍历(元素)
  return 文本
}

/** 标识仅用于发送时快照定位，不写入文档 HTML。 */
export function 生成文字上下文(html: string) {
  const 根 = 构建文字根(html)
  return 收集文字段落(根).map(({ 标识, 元素, 原文 }) => ({
    段落标识: 标识, 原文, 类型: 元素 === 根 ? 'p' : 元素.tagName.toLowerCase(),
    格式: { 对齐: 元素.style.textAlign || 'left', 字号: 元素.style.fontSize || '', 字体: 元素.style.fontFamily || '', 颜色: 元素.style.color || '', 行距: 元素.style.lineHeight || '', 段前: 元素.style.marginTop || '', 段后: 元素.style.marginBottom || '' },
    片段: Array.from(元素.querySelectorAll<HTMLElement>('strong,b,em,i,span,u')).map((项) => ({ 文本: 项.textContent ?? '', 类型: 项.tagName.toLowerCase(), 样式: 项.getAttribute('style') || '' })),
    图片数量: 元素.querySelectorAll('img').length,
  }))
}
