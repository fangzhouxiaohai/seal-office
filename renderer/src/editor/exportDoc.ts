// 导出文档：拼装独立 HTML 文件，或从编辑区 HTML 抽取纯文本。
// 下载通过浏览器原生 Blob 触发，不依赖主进程。

export function 导出为Html(标题: string, 正文Html: string, 页眉Html = '', 页脚Html = ''): string {
  const 安全标题 = 标题.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const 附加样式 = 页眉Html || 页脚Html ? `<style>
@page { margin: 25mm 20mm; }
.seal-print-header { position: fixed; top: 0; left: 0; right: 0; font-size: 10pt; }
.seal-print-footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 10pt; }
.seal-print-layout { width: 100%; border-collapse: collapse; }
.seal-print-layout > thead { display: table-header-group; }
.seal-print-layout > tfoot { display: table-footer-group; }
.seal-print-layout > thead > tr > td, .seal-print-layout > tfoot > tr > td { height: 18mm; }
.seal-print-layout > tbody > tr > td { padding: 0; }
</style>` : ''
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="generator" content="海豹办公 Seal Office">
<title>${安全标题}</title>
${附加样式}
</head>
<body>
${页眉Html ? `<div class="seal-print-header">${页眉Html}</div>` : ''}
${页脚Html ? `<div class="seal-print-footer">${页脚Html}</div>` : ''}
${页眉Html || 页脚Html ? `<table class="seal-print-layout">${页眉Html ? '<thead><tr><td></td></tr></thead>' : ''}${页脚Html ? '<tfoot><tr><td></td></tr></tfoot>' : ''}<tbody><tr><td>${正文Html}</td></tr></tbody></table>` : 正文Html}
</body>
</html>
`
}

export function 导出为文本(正文Html: string): string {
  return 正文Html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** 将由纯文本打开链路生成的逐行段落还原为文本，保留空行和末尾换行。 */
export function 保存为纯文本(正文Html: string): string {
  const 容器 = document.createElement('div')
  容器.innerHTML = 正文Html
  const 子元素 = Array.from(容器.children)
  if (子元素.length > 0 && 子元素.every((元素) => 元素.tagName === 'P' || 元素.tagName === 'DIV')) {
    const 换行映射: Record<string, string> = { crlf: '\r\n', cr: '\r', lf: '\n' }
    const 来源换行 = 子元素.map((元素) => 元素.getAttribute('data-seal-line-ending')).find((值) => 值 && 换行映射[值])
    const 默认换行 = 来源换行 ? 换行映射[来源换行] : '\n'
    const 读取段落文字 = (元素: Element): string => {
      if (元素.childNodes.length === 1 && 元素.firstChild?.nodeName === 'BR') return ''
      const 读取节点 = (节点: Node): string => {
        if (节点.nodeType === 3) return 节点.textContent ?? ''
        if (节点.nodeType !== 1) return ''
        if ((节点 as Element).tagName === 'BR') return 默认换行
        return Array.from(节点.childNodes).map(读取节点).join('')
      }
      return Array.from(元素.childNodes).map(读取节点).join('')
    }
    return 子元素.map((元素, 索引) => {
      const 内容 = 读取段落文字(元素)
      if (索引 === 子元素.length - 1) return 内容
      return 内容 + (换行映射[元素.getAttribute('data-seal-break') ?? ''] ?? 默认换行)
    }).join('')
  }
  return 导出为文本(正文Html)
}

/** 纯文本无法表达的结构和格式必须在覆盖源文件前拦下。 */
export function 纯文本损失项(正文Html: string): string[] {
  const 容器 = document.createElement('div')
  容器.innerHTML = 正文Html
  const 结果: string[] = []
  if (容器.querySelector('table, img, svg, audio, video, .wps-page-break')) 结果.push('表格、图片或分页对象')
  if (容器.querySelector('a[href], h1, h2, h3, h4, h5, h6, strong, b, em, i, u, s, sub, sup, font, [style], [class]')) {
    结果.push('文字格式或链接')
  }
  return 结果
}

/** 与手动保存一致：保留原换行及 JSON 内容，不用格式转换覆盖纯文本。 */
export function 文字文本输出(名称:string,正文Html:string,页眉Html='',页脚Html=''):string {
  if (/\.html?$/i.test(名称)) return 导出为Html(名称.replace(/\.[^.]+$/,''),正文Html,页眉Html,页脚Html)
  const 损失=纯文本损失项(正文Html)
  if(损失.length||页眉Html||页脚Html)throw new Error('纯文本无法保存格式、图片、表格或页眉页脚，请另存为 DOCX')
  const 输出=保存为纯文本(正文Html)
  if(/\.json$/i.test(名称)){try{JSON.parse(输出)}catch{throw new Error('JSON 内容格式无效，请检查后保存')}}
  return 输出
}

/** 依据文档名生成导出文件名，扩展名按目标格式替换 */
export function 生成文件名(文档名: string, 扩展名: string): string {
  const 基准 = 文档名.replace(/\.[^.]+$/, '').trim()
  return `${基准.length > 0 ? 基准 : '未命名文档'}.${扩展名}`
}

/** 触发浏览器下载 */
export function 下载文本(内容: string, 文件名: string, 类型: string): void {
  const 数据块 = new Blob([内容], { type: `${类型};charset=utf-8` })
  const 地址 = URL.createObjectURL(数据块)
  const 链接 = document.createElement('a')
  链接.href = 地址
  链接.download = 文件名
  document.body.appendChild(链接)
  链接.click()
  document.body.removeChild(链接)
  URL.revokeObjectURL(地址)
}
