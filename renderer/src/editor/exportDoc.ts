// 导出文档：拼装独立 HTML 文件，或从编辑区 HTML 抽取纯文本。
// 下载通过浏览器原生 Blob 触发，不依赖主进程。

export function 导出为Html(标题: string, 正文Html: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="generator" content="WPS 模仿办公软件">
<title>${标题}</title>
</head>
<body>
${正文Html}
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
