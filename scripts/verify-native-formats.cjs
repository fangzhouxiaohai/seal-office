// Shared read-only application probe. It loads codecs from the supplied built
// app, writes only into its explicit verification directory, and never installs
// an application or touches a default association.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const extensions = { sldoc: 'word', slxls: 'table', slppt: 'ppt', spdf: 'pdf' }
const fonts = ['NotoSansSC.ttf', 'NotoSerifCJKsc-Regular.otf', 'OFL.txt', 'NotoSerif-LICENSE.txt']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

async function verifyNativeFormats({ load, directory, resources }) {
  fs.mkdirSync(directory, { recursive: true })
  const codec = load('main/office/sealFormat.js'), JSZip = load('node_modules/jszip')
  const { PDFDocument, PDFName } = load('node_modules/pdf-lib')
  const definitions = load('main/documentFormats.json')
  for (const [extension, type] of Object.entries(extensions)) {
    assert.equal(codec.TYPES[extension], type)
    assert(definitions.some(item => item.extension === extension && item.type === type && item.native))
  }
  const png = "iVBORw0KGgoAAAANSUhEUgAAAKAAAABQCAYAAACeXX40AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAADwSURBVHhe7dSxDcBADAMx77/0p/+kSGNcQwLa4KA5EBIgKQGSEiCpV4AzY7a222eAsEGApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkfgdotrWbuyMlQFICJCVAQuc86FAUky+pSUQAAAAASUVORK5CYII="
  load('main/office/pptx/media.js').检查图片字节(Buffer.from(png, 'base64'), 'image/png')
  const unicode = '中文𠮷🦭 العربية e\u0301 00123'
  const imageId = sha(Buffer.from(png, 'base64'))
  const cell = (value, extra = {}) => ({ 原始值: value, 显示值: value, 格式: { 字体: 'Noto Sans SC', 字号: 12 }, ...extra })
  const sheet = (name, id) => ({ id, name, 行数: 100, 列数: 26, 列宽: Array(26).fill(88), 行高: Array(100).fill(24), 合并区域: ['A3:B3'], 单元格: {}, 图片: [{ id: imageId, 格式: 'png', 数据: png, 行: 4, 列: 2, 宽: 32, 高: 32 }], 页面设置: { 页边距: '常规', 方向: '跟随打印机', 纸张大小: '跟随打印机' }, 冻结: { 行: 1, 列: 1 }, 日期系统1904: true, 公式兼容模式: 'WPS' })
  const first = sheet('来源𠮷', 'native-sheet-1'), second = sheet('第二表🦭', 'native-sheet-2')
  first.单元格 = {
    A1: cell(unicode), B1: cell('=SUM($A$2,\'第二表🦭\'!A2)', { 显示值: '12', 计算值: 12 }),
    C1: cell('=SEQUENCE(2,2)', { 显示值: '1', 动态数组: true, 溢出范围: 'C1:D2', 公式来源: { 原始值: '=SEQUENCE(2,2)', 结果: 1, 动态数组: true, 数组范围: 'C1:D2', 数组缓存: { C1: 1, D1: false, C2: '', D2: { error: '#N/A' } } } }),
    A2: cell('5', { 计算值: 5 }), E1: cell('=UNKNOWN()', { 计算值: undefined, 公式状态: '来源缓存', 公式来源: { 原始值: '=UNKNOWN()', 结果: false } }),
    F1: cell('=0/0', { 计算值: NaN }), G1: cell('=1/0', { 计算值: Infinity }), H1: cell('=-1/0', { 计算值: -Infinity }), I1: cell('-0', { 计算值: -0 }),
  }
  second.单元格 = { A1: cell(unicode), A2: cell('7', { 计算值: 7 }) }
  const pdf = await PDFDocument.create(), page = pdf.addPage([400, 500])
  page.drawText('Original PDF content', { x: 20, y: 470, size: 12 })
  const image = await pdf.embedPng(Buffer.from(png, 'base64'))
  page.drawImage(image, { x: 20, y: 400, width: 24, height: 24 })
  pdf.setTitle(unicode)
  await pdf.attach(Buffer.from(unicode), '附件𠮷.txt', { mimeType: 'text/plain' })
  const originalPdf = Buffer.from(await pdf.save())
  const editedPdf = await load('main/pdf/pdfTools.js').编辑页面(originalPdf, { 类型: 'text', 页码: 1, x: 20, y: 80, 字号: 18, 文字: '中文𠮷 e\u0301' })
  const models = {
    sldoc: { html: `<p>${unicode}</p><div class="wps-chart" contenteditable="false"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><path d="M0 0 L20 20" stroke="#123456"></path><text x="1" y="12">图表𠮷</text></svg></div><p><span class="wps-formula">a<sup>2</sup></span><span data-seal-revision-type="ins" data-seal-revision-author="作者𠮷">修订</span><img src="data:image/png;base64,${png}"></p>`, 页面设置: { 页眉Html: `<p>${unicode}</p>`, 页脚Html: '<p><span data-seal-field="PAGE">1</span></p>', 方向: '横向' }, 警告: ['来源记录𠮷'] },
    slxls: { 工作表列表: [first, second], 警告: ['来源缓存保持不变'] },
    slppt: { 演示文稿: { 模型版本: 2, id: 'native-deck', name: '演示𠮷.slppt', 当前索引: 0, 资源索引: {}, 幻灯片列表: [{ id: 'native-slide', title: unicode, 版式: '空白', 背景色: '#FFFFFF', 备注: unicode, 文本框列表: [{ id: 'native-text', x: 20, y: 20, width: 300, height: 80, text: unicode, 字号: 24, 颜色: '#222222' }], 对象列表: [{ id: 'native-image', 类型: '图片', x: 20, y: 150, width: 48, height: 48, 资源标识: imageId }] }] }, 资源条目: [{ 标识: imageId, 类型: 'image/png', 数据: png }], 警告: [] },
    spdf: { PDF数据: editedPdf.toString('base64'), 警告: ['完整 PDF 原始字节'] },
  }
  const results = []
  for (const [extension, type] of Object.entries(extensions)) {
    let payload = models[extension], bytes
    const file = path.join(directory, 'packaged-native.' + extension)
    for (let cycle = 0; cycle < 2; cycle++) {
      bytes = await codec.writeSeal(type, payload)
      assert.equal(bytes.subarray(0, 4).toString('hex'), '504b0304')
      fs.writeFileSync(file, bytes)
      const stored = fs.readFileSync(file), zip = await JSZip.loadAsync(stored, { checkCRC32: true })
      assert.equal(await zip.file('mimetype').async('string'), 'application/vnd.seal-office.document+zip')
      assert.equal(JSON.parse(await zip.file('manifest.json').async('string')).type, type)
      const { 类型, ...reopened } = await codec.readSeal(extension, stored)
      assert.equal(类型, type)
      assert.deepEqual(reopened, payload)
      if (!cycle) {
        if (type === 'word') payload = { ...reopened, html: reopened.html + '<p>保存后再编辑𠮷</p>' }
        if (type === 'table') { reopened.工作表列表[1].单元格.B2 = cell('再编辑𠮷'); payload = reopened }
        if (type === 'ppt') { reopened.演示文稿.幻灯片列表[0].备注 += ' 再编辑𠮷'; payload = reopened }
        if (type === 'pdf') { const document = await PDFDocument.load(Buffer.from(reopened.PDF数据, 'base64')); document.addPage([300, 400]); payload = { ...reopened, PDF数据: Buffer.from(await document.save()).toString('base64') } }
      }
    }
    if (type === 'pdf') {
      const raw = Buffer.from(payload.PDF数据, 'base64'), reopened = await PDFDocument.load(raw)
      assert.equal(reopened.getPageCount(), 2)
      assert.equal(reopened.getTitle(), unicode)
      assert(reopened.catalog.get(PDFName.of('Names')))
      assert(reopened.getPage(0).node.Resources().get(PDFName.of('XObject')))
      const fontDict = reopened.getPage(0).node.Resources().lookup(PDFName.of('Font'))
      assert(fontDict.keys().length >= 3, 'Standard font plus both embedded Chinese fallback fonts remain present')
      assert.deepEqual(Buffer.from((await codec.readSeal('spdf', bytes)).PDF数据, 'base64'), raw)
    }
    const legacy = { sldoc: 'sealdoc', slxls: 'sealsheet', slppt: 'sealshow' }[extension]
    if (legacy) assert.deepEqual(await codec.readSeal(legacy, bytes), await codec.readSeal(extension, bytes))
    results.push({ extension, type, cycles: 2, bytes: bytes.length, sha256: sha(bytes), unicodeAndResourcesPreserved: true, legacyAliasReadable: !!legacy })
  }
  const resourceChecks = fonts.map(name => {
    const bytes = fs.readFileSync(path.join(resources, 'fonts', name))
    assert(bytes.length > 0, 'Missing packaged font or license: ' + name)
    return { name, bytes: bytes.length, sha256: sha(bytes) }
  })
  const report = { passed: true, formats: results, fonts: resourceChecks, modifiesUserDefaults: false, installsApplication: false }
  fs.writeFileSync(path.join(directory, 'native-formats.json'), JSON.stringify(report, null, 2) + '\n')
  return report
}

module.exports = { verifyNativeFormats }
