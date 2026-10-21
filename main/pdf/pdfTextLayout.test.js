const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')
const { PDFDocument } = require('pdf-lib')
const fontkit = require('@pdf-lib/fontkit')
const { 创建PDF文字布局, 规范PDF新增文字 } = require('./pdfTextLayout')
const { 绘制PDF文字 } = require('./pdfTextLayout')
const { 可靠PDF字体引擎 } = require('./safeFontkit')
const { 编辑页面 } = require('./pdfTools')
const { writeSeal, readSeal } = require('../office/sealFormat')

const 字体目录 = path.join(__dirname, '../../mobile/web/public/fonts')
const 名称 = ['NotoSansSC.ttf', 'NotoSerifCJKsc-Regular.otf']
const 缓存 = new Map()
const 来源 = 名称.map(name => ({ name, load: () => {
  if (!缓存.has(name)) { const bytes = fs.readFileSync(path.join(字体目录, name)); 缓存.set(name, { bytes, font: fontkit.create(bytes) }) }
  return 缓存.get(name)
} }))
async function 来源PDF() {
  const document = await PDFDocument.create()
  document.addPage([595, 842]).drawText('Original preserved', { x: 30, y: 810, size: 12 })
  document.setTitle('原始标题𠮷')
  return Buffer.from(await document.save())
}
async function 提取文字(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true, standardFontDataUrl: path.join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts').replaceAll('\\', '/') + '/' })
  try {
    const document = await task.promise
    const content = await (await document.getPage(1)).getTextContent()
    return content.items.map(item => item.str || '').join('')
  } finally { await task.destroy() }
}
async function 光栅(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = require('@napi-rs/canvas')
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false })
  try {
    const page = await (await task.promise).getPage(1), viewport = page.getViewport({ scale: 1 })
    const canvas = createCanvas(viewport.width, viewport.height), context = canvas.getContext('2d')
    await page.render({ canvasContext: context, viewport }).promise
    return Buffer.from(context.getImageData(0, 0, canvas.width, canvas.height).data)
  } finally { await task.destroy() }
}
const 指纹 = bytes => createHash('sha256').update(bytes).digest('hex')

