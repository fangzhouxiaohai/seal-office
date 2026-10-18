const sax = require('sax')
const JSZip = require('jszip')
const propertyName = 'SealFormulaCompatibility'
const propertyNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties'
const valueNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes'
const relationshipType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties'

/** WPS commonly identifies app.xml as Microsoft Excel. Its own explicit build
 * and calculation-rule properties are stronger evidence than that display name. */
async function 读取公式兼容模式(zip) {
  const file = zip.file('docProps/custom.xml')
  if (!file || file._data?.uncompressedSize > 262144) return undefined
  const values = {}, parser = sax.parser(true, { xmlns: true })
  let name = '', text = '', depth = 0
  parser.onopentag = node => {
    if (node.local === 'property' && node.uri === propertyNamespace) { name = node.attributes.name?.value ?? ''; text = ''; depth = 1 }
    else if (depth) depth++
  }
  parser.ontext = value => { if (depth) text += value }
  parser.onclosetag = () => { if (depth && --depth === 0) { values[name] = text; name = '' } }
  try { parser.write(await file.async('string')).close() } catch { return undefined }
  if (values[propertyName] === 'Excel' || values[propertyName] === 'WPS') return values[propertyName]
  if (/^\d+-12\.\d+\./.test(values.KSOProductBuildVer ?? '') && values.CalculationRule === '0') return 'WPS'
  return undefined
}

async function 写入公式兼容模式(bytes, mode) {
  if (mode === undefined) return bytes
  if (!['Excel','WPS'].includes(mode)) throw new Error('公式兼容模式无效')
  const zip = await JSZip.loadAsync(bytes)
  // This function only receives a fresh ExcelJS package, which has no custom
  // properties; never use it to overwrite an arbitrary source package.
  if (zip.file('docProps/custom.xml')) throw new Error('公式兼容属性部件冲突')
  zip.file('docProps/custom.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="${propertyNamespace}" xmlns:vt="${valueNamespace}"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="${propertyName}"><vt:lpwstr>${mode}</vt:lpwstr></property></Properties>`)
  const types = await zip.file('[Content_Types].xml').async('string')
  zip.file('[Content_Types].xml', types.replace('</Types>', '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>'))
  const rels = await zip.file('_rels/.rels').async('string')
  zip.file('_rels/.rels', rels.replace('</Relationships>', `<Relationship Id="rIdSealFormulaCompatibility" Type="${relationshipType}" Target="docProps/custom.xml"/></Relationships>`))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
module.exports = { 读取公式兼容模式, 写入公式兼容模式 }
