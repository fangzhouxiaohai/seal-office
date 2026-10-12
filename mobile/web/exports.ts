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
  if (/data-ofd-width=/.test(html)) return ofdPdf(html)
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

/** 手机打印预览按屏幕排版逐页截图，避免大文档的 pdfmake 排版阻塞 WebView。 */
async function printPdfFromHtml(html: string): Promise<Uint8Array> {
  const frame = document.createElement('iframe')
  frame.sandbox.add('allow-same-origin')
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;width:794px;height:1123px'
  document.body.appendChild(frame)
  try {
    const loaded = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('打印页面加载超时')), 10000)
      frame.onload = () => { clearTimeout(timer); resolve() }
    })
    frame.srcdoc = html
    await loaded
    const doc = frame.contentDocument
    if (!doc) throw new Error('无法读取打印页面')
    const style = doc.createElement('style')
    style.textContent = `@font-face{font-family:SealPrintChinese;src:url('./fonts/NotoSansSC.ttf') format('truetype');font-display:block}
html,body{margin:0!important;padding:0!important;width:794px!important;max-width:794px!important;background:#fff!important}
body{box-sizing:border-box;padding:48px 54px!important;color:#20242b;font-family:SealPrintChinese,Arial,sans-serif;line-height:1.45}
img{max-width:100%}table{border-collapse:collapse}`
    doc.head.appendChild(style)
    // 保留来源字体优先级；手机缺少该字体时回退到包内中文字体。
    for (const node of doc.body.querySelectorAll<HTMLElement>('[style*="font-family"]')) {
      const original = node.style.fontFamily
      if (original) node.style.fontFamily = `${original.replace(/SealOfficeCJK/g, 'SealPrintChinese').replace(/,\s*(?:sans-serif|serif)\s*$/i, '')}, SealPrintChinese, Arial, sans-serif`
    }
    await Promise.race([doc.fonts.load('16px SealPrintChinese'), new Promise((resolve) => setTimeout(resolve, 8000))]).catch(() => {})
    await Promise.all([...doc.images].map((image) => Promise.race([image.decode().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 3000))])))
    const overlays = [...doc.body.querySelectorAll<HTMLElement>('.seal-print-watermark,.seal-print-header,.seal-print-footer')]
    overlays.forEach((node) => node.remove())
    const source = doc.createElement('div')
    source.style.cssText = 'width:686px;box-sizing:border-box'
    while (doc.body.firstChild) source.appendChild(doc.body.firstChild)
    doc.body.appendChild(source)
    const pageWidth = 794, pageHeight = 1123, contentPageHeight = 1027
    const sourceTop = source.getBoundingClientRect().top
    const contentEnds = [...source.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,li,tr,img,svg,canvas,hr')]
      .filter((node) => node.textContent?.trim() || ['IMG', 'SVG', 'CANVAS', 'HR'].includes(node.tagName))
      .map((node) => node.getBoundingClientRect().bottom - sourceTop)
    const contentHeight = contentEnds.length
      ? contentEnds.reduce((最大, 位置) => Math.max(最大, 位置), 0)
      : Math.max(source.scrollHeight, source.getBoundingClientRect().height)
    const pageCount = Math.max(1, Math.ceil(contentHeight / contentPageHeight))
    if (pageCount > 200) throw new Error('文档超过 200 页，请分段打印')
    const { toJpeg } = await import('html-to-image')
    const pdf = await PDFDocument.create()
    for (let index = 0; index < pageCount; index += 1) {
      const clip = doc.createElement('div')
      clip.style.cssText = `position:relative;overflow:hidden;width:${pageWidth}px;height:${pageHeight}px;background:#fff`
      const pageBody = doc.createElement('div')
      pageBody.style.cssText = `position:absolute;top:48px;left:54px;width:686px;height:${contentPageHeight}px;overflow:hidden`
      const content = source.cloneNode(true) as HTMLElement
      content.style.cssText = `position:absolute;top:${-index * contentPageHeight}px;left:0;width:686px`
      pageBody.appendChild(content)
      clip.appendChild(pageBody)
      for (const overlay of overlays) clip.appendChild(overlay.cloneNode(true))
      doc.body.appendChild(clip)
      try {
        window.dispatchEvent(new CustomEvent('seal-print-preview-progress', { detail: { current: index + 1, total: pageCount } }))
        const imageUrl = await Promise.race([
          toJpeg(clip, { width: pageWidth, height: pageHeight, pixelRatio: 1.25, quality: .9, skipFonts: true, backgroundColor: '#fff' }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`第 ${index + 1} 页生成超时`)), 8000)),
        ])
        const image = await pdf.embedJpg(Buffer.from(imageUrl.split(',')[1], 'base64'))
        pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
      } finally { clip.remove() }
    }
    return pdf.save()
  } finally { frame.remove() }
}
async function ofdPdf(html: string): Promise<Uint8Array> {
  const frame = document.createElement('iframe')
  frame.sandbox.add('allow-same-origin')
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;width:1600px;height:2000px'
  document.body.appendChild(frame)
  try {
    const loaded = new Promise<void>(resolve => { frame.onload = () => resolve() })
    frame.srcdoc = html; await loaded
    const doc = frame.contentDocument!
    await doc.fonts.ready
    await Promise.all(Array.from(doc.images).map(image => image.decode()))
    const pages = Array.from(doc.querySelectorAll<HTMLElement>('section[data-ofd-width]'))
    if (!pages.length) throw new Error('没有可导出的 OFD 页面')
    const { toPng } = await import('html-to-image'), pdf = await PDFDocument.create()
    for (const node of pages) {
      const width = Number(node.dataset.ofdWidth) * 72 / 25.4, height = Number(node.dataset.ofdHeight) * 72 / 25.4
      if (![width, height].every(n => Number.isFinite(n) && n > 0)) throw new Error('OFD 页面尺寸无效')
      const png = await toPng(node, { pixelRatio: 2, skipFonts: true, backgroundColor: '#ffffff' })
      const image = await pdf.embedPng(Buffer.from(png.split(',')[1], 'base64'))
      pdf.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height })
    }
    return await pdf.save()
  } finally { frame.remove() }
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
  handle('document.printPreview', async (html: string, format: string) => ({ 成功: true, 数据: format === 'pdf' ? html : Buffer.from(await printPdfFromHtml(html)).toString('base64') }))
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
