// Shared by the desktop Main process and the browser/mobile PDF core.
// Never let fontkit's .notdef glyph silently replace a user's character.
const FONT_FEATURES = { liga: false, clig: false, calt: false, rlig: false, kern: false }

function 规范PDF新增文字(value) {
  const text = String(value).replace(/\r\n?/g, '\n').normalize('NFC')
  if (!text.trim()) throw new Error('文字内容不能为空')
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code >= 0xD800 && code <= 0xDFFF) throw new Error('文字包含不完整的 Unicode 字符，未修改原 PDF')
  }
  if (/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{1E900}-\u{1E95F}\u{1EE00}-\u{1EEFF}\u200C-\u200F\u202A-\u202E\u2066-\u2069]/u.test(text)) {
    throw new Error('PDF 新增文字暂不能保证从右向左或连接字形的复杂排版，未修改原 PDF；请在支持该文字排版的软件中编辑')
  }
  if (/\p{Mark}/u.test(text)) throw new Error('PDF 新增文字包含无法可靠排版的组合附标或变体字形，未修改原 PDF')
  if (/[\p{Cc}\p{Cf}]/u.test(text.replaceAll('\n', ''))) throw new Error('PDF 新增文字包含不支持的控制符或制表符，未修改原 PDF')
  return text
}

async function 创建PDF文字布局(document, content, size, sources) {
  const text = 规范PDF新增文字(content)
  if (!Number.isFinite(size) || size < 4 || size > 72) throw new Error('字号无效')
  const lines = [[]], loaded = new Map(), embedded = new Map()
  const ascii = /^[\x20-\x7E\n]+$/.test(text)
  const getSource = async index => {
    if (!loaded.has(index)) loaded.set(index, Promise.resolve(sources[index].load()))
    return loaded.get(index)
  }
  for (const char of text) {
    if (char === '\n') { lines.push([]); continue }
    let selected = ascii ? -1 : null
    if (!ascii) {
      for (let index = 0; index < sources.length; index++) {
        const source = await getSource(index)
        const glyph = source.font.glyphForCodePoint(char.codePointAt(0))
        if (glyph?.id > 0) { selected = index; break }
      }
    }
    if (selected === null) {
      const code = char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
      throw new Error(`内置 PDF 字体不含「${char}」（U+${code}）的有效字形，未修改原 PDF；请改用有该字形支持的编辑工具`)
    }
    const line = lines[lines.length - 1], last = line[line.length - 1]
    if (last?.source === selected) last.text += char
    else line.push({ source: selected, text: char })
  }
  // Validate every character before changing the PDF's page content or embedding
  // fonts. Only the existing redistributable Noto fonts are loaded by callers.
  for (const line of lines) for (const run of line) {
    if (run.source !== -1) {
      const source = await getSource(run.source)
      if (source.font.layout(run.text, FONT_FEATURES).glyphs.some(glyph => !glyph || glyph.id === 0)) throw new Error('PDF 字体排版产生缺失字形，未修改原 PDF')
    }
    if (!embedded.has(run.source)) {
      const source = run.source === -1 ? null : await getSource(run.source)
      embedded.set(run.source, await document.embedFont(source ? source.bytes : 'Helvetica', source ? { subset: true, features: FONT_FEATURES } : undefined))
    }
    run.font = embedded.get(run.source)
    run.width = run.font.widthOfTextAtSize(run.text, size)
    if (!Number.isFinite(run.width) || run.width < 0) throw new Error('PDF 文字宽度无效，未修改原 PDF')
    run.family = run.source === -1 ? 'Helvetica' : sources[run.source].name
  }
  const lineHeight = size * 1.2
  return { text, lines, size, lineHeight, width: lines.reduce((width, line) => Math.max(width, line.reduce((sum, run) => sum + run.width, 0)), 0), height: size + (lines.length - 1) * lineHeight }
}

function 绘制PDF文字(page, layout, options) {
  layout.lines.forEach((line, index) => {
    let x = options.x
    for (const run of line) {
      page.drawText(run.text, { ...options, x, y: options.y - index * layout.lineHeight, size: layout.size, font: run.font })
      x += run.width
    }
  })
}

module.exports = { 规范PDF新增文字, 创建PDF文字布局, 绘制PDF文字 }
