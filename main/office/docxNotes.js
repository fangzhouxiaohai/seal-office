const JSZip = require('jszip')
const { XmlComponent, XmlAttributeComponent } = require('docx')

class ReferenceAttributes extends XmlAttributeComponent {
  constructor(id) { super({ id }); this.xmlKeys = { id: 'w:id' } }
}
class NoteReferenceRun extends XmlComponent {
  constructor(kind, id) {
    super('w:r')
    const reference = new XmlComponent(`w:${kind}Reference`)
    reference.root.push(new ReferenceAttributes(id)); this.root.push(reference)
  }
}
function prepareNotes(notes) {
  if (notes === undefined) return { entries: [], references: new Map(), endnoteIds: new Set() }
  if (!Array.isArray(notes) || notes.length > 1000) throw new Error('注释定义无效或超过 1000 条')
  const references = new Map(), endnoteIds = new Set()
  const entries = notes.map((note, index) => {
    if (!note || !['footnote', 'endnote'].includes(note.类型) || !Number.isSafeInteger(note.标识) || note.标识 <= 0 || note.标识 > 10000 || !Array.isArray(note.段落)) throw new Error('注释定义无效')
    const key = `${note.类型}:${note.标识}`, nativeId = index + 1
    if (references.has(key)) throw new Error('注释定义重复')
    references.set(key, nativeId)
    if (note.类型 === 'endnote') endnoteIds.add(nativeId)
    return { ...note, nativeId }
  })
  return { entries, references, endnoteIds }
}

/** The library builds note relationships/media; split endnotes into their real
 * OOXML part instead of degrading them to fixed superscript text in the body. */
async function splitEndnotes(bytes, endnoteIds) {
  if (!endnoteIds.size) return bytes
  const zip = await JSZip.loadAsync(bytes)
  const source = await zip.file('word/footnotes.xml').async('string')
  const note = /<w:footnote(?=[\s>])[^>]*>[\s\S]*?<\/w:footnote>/g
  const idOf = xml => Number(xml.match(/\bw:id="(-?\d+)"/)?.[1])
  const footnotes = source.replace(note, xml => endnoteIds.has(idOf(xml)) ? '' : xml)
  const endnotes = source.replace(note, xml => idOf(xml) <= 0 || endnoteIds.has(idOf(xml)) ? xml : '').replace(/w:footnote/g, 'w:endnote')
  zip.file('word/footnotes.xml', footnotes); zip.file('word/endnotes.xml', endnotes)
  const relationships = zip.file('word/_rels/footnotes.xml.rels')
  if (relationships) zip.file('word/_rels/endnotes.xml.rels', await relationships.async('string'))
  const rels = await zip.file('word/_rels/document.xml.rels').async('string')
  zip.file('word/_rels/document.xml.rels', rels.replace('</Relationships>', '<Relationship Id="rIdSealEndnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/></Relationships>'))
  const types = await zip.file('[Content_Types].xml').async('string')
  zip.file('[Content_Types].xml', types.replace('</Types>', '<Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/></Types>'))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
module.exports = { NoteReferenceRun, prepareNotes, splitEndnotes }
