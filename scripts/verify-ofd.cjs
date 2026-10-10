const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict'), JSZip = require('jszip')
const root = path.resolve(__dirname, '..'), output = path.join(root, '.upgrade-private/ofd-verification'), webRoot = path.join(root, 'mobile/static/office')
app.setPath('userData', path.join(output, `profile-${process.pid}`)); app.disableHardwareAcceleration()
async function fixture() {
  const zip = new JSZip(), ns = 'http://www.ofdspec.org/2016'
  zip.file('OFD.xml', `<?xml version="1.0"?><ofd:OFD xmlns:ofd="${ns}" Version="1.0" DocType="OFD"><ofd:DocBody><ofd:DocInfo><ofd:DocID>seal-synthetic-verification</ofd:DocID></ofd:DocInfo><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`)
  zip.file('Doc_0/Document.xml', `<ofd:Document xmlns:ofd="${ns}"><ofd:CommonData><ofd:MaxUnitID>100</ofd:MaxUnitID><ofd:PageArea><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:PageArea><ofd:PublicRes>PublicRes.xml</ofd:PublicRes></ofd:CommonData><ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/><ofd:Page ID="2" BaseLoc="Pages/Page_1/Content.xml"/></ofd:Pages></ofd:Document>`)
  zip.file('Doc_0/PublicRes.xml', `<ofd:Res xmlns:ofd="${ns}" BaseLoc="Res"><ofd:Fonts><ofd:Font ID="1" FontName="Microsoft YaHei" FamilyName="Microsoft YaHei"/></ofd:Fonts></ofd:Res>`)
  for (let i = 0; i < 2; i++) zip.file(`Doc_0/Pages/Page_${i}/Content.xml`, `<ofd:Page xmlns:ofd="${ns}"><ofd:Content><ofd:Layer ID="${10 + i}"><ofd:TextObject ID="${20 + i}" Boundary="20 30 160 12" Font="1" Size="5"><ofd:FillColor Value="20 40 60"/><ofd:TextCode X="0" Y="6">海豹办公 OFD 中文验收 ${i + 1}</ofd:TextCode></ofd:TextObject><ofd:PathObject ID="${30 + i}" Boundary="20 60 100 30" Stroke="true" Fill="false" LineWidth="0.5"><ofd:StrokeColor Value="20 100 220"/><ofd:AbbreviatedData>M 0 0 L 100 0 L 100 30 L 0 30 C</ofd:AbbreviatedData></ofd:PathObject></ofd:Layer></ofd:Content></ofd:Page>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  const server = http.createServer((req, res) => {
    const filename = path.resolve(webRoot, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'))
    if (!filename.startsWith(webRoot + path.sep)) { res.writeHead(403).end(); return }
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }[path.extname(filename)] || 'application/octet-stream')
    fs.createReadStream(filename).on('error', () => { res.writeHead(404).end() }).pipe(res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const win = new BrowserWindow({ show: false, width: 1280, height: 920, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, sandbox: true } })
  const evaluate = code => win.webContents.executeJavaScript(code, true)
  const errors = []
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message) })
  win.webContents.session.on('will-download', (_, item) => item.cancel())
  try {
    await win.loadURL(`http://127.0.0.1:${server.address().port}/`)
    for (let i = 0; i < 120 && !await evaluate('Boolean(window.electronAPI && document.querySelector(".wps-app"))'); i++) await new Promise(resolve => setTimeout(resolve, 250))
    const original = await fixture(), base64 = original.toString('base64')
    fs.writeFileSync(path.join(output, 'synthetic.ofd'), original)
    await evaluate(`(async()=>{const p='/seal/documents/ofd/synthetic.ofd';const r=await window.electronAPI.saveToFile(p,${JSON.stringify(base64)},'二进制');if(!r.成功)throw Error(r.错误);const f=new File(['x'],'synthetic.ofd');Object.defineProperty(f,'path',{value:p});const dt=new DataTransfer();dt.items.add(f);window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));})()`)
    for (let i = 0; i < 120; i++) {
      if (await evaluate('Boolean(document.querySelector(".ofd-viewer__pages svg text"))')) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    const state = await evaluate(`({text:document.querySelector('.ofd-viewer')?.textContent,pages:document.querySelector('.ofd-viewer__pages')?.children.length,buttons:Array.from(document.querySelectorAll('.ofd-viewer button')).filter(b=>!b.disabled).map(b=>b.textContent)})`)
    assert.equal(state.pages, 2, JSON.stringify(state)); assert.match(state.text, /海豹办公 OFD 中文验收 1/)
    assert(state.buttons.includes('导出 PDF'))
    const painted = await evaluate(`Array.from(document.querySelectorAll('.ofd-viewer__pages img')).filter(img=>img.src.startsWith('data:image/png')).length`)
    assert(painted >= 2, 'OFD canvas paths must retain painted pixels after sanitizing')
    await new Promise(resolve => setTimeout(resolve, 300))
    await win.capturePage().then(img => fs.writeFileSync(path.join(output, 'ofd-pc.png'), img.toPNG()))
    await evaluate(`window.electronAPI.showSaveDialog=(name,kind)=>Promise.resolve('/seal/documents/ofd/'+(kind==='ofd'?'copy.ofd':'export.pdf'));Array.from(document.querySelectorAll('.ofd-viewer button')).find(b=>b.textContent==='保存 OFD 副本').click()`)
    let copy
    for (let i = 0; i < 80; i++) { copy = await evaluate(`window.electronAPI.readFile('/seal/documents/ofd/copy.ofd')`); if (copy.成功) break; await new Promise(resolve => setTimeout(resolve, 100)) }
    assert.equal(copy.内容, base64)
    for (let i = 0; i < 80 && !await evaluate(`Array.from(document.querySelectorAll('.ofd-viewer button')).some(b=>b.textContent==='导出 PDF'&&!b.disabled)`); i++) await new Promise(resolve => setTimeout(resolve, 100))
    await evaluate(`Array.from(document.querySelectorAll('.ofd-viewer button')).find(b=>b.textContent==='导出 PDF').click()`)
    let pdf
    for (let i = 0; i < 160; i++) { pdf = await evaluate(`window.electronAPI.readFile('/seal/documents/ofd/export.pdf')`); if (pdf.成功) break; await new Promise(resolve => setTimeout(resolve, 250)) }
    assert(pdf.成功, await evaluate('document.body.textContent'))
    const { PDFDocument } = require('pdf-lib'), bytes = Buffer.from(pdf.内容, 'base64'), document = await PDFDocument.load(bytes)
    assert.equal(document.getPageCount(), 2)
    for (const page of document.getPages()) { assert(Math.abs(page.getWidth() - 210 * 72 / 25.4) < 1); assert(Math.abs(page.getHeight() - 297 * 72 / 25.4) < 1) }
    fs.writeFileSync(path.join(output, 'ofd-mobile-export.pdf'), bytes)
    // Exercise the same rendered HTML in the native Electron printer independently of the mobile adapter.
    await evaluate(`window.ofdPrintHtml='';window.electronAPI.printPreview=async html=>{window.ofdPrintHtml=html;return{成功:false,错误:'验收捕获打印内容'}};Array.from(document.querySelectorAll('.ofd-viewer button')).find(b=>b.textContent==='打印预览').click()`)
    let html
    for (let i = 0; i < 80; i++) { html = await evaluate('window.ofdPrintHtml'); if (html) break; await new Promise(resolve => setTimeout(resolve, 100)) }
    const nativeBytes = await require('../main/pdfExport').createPdfFromHtml(html), nativeDocument = await PDFDocument.load(nativeBytes)
    assert.equal(nativeDocument.getPageCount(), 2)
    assert(Math.abs(nativeDocument.getPages()[0].getWidth() - 210 * 72 / 25.4) < 1)
    fs.writeFileSync(path.join(output, 'ofd-native-print.pdf'), nativeBytes)
    const fatal = errors.filter(message => message !== 'ofd:Template not found!')
    assert.equal(fatal.length, 0, fatal.join('\n'))
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ status: 'passed', pages: 2, checks: ['实际 OFD XML 解析和中文 SVG 渲染', '原字节副本保存', '移动端 PDF 两页和毫米尺寸', 'Electron 打印两页和毫米尺寸'], errors: fatal, warnings: errors.filter(message => !fatal.includes(message)) }, null, 2))
    console.log('PASS OFD: parser, SVG, original-byte copy, mobile PDF and native print')
    win.destroy(); server.close(); app.exit(0)
  } catch (error) { console.error(error.stack); win.destroy(); server.close(); app.exit(1) }
})
