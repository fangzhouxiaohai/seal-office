// 预览输出：打印与导出 HTML 由应用接管（file-viewer 自带按钮在桌面壳内无响应，打印下拉还会被弹窗裁剪）。
// PDF 直接把原始字节交给系统打印；其他格式把当前渲染结果做成独立 HTML 快照再打印或导出。

/** 把预览组件抛出的技术性错误转成可读提示；中文业务错误原样保留。 */
export function 预览错误说明(原文: string): string {
  const 文本 = String(原文 || '').trim()
  if (!文本) return '文件读取失败，请重试'
  if (/namespace|parsererror|xml|unexpected|is not defined|cannot read|undefined|invalid|corrupt|zip|end of central directory/i.test(文本) && !/[一-鿿]/.test(文本))
    return '此文件的内部结构与预览组件不兼容，可用海豹办公打开或下载后查看'
  if (/服务暂时不可用|50[0-9]/.test(文本)) return '服务暂时不可用，请稍后重试；也可以下载文件或用海豹办公打开'
  if (/文件暂时不可用|联系维护人员/.test(文本)) return '云端文件暂时不可用，请联系维护人员；本机若有副本可直接打开'
  return 文本
}

const 转义 = (值: string) => 值.replace(/[&<>"]/g, 字 => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[字]!))

/** 收集当前页面可读取的样式规则，保证快照与预览外观一致。 */
function 收集样式(文档: Document): string {
  const 片段: string[] = []
  for (const 表 of Array.from(文档.styleSheets)) {
    try { 片段.push(Array.from(表.cssRules).map(规则 => 规则.cssText).join('\n')) } catch { /* 跨域样式表不可读，跳过 */ }
  }
  return 片段.join('\n')
}

/** 生成预览快照 HTML：画布转为图片，去掉预览组件自带工具栏，适合打印与离线查看。 */
export function 生成预览HTML(容器: HTMLElement, 标题: string): string {
  const 副本 = 容器.cloneNode(true) as HTMLElement
  const 原画布 = Array.from(容器.querySelectorAll('canvas'))
  Array.from(副本.querySelectorAll('canvas')).forEach((画布, 序号) => {
    const 图 = 容器.ownerDocument.createElement('img')
    try { 图.src = 原画布[序号]?.toDataURL('image/png') || '' } catch { 图.alt = '' }
    图.style.cssText = 画布.style.cssText
    图.width = 原画布[序号]?.width || 画布.width
    图.height = 原画布[序号]?.height || 画布.height
    画布.replaceWith(图)
  })
  副本.querySelectorAll('[class*="toolbar"], [role="toolbar"], script, button').forEach(元素 => 元素.remove())
  const 样式 = 收集样式(容器.ownerDocument)
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${转义(标题)}</title><style>${样式}
html,body{margin:0;background:#fff;height:auto;overflow:visible}
*{overflow:visible!important;max-height:none!important}
@media print{@page{margin:12mm}}</style></head><body>${副本.outerHTML}</body></html>`
}

/** 在浏览器或桌面壳中下载文本文件（桌面壳弹出系统保存对话框）。 */
export function 保存文本文件(名称: string, 内容: string, 类型 = 'text/html;charset=utf-8') {
  const 地址 = URL.createObjectURL(new Blob([内容], { type: 类型 }))
  const 链接 = document.createElement('a')
  链接.href = 地址
  链接.download = 名称
  链接.rel = 'noopener'
  document.body.appendChild(链接)
  链接.click()
  链接.remove()
  setTimeout(() => URL.revokeObjectURL(地址), 60_000)
}

/** Uint8Array 转 base64（分块，避免超长参数栈溢出）。 */
export function 转Base64(字节: Uint8Array): string {
  let 结果 = ''
  for (let i = 0; i < 字节.length; i += 0x8000) 结果 += String.fromCharCode(...字节.subarray(i, i + 0x8000))
  return btoa(结果)
}