describe('PDF 新增文字的实际字形与无损拒绝', () => {
  it('以真实字体逐字核验，扩展汉字使用 Serif 回退，组合音标规范化后仍可读取', async () => {
    const document = await PDFDocument.create()
    document.registerFontkit(fontkit)
    const layout = await 创建PDF文字布局(document, '中文𠮷 e\u0301\n下一行', 16, 来源)
    expect(layout.text).toBe('中文𠮷 é\n下一行')
    expect(layout.lines[0].map(run => run.family)).toEqual(['NotoSansSC.ttf', 'NotoSerifCJKsc-Regular.otf', 'NotoSansSC.ttf'])
    for (const line of layout.lines) for (const run of line) for (const char of run.text) {
      const source = await 来源[run.source].load()
      expect(source.font.glyphForCodePoint(char.codePointAt(0)).id).toBeGreaterThan(0)
    }
    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBeGreaterThan(16)
  })

  it.each(['text', 'note', 'replace'])('%s 写出真实 PDF，再包成 spdf 重开仍保留中文、𠮷和 é', async 类型 => {
    const original = await 来源PDF(), hash = 指纹(original)
    const edited = await 编辑页面(original, { 类型, 页码: 1, x: 36, y: 60, 宽: 300, 高: 80, 文字: '中文𠮷 e\u0301\n下一行', 字号: 16 })
    expect(指纹(original)).toBe(hash)
    const native = await writeSeal('pdf', { PDF数据: edited.toString('base64') })
    const reopened = await readSeal('spdf', native)
    expect(Buffer.from(reopened.PDF数据, 'base64')).toEqual(edited)
    expect((await PDFDocument.load(edited)).getTitle()).toBe('原始标题𠮷')
    const text = await 提取文字(edited)
    expect(text).toContain('Original preserved')
    expect(text).toContain('中文𠮷 é')
    expect(text).toContain('下一行')
  })

  it.each([
    ['普通字🦭', /U\+1F9AD.*未修改原 PDF/],
    ['العربية', /从右向左.*未修改原 PDF/],
    ['א', /从右向左.*未修改原 PDF/],
    ['a\u200Db', /连接字形.*未修改原 PDF/],
    ['x\u0338', /组合附标.*未修改原 PDF/],
    ['♥\uFE0F', /变体字形.*未修改原 PDF/],
    ['bad\uD800', /不完整的 Unicode.*未修改原 PDF/],
    ['a\tb', /制表符.*未修改原 PDF/],
  ])('无法可靠显示的 %s 在替换前拒绝，原 PDF 字节保持不变', async (text, error) => {
    const original = await 来源PDF(), before = Buffer.from(original)
    await expect(编辑页面(original, { 类型: 'replace', 页码: 1, x: 30, y: 20, 宽: 300, 高: 60, 文字: text, 字号: 16 })).rejects.toThrow(error)
    expect(original).toEqual(before)
    expect(await 提取文字(original)).toBe('Original preserved')
  })

  it('文字超出页面时不写出部分内容，ASCII 保留原有功能及空格', async () => {
    const original = await 来源PDF(), before = Buffer.from(original)
    await expect(编辑页面(original, { 类型: 'text', 页码: 1, x: 580, y: 20, 文字: 'Too wide', 字号: 16 })).rejects.toThrow(/超出页面.*未修改原 PDF/)
    expect(original).toEqual(before)
    expect(规范PDF新增文字('  text  ')).toBe('  text  ')
    const edited = await 编辑页面(original, { 类型: 'text', 页码: 1, x: 36, y: 60, 文字: 'ASCII preserved', 字号: 12 })
    expect(await 提取文字(edited)).toContain('ASCII preserved')
  })

  it('Windows 和 Linux 配置都携带两款同源开源字体及许可证', () => {
    const windows = require('../../package.json').build.extraResources
    const linux = require('../../build/electron-ubuntu.cjs').extraResources
    for (const resources of [windows, linux]) for (const file of [...名称, 'OFL.txt', 'NotoSerif-LICENSE.txt']) {
      expect(resources).toContainEqual({ from: `mobile/web/public/fonts/${file}`, to: `fonts/${file}` })
      expect(fs.statSync(path.join(字体目录, file)).size).toBeGreaterThan(0)
    }
  })

  it('TTF 奇数 loca 和交替 FD 的 CFF 子集实际像素与完整字体完全相同，不能仅靠文本提取掩盖漏画', async () => {
    const make = async subset => {
      const document = await PDFDocument.create(), page = document.addPage([500, 180])
      document.registerFontkit(可靠PDF字体引擎(fontkit))
      if (!subset) {
        const embed = document.embedFont.bind(document)
        document.embedFont = (bytes, options) => embed(bytes, { ...options, subset: false })
      }
      const layout = await 创建PDF文字布局(document, '中文𠮷 é\n下一行 ABC 123\n间。楼吉𠮷商業发票開会', 18, 来源)
      绘制PDF文字(page, layout, { x: 20, y: 140 })
      // Exercise alternating CFF font dictionaries as well as the CJK/Latin
      // fallbacks above. This reproduced the upstream FDSelect regression.
      const cff = await 创建PDF文字布局(document, '间。楼 ABC 𠮷 下。楼汉字', 18, [来源[1]])
      绘制PDF文字(page, cff, { x: 20, y: 45 })
      return Buffer.from(await document.save())
    }
    const subset = await make(true), full = await make(false)
    expect(subset.length).toBeLessThan(300000)
    expect(full.length).toBeGreaterThan(10000000)
    const actual = await 光栅(subset), expected = await 光栅(full)
    expect(actual.filter((value, index) => index % 4 !== 3 && value < 240).length).toBeGreaterThan(2000)
    expect(actual.equals(expected)).toBe(true)
  })
})
