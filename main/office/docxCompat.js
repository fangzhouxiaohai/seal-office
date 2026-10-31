// 新建 Word 文档的兼容设置。
// ECMA-376 / [MS-DOCX]：settings.xml 缺少 compatibilityMode 时，Word 2013+ 会以
// “兼容模式”打开并禁用新版排版；WPS 依据 themeFontLang 的 eastAsia 语言决定中文断行与默认东亚字体。
// 原有文档的 settings.xml 由源包合并保留，这里只补齐缺失项，不覆盖已有值。
const JSZip = require('jszip')

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

/** 匹配 compatibilityMode 设置项（属性顺序不固定）。 */
const 兼容模式项 = /<w:compatSetting\b(?=[^>]*\bw:name="compatibilityMode")[^>]*\/>/

/**
 * @param 选项.强制最新 新建文档传 true：已有但低于 15 的 compatibilityMode 也提升到 15。
 */
function 补齐兼容设置Xml(xml, 选项 = {}) {
  if (typeof xml !== 'string' || !/<w:settings[\s>]/.test(xml)) return xml
  let 结果 = xml
  if (选项.强制最新 && 兼容模式项.test(结果)) {
    结果 = 结果.replace(兼容模式项, (项) => /\bw:val="15"/.test(项) ? 项 : 项.replace(/\bw:val="[^"]*"/, 'w:val="15"'))
  }
  const 兼容项 = '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>'
    + '<w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>'
    + '<w:compatSetting w:name="enableOpenTypeFeatures" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>'
    + '<w:compatSetting w:name="doNotFlipMirrorIndents" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>'
    + '<w:compatSetting w:name="differentiateMultirowTableHeaders" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>'
  if (!兼容模式项.test(结果)) {
    if (/<w:compat\s*\/>/.test(结果)) 结果 = 结果.replace(/<w:compat\s*\/>/, `<w:compat>${兼容项}</w:compat>`)
    else if (/<w:compat>/.test(结果)) 结果 = 结果.replace(/<\/w:compat>/, `${兼容项}</w:compat>`)
    else 结果 = 插入设置(结果, `<w:compat>${兼容项}</w:compat>`, ['w:docVars', 'w:rsids', 'm:mathPr', 'w:attachedSchema', 'w:themeFontLang', 'w:clrSchemeMapping', 'w:doNotIncludeSubdocsInStats', 'w:doNotAutoCompressPictures', 'w:forceUpgrade', 'w:captions', 'w:readModeInkLockDown', 'w:smartTagType', 'sl:schemaLibrary', 'w:shapeDefaults', 'w:doNotEmbedSmartTags', 'w:decimalSymbol', 'w:listSeparator'])
  }
  if (!/<w:themeFontLang[\s/]/.test(结果)) {
    结果 = 插入设置(结果, '<w:themeFontLang w:val="en-US" w:eastAsia="zh-CN"/>', ['w:clrSchemeMapping', 'w:doNotIncludeSubdocsInStats', 'w:doNotAutoCompressPictures', 'w:forceUpgrade', 'w:captions', 'w:readModeInkLockDown', 'w:smartTagType', 'sl:schemaLibrary', 'w:shapeDefaults', 'w:doNotEmbedSmartTags', 'w:decimalSymbol', 'w:listSeparator'])
  }
  if (!/<w:decimalSymbol[\s/]/.test(结果)) 结果 = 插入设置(结果, '<w:decimalSymbol w:val="."/>', ['w:listSeparator'])
  if (!/<w:listSeparator[\s/]/.test(结果)) 结果 = 插入设置(结果, '<w:listSeparator w:val=","/>', [])
  return 结果
}

/** 按 CT_Settings 的元素顺序，把新元素插在第一个已存在的后继元素之前，否则放在末尾。 */
function 插入设置(xml, 片段, 后继元素) {
  for (const 名称 of 后继元素) {
    const 位置 = xml.search(new RegExp(`<${名称.replace(':', '\\:')}[\\s/>]`))
    if (位置 >= 0) return xml.slice(0, 位置) + 片段 + xml.slice(位置)
  }
  return xml.replace(/<\/w:settings>\s*$/, `${片段}</w:settings>`)
}

async function 补齐Word兼容设置(数据) {
  const 包 = await JSZip.loadAsync(数据)
  const 文件 = 包.file('word/settings.xml')
  if (!文件) return 数据
  const 原始 = await 文件.async('string')
  const 结果 = 补齐兼容设置Xml(原始, { 强制最新: true })
  if (结果 === 原始) return 数据
  包.file('word/settings.xml', 结果)
  return 包.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

module.exports = { 补齐兼容设置Xml, 补齐Word兼容设置, W_NS }
