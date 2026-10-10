import { Buffer } from 'buffer'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { downloadFile, readBundledFont } from './native'
import { preparePdfImages } from './exportImages'

let fontPromise: Promise<Uint8Array> | undefined
async function chineseFont(): Promise<Uint8Array> {
  if (!fontPromise) fontPromise = readBundledFont().catch((error) => { fontPromise = undefined; throw error })
  return fontPromise
}
async function pdfFromHtml(html: string): Promise<Uint8Array> {
  const [{ default: pdfMake }, { default: converter }] = await Promise.all([import('pdfmake/build/pdfmake'), import('html-to-pdfmake')])
  const font = await chineseFont(), writer = pdfMake as any
  writer.vfs = { 'SealChinese.ttf': Buffer.from(font).toString('base64') }
  writer.fonts = { SealChinese: { normal: 'SealChinese.ttf', bold: 'SealChinese.ttf', italics: 'SealChinese.ttf', bolditalics: 'SealChinese.ttf' } }
  const body = new DOMParser().parseFromString(html, 'text/html').body
  await preparePdfImages(body)
  const content = (converter as any)(body.innerHTML, { window, removeExtraBlanks: false })
  return new Promise((resolve, reject) => {
    try { writer.createPdf({ content, defaultStyle: { font: 'SealChinese', fontSize: 11 }, pageSize: 'A4', pageMargins: [40, 48, 40, 48] }).getBuffer((result: Uint8Array) => resolve(new Uint8Array(result))) }
    catch (error) { reject(error) }
  })
}
export async function installExportAdapters(core: any, save: any, handle: any) {
  ;(globalThis as any).sealBrowserPdfFont = async (doc: any, text: string) => {
    if (/^[\x00-\x7f]*$/.test(text)) return doc.embedFont(StandardFonts.Helvetica)
    doc.registerFontkit(fontkit); return doc.embedFont(await chineseFont(), { subset: true })
  }
  const pdfFunctions = { extract: '提取页面', merge: '合并文档', delete: '删除页面', rotate: '旋转页面', insertBlank: '插入空白页', insertPages: '插入文件页', editPage: '编辑页面' }
  for (const [channel, method] of Object.entries(pdfFunctions)) handle('pdf.' + channel, async (...args: any[]) => {
    if (channel === 'merge') args[0] = args[0].map((value: string) => Buffer.from(value, 'base64'))
    else { args[0] = Buffer.from(args[0], 'base64'); if (channel === 'insertPages') args[1] = Buffer.from(args[1], 'base64') }
    return { 成功: true, 数据: Buffer.from(await core.pdf[method](...args)).toString('base64') }
  })
  handle('pdf.exportToPath', async (html: string, filename: string) => save(filename, await pdfFromHtml(html)))
  handle('pdf.export', async (html: string, name: string) => {
    const selected = await core.platform.dialog.showSaveDialog({ defaultPath: name }); return save(selected.filePath, await pdfFromHtml(html))
  })
  handle('document.printPreview', async (html: string, format: string) => ({ 成功: true, 数据: format === 'pdf' ? html : Buffer.from(await pdfFromHtml(html)).toString('base64') }))
  handle('document.print', async (html: string, format: string) => {
    const data = format === 'pdf' ? Buffer.from(html, 'base64') : await pdfFromHtml(html)
    await downloadFile('打印文档.pdf', data, 'application/pdf'); return { 成功: true }
  })

  ;(globalThis as any).sealBrowserPresentationExport = async (request: any) => {
    const allowed = ['HTML', 'PNG', 'JPEG', 'PDF', '扫描件PDF', '图片型PPTX']
    if (!allowed.includes(request.格式)) throw new Error('导出格式不受支持')
    if (!request.html || !Array.isArray(request.条目) || !request.条目.length) throw new Error('没有可导出的页面')
    const name = String(request.基础名 || '演示文稿').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    const results: any[] = []
    const output = async (filename: string, data: Uint8Array) => {
      const target = '/seal/documents/exports/' + core.crypto.randomUUID() + '/' + filename
      await save(target, data); results.push({ 路径: target, 字节数: data.length })
    }
    if (request.格式 === 'HTML') { await output(name + '.html', Buffer.from(request.html)); return { 成功: true, 文件列表: results, 页数: request.条目.length } }
    const frame = document.createElement('iframe'); frame.sandbox.add('allow-same-origin'); frame.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;width:1600px;height:1200px'
    document.body.appendChild(frame)
    try {
      const loaded = new Promise<void>((resolve) => { frame.onload = () => resolve() }); frame.srcdoc = request.html; await loaded
      const documentInFrame = frame.contentDocument!; await documentInFrame.fonts.ready
      await Promise.all(Array.from(documentInFrame.images).map((image) => image.decode().catch(() => { throw new Error('导出图片尚未加载，请重试') })))
      const pages = Array.from(documentInFrame.querySelectorAll<HTMLElement>('.seal-export-page'))
      if (pages.length !== request.条目.length) throw new Error('导出页数与实际页面不一致')
      const { toPng, toJpeg } = await import('html-to-image')
      const pdf = await PDFDocument.create(), imagePpt = request.格式 === '图片型PPTX' ? new (await import('pptxgenjs')).default() : null
      if (imagePpt) { imagePpt.defineLayout({ name: 'SEAL', width: request.页面尺寸.宽 / 72, height: request.页面尺寸.高 / 72 }); imagePpt.layout = 'SEAL' }
      for (let i = 0; i < pages.length; i++) {
        const node = pages[i], width = node.offsetWidth || request.页面尺寸.宽, height = node.offsetHeight || request.页面尺寸.高
        const options = { pixelRatio: Math.min(4, Math.max(1, request.分辨率倍数 ?? 1)), width, height, backgroundColor: '#ffffff', skipFonts: true }
        const dataUrl = request.格式 === 'JPEG' ? await toJpeg(node, { ...options, quality: request.JPEG质量 ?? .92 }) : await toPng(node, options)
        const data = Buffer.from(dataUrl.split(',')[1], 'base64')
        if (['PNG', 'JPEG'].includes(request.格式)) await output(`${name}-第${i + 1}页.${request.格式 === 'PNG' ? 'png' : 'jpg'}`, data)
        else if (imagePpt) imagePpt.addSlide().addImage({ data: dataUrl, x: 0, y: 0, w: width / 72, h: height / 72 })
        else { const page = pdf.addPage([width, height]), image = await pdf.embedPng(data); page.drawImage(image, { x: 0, y: 0, width, height }) }
      }
      if (imagePpt) await output(name + '-图片版.pptx', new Uint8Array(await imagePpt.write({ outputType: 'arraybuffer' }) as ArrayBuffer))
      else if (!['PNG', 'JPEG'].includes(request.格式)) await output(name + '.pdf', await pdf.save())
      return { 成功: true, 文件列表: results, 页数: pages.length }
    } finally { frame.remove() }
  }
}
