const { app } = require('electron')
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const formats = require('../main/documentFormats.json')
const { 写入兼容文档, 读取兼容文档 } = require('../main/office/compatibleFormats')
const root = path.resolve(__dirname, '..')
const outputArgument = process.argv.find(arg => arg.startsWith('--output='))?.slice(9)
const output = outputArgument ? path.resolve(root, outputArgument) : path.join(root, '.upgrade-private/format-samples')
assert(output.startsWith(root + path.sep), 'Verification output must stay inside the workspace')
fs.mkdirSync(output, { recursive: true })
const models = {
  word: { 段落: [{ 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字: [{ 文本: '中文格式验收 0012', 加粗: true }] }], 未覆盖: [] },
  table: { 工作表: [{ 名称: '验收', 数据: [['编号', '预算'], [{ 类型: '文本', 文字: [{ 文本: '0012' }] }, 123]], 页面设置: { 方向: '纵向', 纸张大小: 'A4', 页边距: '常规' } }] },
  ppt: { 页面尺寸: { 宽: 960, 高: 540 }, 幻灯片: [{ id: 'p1', 背景色: '#FFFFFF', 文本框: [{ id: 't1', x: 40, y: 50, width: 700, height: 90, text: '中文格式验收 0012', 字号: 24, 颜色: '#222222' }] }] },
}
const selection = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',')
const result = { version: require('../package.json').version, startedAt: new Date().toISOString(), checks: [], failures: [] }
const reportName = process.argv.find(arg => arg.startsWith('--report='))?.slice(9) || 'verification.json'
function checkpoint() { fs.writeFileSync(path.join(output, path.basename(reportName)), JSON.stringify(result, null, 2)) }
app.whenReady().then(async () => {
  try {
    const selected = formats.filter(item => item.conversion && !item.readOnlySource && !['xml', 'mht', 'mhtml'].includes(item.extension) && (!selection || selection.includes(item.extension)))
    // Independent conversion jobs use independent profiles and files. Two workers keep native resource use bounded.
    let next = 0
    await Promise.all([0, 1].map(async () => {
    while (next < selected.length) {
      const format = selected[next++]
      const started = Date.now()
      try {
        const data = await 写入兼容文档(format.type, format.extension, models[format.type])
        fs.writeFileSync(path.join(output, `verify.${format.extension}`), data)
        const read = await 读取兼容文档(format.extension, data)
        assert.equal(read.类型, format.type)
        if (format.type === 'word') assert.match(read.html.replace(/<[^>]+>/g, ''), /中文格式验收 0012/)
        if (format.type === 'table') { assert.match(read.html, /0012/); assert.match(read.html, /123/) }
        if (format.type === 'ppt') { assert.equal(read.演示文稿.幻灯片列表.length, 1); assert.match(JSON.stringify(read.演示文稿), /中文格式验收 0012/) }
        result.checks.push({ extension: format.extension, bytes: data.length, milliseconds: Date.now() - started, warnings: read.警告 ?? [] })
        console.log(`PASS ${format.extension}: ${data.length} bytes, ${Date.now() - started} ms`)
      } catch (error) {
        result.failures.push({ extension: format.extension, error: error.message })
        console.log(`FAIL ${format.extension}: ${error.message}`)
      }
      checkpoint()
    }
    }))
    for (const extension of ['xlsb', 'xla']) {
      if (selection && !selection.includes(extension)) continue
      try {
        const data = fs.readFileSync(path.join(root, 'scripts/fixtures/documents', `readonly.${extension}`))
        const read = await 读取兼容文档(extension, data)
        assert.match(read.html, /0012/); assert.match(read.html, /123/)
        assert(read.警告.some(text => text.includes('来源文件保持不变')))
        result.checks.push({ extension, mode: 'Microsoft Excel fixture body import; source protected' })
        console.log(`PASS ${extension}: real Excel fixture, protected source`)
      } catch (error) { result.failures.push({ extension, error: error.message }); console.log(`FAIL ${extension}: ${error.message}`) }
      checkpoint()
    }
    if (!selection || selection.includes('xml')) {
      for (const name of ['word2003.xml', 'excel2003.xml']) {
        try {
          const read = await 读取兼容文档('xml', fs.readFileSync(path.join(root, 'scripts/fixtures/documents', name)))
          assert.match(read.html.replace(/<[^>]+>/g, ''), /0012/)
          assert.equal(read.类型, name.startsWith('word') ? 'word' : 'table')
          result.checks.push({ extension: 'xml', fixture: name, type: read.类型 })
          console.log(`PASS ${name}: Office 2003 XML body`)
        } catch (error) { result.failures.push({ extension: 'xml', fixture: name, error: error.message }); console.log(`FAIL ${name}: ${error.message}`) }
        checkpoint()
      }
    }
    for (const format of formats.filter(item => item.ooxml && item.readOnlySource && (!selection || selection.includes(item.extension)))) {
      const source = { word: 'docx', table: 'xlsx', ppt: 'pptx' }[format.type]
      const data = await 写入兼容文档(format.type, source, models[format.type])
      // Real OOXML envelope variant; adding a dummy macro payload verifies it is never executed or copied over the source.
      const JSZip = require('jszip'), zip = await JSZip.loadAsync(data)
      const mainType = { word: 'application/vnd.ms-word.document.macroEnabled.main+xml', table: 'application/vnd.ms-excel.sheet.macroEnabled.main+xml', ppt: 'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml' }[format.type]
      const contentTypes = await zip.file('[Content_Types].xml').async('string')
      const part = { word: '/word/document.xml', table: '/xl/workbook.xml', ppt: '/ppt/presentation.xml' }[format.type]
      zip.file('[Content_Types].xml', contentTypes.replace(/<Override\b[^>]*>/g, tag => tag.includes(`PartName="${part}"`) ? tag.replace(/ContentType="[^"]+"/, `ContentType="${mainType}"`) : tag))
      zip.file('macro-fixture.bin', 'INERT TEST PAYLOAD')
      const bytes = await zip.generateAsync({ type: 'nodebuffer' })
      const read = await 读取兼容文档(format.extension, bytes)
      assert.equal(read.类型, format.type)
      assert(read.警告.some(text => text.includes('来源文件保持不变')))
      fs.writeFileSync(path.join(output, `verify.${format.extension}`), bytes)
      result.checks.push({ extension: format.extension, mode: 'macro/add-in body import; source protected', warnings: read.警告 })
      console.log(`PASS ${format.extension}: protected source`)
      checkpoint()
    }
    result.finishedAt = new Date().toISOString()
    result.status = result.failures.length ? 'failed' : 'passed'
    checkpoint()
    app.exit(result.failures.length ? 1 : 0)
  } catch (error) { result.failures.push({ extension: 'runner', error: error.stack }); checkpoint(); console.error(error.stack); app.exit(1) }
})
