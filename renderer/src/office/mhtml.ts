/** 读取常见单文件网页的 MIME 部件，将内嵌图片引用恢复为数据网址。 */
export function 读取单文件网页(原文: string): string {
  const 边界 = 原文.match(/boundary\s*=\s*(?:"([^"]+)"|([^\s;]+))/i)
  const 部件 = 边界 ? 原文.split(`--${边界[1] ?? 边界[2]}`).slice(1) : [原文]
  const 图片 = new Map<string, string>()
  let 正文: string | undefined
  for (const 部件原文 of 部件) {
    const 分隔 = 部件原文.search(/\r?\n\r?\n/)
    if (分隔 < 0) continue
    const 头 = 部件原文.slice(0, 分隔).replace(/\r?\n[ \t]+/g, ' ')
    const 内容 = 部件原文.slice(分隔).replace(/^\r?\n\r?\n/, '').replace(/\r?\n$/, '')
    const MIME = 头.match(/Content-Type:\s*([^\s;]+)/i)?.[1]?.toLowerCase()
    const 编码 = 头.match(/Content-Transfer-Encoding:\s*([^\s;]+)/i)?.[1]?.toLowerCase()
    let 字节: Uint8Array
    if (编码 === 'base64') {
      try { 字节 = Uint8Array.from(atob(内容.replace(/\s/g, '')), c => c.charCodeAt(0)) } catch { throw new Error('单文件网页的 Base64 部件损坏') }
    } else if (编码 === 'quoted-printable') {
      const 转码 = 内容.replace(/=\r?\n/g, '')
      const 列表: number[] = []
      for (let i = 0; i < 转码.length; i++) {
        if (转码[i] === '=' && /^[0-9a-f]{2}$/i.test(转码.slice(i + 1, i + 3))) { 列表.push(parseInt(转码.slice(i + 1, i + 3), 16)); i += 2 }
        else 列表.push(...new TextEncoder().encode(转码[i]))
      }
      字节 = new Uint8Array(列表)
    } else 字节 = new TextEncoder().encode(内容)
    if (MIME === 'text/html' && 正文 === undefined) {
      const 字符集 = 头.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] ?? 'utf-8'
      try { 正文 = new TextDecoder(字符集).decode(字节) } catch { throw new Error('单文件网页的字符编码不支持') }
    } else if (MIME && /^image\/(png|jpeg|gif|webp|bmp)$/.test(MIME)) {
      let 二进制 = ''
      for (const 字节值 of 字节) 二进制 += String.fromCharCode(字节值)
      const 网址 = `data:${MIME};base64,${btoa(二进制)}`
      const 标识 = 头.match(/Content-ID:\s*<([^>]+)>/i)?.[1]
      const 位置 = 头.match(/Content-Location:\s*([^\r\n]+)/i)?.[1]?.trim()
      if (标识) 图片.set(`cid:${标识}`, 网址)
      if (位置) 图片.set(位置, 网址)
    }
  }
  if (正文 === undefined) throw new Error('单文件网页未包含可读取的 HTML 正文')
  const 文档 = new DOMParser().parseFromString(正文, 'text/html')
  文档.querySelectorAll('img[src]').forEach(img => { const src = img.getAttribute('src')!; if (图片.has(src)) img.setAttribute('src', 图片.get(src)!) })
  return 文档.body.innerHTML
}
