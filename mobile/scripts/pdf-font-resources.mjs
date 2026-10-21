import { createHash } from 'node:crypto'

export const pdfFontResources = ['NotoSansSC.ttf', 'NotoSerifCJKsc-Regular.otf', 'OFL.txt', 'NotoSerif-LICENSE.txt']

/** Read-only verification: signed package bytes are never rewritten. */
export async function inspectPdfFonts(zip, officePrefix) {
  const resources = []
  for (const name of pdfFontResources) {
    const item = zip.file(officePrefix + 'fonts/' + name)
    if (!item) throw new Error('包内 PDF 字体或许可证缺失：' + name)
    const bytes = await item.async('nodebuffer')
    if (!bytes.length) throw new Error('包内 PDF 字体或许可证为空：' + name)
    resources.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  return resources
}
