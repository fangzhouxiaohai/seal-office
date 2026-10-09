// Real DOM -> DOCX -> real DOM regression in isolated offscreen Chromium.
// electron scripts/verify-document-roundtrip.cjs <output-directory> [sample.docx] [app.asar]
const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const project = path.resolve(__dirname, '..'), output = path.resolve(process.argv[2])
const sample = process.argv[3], archive = process.argv[4] && path.resolve(process.argv[4])
app.setPath('userData', path.join(output, 'profile'))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  let win
  const checks = []
  try {
    fs.mkdirSync(output, { recursive: true })
    await require('esbuild').build({ stdin: { resolveDir: project, loader: 'ts', contents: `
      import {htmlToDocxModel} from './renderer/src/editor/commands';
      import {净化富文本} from './renderer/src/editor/sanitizeHtml';
      const root=document.getElementById('content');
      let pageSettings;
      window.renderDoc=(html,part,width=614,settings)=>{pageSettings=settings;root.parentElement.style.width=(width+180)+'px';root.className=part==='页眉'?'wps-editor-canvas__header':part==='页脚'?'wps-editor-canvas__footer':'wps-editor-canvas__content';root.style.position='static';root.innerHTML=净化富文本(html)};
      window.toModel=(part)=>part?htmlToDocxModel('<p>正文</p>',{纸张:'A4',纸张方向:'纵向',页边距:'常规',分栏:'一栏',水印:'无',页面边框:'无',页面颜色:'#FFFFFF',文字方向:'横排',[part+'Html']:root.innerHTML}):htmlToDocxModel(root.innerHTML,pageSettings);
      window.editSample=()=>{const h=root.querySelector('h1');h.style.fontSize='24pt';h.style.fontWeight='700';h.querySelectorAll('span,font').forEach(n=>{n.style.fontSize='24pt';n.style.fontWeight='700'});};
      window.inspectDoc=()=>{
        const paragraphs=[...root.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li')].map(p=>{
          const r=p.getBoundingClientRect(),s=getComputedStyle(p),walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),runs=[];
          let n;while(n=walker.nextNode()){if(!n.textContent)continue;const range=document.createRange();range.selectNodeContents(n);const b=range.getBoundingClientRect(),f=getComputedStyle(n.parentElement);
            runs.push({text:n.textContent,left:b.left,top:b.top,width:b.width,height:b.height,size:f.fontSize,weight:f.fontWeight,italic:f.fontStyle,font:f.fontFamily,color:f.color});}
          return {text:p.textContent,left:r.left,top:r.top,width:r.width,height:r.height,size:s.fontSize,runs};
        });return {text:root.textContent,paragraphs};
      };
    ` }, bundle: true, platform: 'browser', define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"test"' }, outfile: path.join(output, 'verify.js') })
    const css = fs.readFileSync(path.join(project, 'renderer/src/styles.css'), 'utf8')
    fs.writeFileSync(path.join(output, 'verify.html'), `<!doctype html><meta charset="utf-8"><style>${css}</style><main class="wps-editor-canvas__paper" style="margin:20px auto;transform:scale(1.25);transform-origin:top center"><div id="content" class="wps-editor-canvas__content"></div></main><script src="verify.js"></script>`)
    win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
    await win.loadFile(path.join(output, 'verify.html'))
    const load = name => require(archive ? path.join(archive, name) : path.join(project, name))
    const { 生成docx } = load('main/office/docxWriter.js'), { 读取docx } = load('main/office/docxReader.js')
    const cases = [
      { name:'default-heading', html:'<h1 style="text-align:center">保存重开格式测试</h1><p><br></p><p>正文第一段。</p><p>正文第二段。</p>' },
      { name:'edited-heading',html:'<h1 style="text-align:center;font-size:24pt;font-weight:700">海豹办公 · 排版保存验证</h1><p style="font-size:18pt;line-height:2"><br></p><p style="font-size:12pt;line-height:1.5">此示例验证修改后的标题字号、加粗、正文行距和空行高度在保存重开后保持一致。</p><p style="font-size:12pt;line-height:1.5">程序默认以 125% 显示页面，查看缩放不会写入文档字号。</p>' },
      { name:'keywords-and-relative',html:'<h1><span style="font-size:xxx-large">大标题</span></h1><p style="font-size:16pt"><span style="font-size:1.5em">相对字号</span><font size="2">小号文字</font><span style="font-size:x-large">尺寸关键字</span></p>' },
      { name:'empty-line',html:'<p style="font-size:18pt;line-height:1.5">正文</p><p style="font-size:24pt;line-height:2"><br></p><p style="font-size:18pt;text-indent:2em;margin-top:12pt">缩进正文</p>' },
      { name:'mixed-format',html:'<h2 style="text-align:right;margin-top:12pt;margin-bottom:6pt">二级标题</h2><p style="font-size:12pt;line-height:1.5"><b>粗体</b><i>斜体</i><u>下划线</u><span style="color:#C00000;background-color:#FFFF00">颜色</span> m<sup>2</sup> H<sub>2</sub>O<br>下一行</p>' },
      { name:'table-list',html:'<ul><li style="line-height:1.5">条目一</li><li>条目二</li></ul><table><tr><td><p style="text-align:center;font-size:16pt">单元格</p><p style="font-size:20pt"><br></p></td><td><p>第二格</p></td></tr></table>' },
      { name:'table-format',html:'<table style="width:400px;border-collapse:collapse"><tr><td style="width:240px;padding:4px 8px;border:1px solid #C00000;background-color:#FFFF00;vertical-align:top"><p style="font-size:16pt">有边框表格</p></td><td style="width:160px;padding:4px 8px;border:1px solid #C00000"><p>第二格</p></td></tr></table><p>表后正文</p>' },
      { name:'merged-table',html:'<table style="width:400px;border-collapse:collapse"><tr><td rowspan="2" style="padding:4px 8px;border:1px solid #336699"><p>跨行文字</p></td><td colspan="2" style="padding:4px 8px;border:1px solid #336699"><p>跨列文字</p></td></tr><tr><td style="padding:4px 8px;border:1px solid #336699"><p>第二行</p></td><td style="padding:4px 8px;border:1px solid #336699"><p>第三格</p></td></tr></table>' },
      ...[{name:'a5',width:379,settings:{纸张:'A5',页边距:'常规'}},{name:'custom',width:400,settings:{纸张:'自定义',原始纸张:{宽:10000,高:15000},页边距:'自定义',原始页边距:{上:1440,右:3000,下:1440,左:1000}}}].map(page=>({name:'page-table-'+page.name,width:page.width,settings:{纸张方向:'纵向',分栏:'一栏',水印:'无',页面边框:'无',页面颜色:'无',文字方向:'横排',...page.settings},html:'<table style="width:100%;border-collapse:collapse"><tr><td style="padding:4px 8px;border:1px solid #336699"><p>'+'这是一段足够长的文字，用来验证小纸张和自定义页面宽度下表格内容的换行能够在保存重开后保持一致。'.repeat(2)+'</p></td><td style="padding:4px 8px;border:1px solid #336699"><p>第二格</p></td></tr></table>'})),
      { name:'xml-characters',html:'<p>符号 &amp; &lt; &gt; &quot; &#39; &amp;lt;</p>' },
      { name:'header-format',part:'页眉',html:'<p>默认页眉</p><p style="text-align:right;font-size:16pt;font-weight:700">加粗页眉</p>' },
      { name:'footer-format',part:'页脚',html:'<p style="text-align:center">页脚 <span data-seal-field="PAGE">1</span></p><p style="font-size:18pt;line-height:1.5"><br></p>' },
    ]
    if (sample) {
      const imported = await 读取docx(fs.readFileSync(sample))
      assert.deepEqual(imported.警告, [])
      cases.push({ name:'user-sample',html:imported.html },{ name:'user-edited',html:imported.html,edit:true })
    }
    for (const item of cases) {
      await win.webContents.executeJavaScript(`renderDoc(${JSON.stringify(item.html)},${JSON.stringify(item.part)},${JSON.stringify(item.width)},${JSON.stringify(item.settings)});${item.edit?'editSample();':''}`)
      const before = await win.webContents.executeJavaScript('inspectDoc()')
      if (item.name==='edited-heading') fs.writeFileSync(path.join(output,'format-before.png'),(await win.webContents.capturePage()).toPNG())
      if (item.name==='user-edited') fs.writeFileSync(path.join(output,'user-before.png'),(await win.webContents.capturePage()).toPNG())
      for (let cycle=1;cycle<=3;cycle++) {
        const model = await win.webContents.executeJavaScript(`toModel(${JSON.stringify(item.part)})`)
        assert.deepEqual(model.未覆盖, [], item.name)
        const bytes = await 生成docx(model)
        fs.writeFileSync(path.join(output,`${item.name}-${cycle}.docx`),bytes)
        const reopened = await 读取docx(bytes)
        assert.deepEqual(reopened.警告, [], item.name)
        const html = item.part ? reopened.页面设置[item.part+'Html'] : reopened.html
        await win.webContents.executeJavaScript(`renderDoc(${JSON.stringify(html)},${JSON.stringify(item.part)},${JSON.stringify(item.width)},${JSON.stringify(item.settings)})`)
        const after = await win.webContents.executeJavaScript('inspectDoc()')
        assert.equal(after.text,before.text,item.name+' text')
        assert.equal(after.paragraphs.length,before.paragraphs.length,item.name+' paragraph count')
        for (let i=0;i<before.paragraphs.length;i++) {
          const a=before.paragraphs[i],b=after.paragraphs[i]
          for (const metric of ['left','top','width','height']) assert.ok(Math.abs(a[metric]-b[metric])<=1,`${item.name} cycle ${cycle} paragraph ${i} ${metric}: ${a[metric]} -> ${b[metric]}`)
          assert.equal(a.runs.length,b.runs.length,item.name+' text run count')
          a.runs.forEach((run,j)=>{
            const other=b.runs[j];for(const prop of ['text','size','weight','italic','color']) assert.equal(other[prop],run[prop],`${item.name} ${prop}`)
            for(const metric of ['left','top','width','height']) assert.ok(Math.abs(run[metric]-other[metric])<=1,`${item.name} run ${i}/${j} ${metric}: ${run[metric]} -> ${other[metric]}`)
          })
        }
        if (item.name==='user-edited' && cycle===3) fs.writeFileSync(path.join(output,'user-after.png'),(await win.webContents.capturePage()).toPNG())
        if (item.name==='edited-heading' && cycle===3) fs.writeFileSync(path.join(output,'format-after.png'),(await win.webContents.capturePage()).toPNG())
        checks.push({name:item.name,cycle,paragraphs:after.paragraphs.length,passed:true})
      }
    }
    fs.writeFileSync(path.join(output,'roundtrip-report.json'),JSON.stringify({passed:true,checks},null,2))
    console.log(JSON.stringify({passed:true,cases:cases.length,checks:checks.length,output}));win.destroy();app.exit(0)
  } catch(error) {
    fs.writeFileSync(path.join(output,'roundtrip-report.json'),JSON.stringify({passed:false,checks,error:error.message},null,2))
    console.error(error);win?.destroy();app.exit(1)
  }
})
