// OOXML 命名空间修补（仅用于预览副本）：
// 部分文档的 XML 部件使用了 w14/w15/w16 等扩展前缀，却没有在根元素声明命名空间（Word 能容忍，浏览器严格的
// XML 解析器会报 “Namespace prefix w15 ... is not defined” 并把错误页渲染进预览区）。这里只给预览副本的根元素
// 补全缺失的 xmlns 声明，不修改原文件、下载内容与云空间数据。
import JSZip from 'jszip'

/** Office 常见扩展前缀的标准命名空间；未知前缀使用占位命名空间，使 XML 合法即可。 */
const 已知命名空间: Record<string, string> = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  v: 'urn:schemas-microsoft-com:vml',
  o: 'urn:schemas-microsoft-com:office:office',
  w10: 'urn:schemas-microsoft-com:office:word',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  w15: 'http://schemas.microsoft.com/office/word/2012/wordml',
  w16: 'http://schemas.microsoft.com/office/word/2018/wordml',
  w16se: 'http://schemas.microsoft.com/office/word/2015/wordml/symex',
  w16cid: 'http://schemas.microsoft.com/office/word/2016/wordml/cid',
  w16cex: 'http://schemas.microsoft.com/office/word/2018/wordml/cex',
  w16sdtdh: 'http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash',
  w16du: 'http://schemas.microsoft.com/office/word/2023/wordml/word16du',
  wp14: 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
  wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
  wpg: 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
  wpc: 'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas',
  wpi: 'http://schemas.microsoft.com/office/word/2010/wordprocessingInk',
  wne: 'http://schemas.microsoft.com/office/word/2006/wordml',
  a14: 'http://schemas.microsoft.com/office/drawing/2010/main',
  x14ac: 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac',
  x14: 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main',
  xr: 'http://schemas.microsoft.com/office/spreadsheetml/2014/revision',
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
  p15: 'http://schemas.microsoft.com/office/powerpoint/2012/main',
}

const 保留前缀 = new Set(['xml', 'xmlns'])

/** 给单个 XML 文本的根元素补全未声明的前缀；无需修补时原样返回。 */
export function 补全命名空间(xml: string): string {
  const 根 = /<([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)(\s[^>]*?)?(\/?)>/.exec(xml.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, m => ' '.repeat(m.length)))
  if (!根) return xml
  const 已声明 = new Set<string>()
  for (const 匹配 of xml.matchAll(/\bxmlns:([A-Za-z_][\w.-]*)\s*=/g)) 已声明.add(匹配[1])
  const 使用 = new Set<string>()
  // 元素名前缀
  for (const 匹配 of xml.matchAll(/<\/?([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*/g)) 使用.add(匹配[1])
  // 属性名前缀（位于标签内、等号之前）
  for (const 标签 of xml.matchAll(/<[A-Za-z_][^<>]*>/g)) for (const 匹配 of 标签[0].matchAll(/\s([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*\s*=/g)) 使用.add(匹配[1])
  const 缺失 = [...使用].filter(前缀 => !已声明.has(前缀) && !保留前缀.has(前缀))
  if (!缺失.length) return xml
  const 声明 = 缺失.map(前缀 => ` xmlns:${前缀}="${已知命名空间[前缀] ?? 'urn:seal-office:preview:undeclared:' + 前缀}"`).join('')
  const 插入点 = 根.index + 1 + 根[1].length
  return xml.slice(0, 插入点) + 声明 + xml.slice(插入点)
}

const OOXML = /\.(docx|docm|dotx|dotm|xlsx|xlsm|xltx|xltm|pptx|pptm|potx|potm|ppsx|ppsm)$/i

/** 修补 OOXML 包中所有 XML 部件；非 OOXML 或无需修补时返回原字节，修补失败也返回原字节。 */
export async function 修补OOXML命名空间(名称: string, 字节: Uint8Array): Promise<{ 字节: Uint8Array; 已修补: string[] }> {
  if (!OOXML.test(名称)) return { 字节, 已修补: [] }
  try {
    const 包 = await JSZip.loadAsync(字节)
    const 已修补: string[] = []
    for (const 项 of Object.values(包.files)) {
      if (项.dir || !/\.(xml|rels)$/i.test(项.name)) continue
      const 原文 = await 项.async('string')
      const 新文 = 补全命名空间(原文)
      if (新文 !== 原文) { 包.file(项.name, 新文); 已修补.push(项.name) }
    }
    if (!已修补.length) return { 字节, 已修补 }
    return { 字节: await 包.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), 已修补 }
  } catch {
    return { 字节, 已修补: [] }
  }
}
