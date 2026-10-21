// @pdf-lib/fontkit 1.1.1 predates upstream fontkit's TTF loca alignment and
// CID-keyed CFF subsetting fixes (foliojs/fontkit #191 and #230). Scope these
// repairs to instances used for PDF editing; never mutate the dependency or
// its global prototypes. See docs/PDF文字兼容边界.md for provenance and tests.
const engines = new WeakMap()

function 可靠PDF字体引擎(fontkit) {
  if (engines.has(fontkit)) return engines.get(fontkit)
  const engine = { create(bytes, ...args) {
    const font = fontkit.create(bytes, ...args)
    const originalCreate = font.createSubset.bind(font)
    font.createSubset = () => {
      const subset = originalCreate()
      if (subset.cff) {
        // Preserve each source FD's own index and local subroutines even when
        // characters from different font dictionaries alternate in one run.
        subset.subsetFontdict = function (topDict) {
          const indices = new Map(), usedSubrs = []
          topDict.FDArray = []
          topDict.FDSelect = { version: 0, fds: [] }
          for (const gid of this.glyphs) {
            const fd = this.cff.fdForGlyph(gid)
            if (fd == null) throw new Error('PDF CFF 字形缺少字体字典，未修改原 PDF')
            if (!indices.has(fd)) {
              indices.set(fd, topDict.FDArray.length)
              topDict.FDArray.push({ ...this.cff.topDict.FDArray[fd] })
              usedSubrs.push({})
            }
            const index = indices.get(fd), glyph = this.font.getGlyph(gid)
            void glyph.path // fontkit lazily discovers the subroutines here.
            topDict.FDSelect.fds.push(index)
            for (const id of Object.keys(glyph._usedSubrs || {})) usedSubrs[index][id] = true
          }
          topDict.FDArray.forEach((dict, index) => {
            delete dict.FontName
            if (dict.Private?.Subrs) dict.Private = { ...dict.Private, Subrs: this.subsetSubrs(dict.Private.Subrs, usedSubrs[index]) }
          })
        }
        // The fork writes source-table length into the CFF header's offSize.
        // It must be 1..4. Repair only that header byte before consumers receive
        // it; fontkit's asynchronous encoder emits mutable byte chunks.
        const originalStream = subset.encodeStream.bind(subset)
        subset.encodeStream = () => {
          const stream = originalStream()
          let offset = 0
          stream.on('data', chunk => {
            if (offset <= 3 && offset + chunk.length > 3) chunk[3 - offset] = 4
            offset += chunk.length
          })
          return stream
        }
      } else {
        // Short loca offsets are stored divided by two. Padding every glyph to
        // an even boundary prevents truncating an odd offset in small subsets.
        const originalAdd = subset._addGlyph.bind(subset)
        subset._addGlyph = gid => {
          const index = originalAdd(gid), bytes = subset.glyf[index]
          if (bytes.length % 2) {
            // Keep fontkit's own Buffer class; its bundled stream rejects a
            // plain Uint8Array even though both expose identical byte values.
            const padded = bytes.constructor.alloc(bytes.length + 1)
            padded.set(bytes)
            subset.glyf[index] = padded
            subset.offset++
          }
          return index
        }
      }
      return subset
    }
    return font
  } }
  engines.set(fontkit, engine)
  return engine
}

module.exports = { 可靠PDF字体引擎 }
