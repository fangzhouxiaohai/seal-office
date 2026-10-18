const assert = require('node:assert/strict'), JSZip = require('jszip')

// 在生产移动 core 中验证命名空间规范化没有破坏原生形状元数据的词法值。
module.exports = async function pptxPrefixActions({ evaluate }) {
  const shape = { id: 'prefix-shape', 类型: '图形', x: 72, y: 60, width: 160, height: 80, 旋转: 37,
    形状: { 种类: '矩形', 文本: 'it\'s a "shape"\t\n海豹 & <内容>', 填充: '#FFFFFF', 线条: '#334455', 线宽: 2, 颜色: '#112233', 字号: 24, 加粗: false } }
  const written = await evaluate(`window.electronAPI.office.writePptx(${JSON.stringify({ 幻灯片: [{ id: 'native-prefix', 文本框: [], 对象列表: [shape] }] })})`)
  assert.equal(written.成功, true, JSON.stringify(written))
  const zip = await JSZip.loadAsync(Buffer.from(written.数据, 'base64'))
  for (const part of Object.values(zip.files)) {
    if (part.dir || !/\.(?:xml|rels)$/.test(part.name)) continue
    let xml = await part.async('string')
    for (const [source, target] of Object.entries({ p: 'slides', a: 'draw', r: 'relation' })) {
      xml = xml.replace(/<[^>]+>/g, tag => tag.replace(new RegExp(`(<\\/?|\\s)${source}:`, 'g'), `$1${target}:`).replace(new RegExp(`xmlns:${source}=`, 'g'), `xmlns:${target}=`))
    }
    xml = xml.replace(/http:\/\/schemas\.openxmlformats\.org\/(presentationml|drawingml)\/2006\//g, 'http://purl.oclc.org/ooxml/$1/')
      .replace(/http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\//g, 'http://purl.oclc.org/ooxml/officeDocument/')
    zip.file(part.name, xml)
  }
  const base64 = await zip.generateAsync({ type: 'base64' })
  const imported = await evaluate(`window.electronAPI.office.readPptx(${JSON.stringify(base64)})`)
  assert.equal(imported.成功, true, JSON.stringify(imported))
  assert.deepEqual(imported.演示文稿.幻灯片列表[0].对象列表, [shape], '别名前缀 / Strict 的原生形状不得退化或改变引号、Tab、换行及实体')
  const roundtrip = await evaluate(`(async()=>{const api=window.electronAPI.office;const written=await api.writePptx(${JSON.stringify({ 页面尺寸: imported.演示文稿.页面尺寸, 幻灯片: imported.演示文稿.幻灯片列表 })});if(!written.成功)throw new Error(written.错误);return api.readPptx(written.数据)})()`)
  assert.equal(roundtrip.成功, true, JSON.stringify(roundtrip))
  assert.deepEqual(roundtrip.演示文稿.幻灯片列表[0].对象列表, [shape], '移动生产引擎再次保存后仍须保留原生形状及完整文本')
  return { passed: true, strict: true, namespacePrefixes: ['slides', 'draw', 'relation'], nativeShapesPreserved: 1, preservedText: '引号、Tab、换行、中文及 &<>' }
}
