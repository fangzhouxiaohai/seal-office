const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
module.exports = async function workspaceTools({ win, evaluate, output, checks = [] }) {
  const pause = () => new Promise(resolve => setTimeout(resolve, 120))
  const until = async (code,label) => { for(let i=0;i<160;i++){if(await evaluate(code))return;await pause()}throw new Error(label) }
  const click = async (label,scope='document') => {
    const target = `(()=>{const root=${scope};return root&&[...root.querySelectorAll('button')].find(b=>b.getClientRects().length&&b.textContent.replace(/\\s/g,'')===${JSON.stringify(label.replace(/\s/g,''))});})()`
    // Native resize and React's responsive layout update are asynchronous.
    // Wait for the real visible control instead of assuming 120 ms is enough.
    await until(`!!${target}`, '可见按钮：'+label)
    await evaluate(`${target}.click()`);await pause()
  }
  const navigate = async key => { await evaluate(`document.querySelector('[aria-label="服务"]').click()`);await pause();await evaluate(`document.querySelector('[data-nav-key="${key}"]').click()`);await until(`!!document.querySelector('[data-tool="${key}"]')`,key+'实际页面') }
  const type = async (selector,value) => { await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw new Error('Missing input');const proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause() }
  await evaluate(`window.__toolsQa={save:window.electronAPI.saveToFile,write:window.electronAPI.office.writePptx,xlsx:window.electronAPI.office.writeXlsx,files:[],ppt:null,table:null};window.electronAPI.saveToFile=async(...args)=>{const r=await window.__toolsQa.save.apply(window.electronAPI,args);window.__toolsQa.files.push({path:args[0],result:r});return r};window.electronAPI.office.writePptx=async(...args)=>{const r=await window.__toolsQa.write(...args);window.__toolsQa.ppt=r;return r};window.electronAPI.office.writeXlsx=async(...args)=>{const r=await window.__toolsQa.xlsx(...args);window.__toolsQa.table=r;return r};true`)
  try {
    win.setContentSize(390,844)
    await navigate('multitable');win.setContentSize(1280,844);await pause();await click('新建',"document.querySelector('.wps-homesidebar__actions')");win.setContentSize(390,844);await pause()
    await until(`document.querySelectorAll('[data-new-service]').length===6`,'新建面板六类真实应用服务')
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-new-service]')].map(b=>b.dataset.newService)`),['multitable','mindmap','flow','design','knowledge','notes'])
    await evaluate(`document.querySelector('[data-new-service="multitable"]').click()`);await until(`!document.querySelector('.ant-modal-wrap:not([style*="display: none"])')`,'服务入口关闭新建面板')
    await click('添加记录')
    await type('.ant-modal input[aria-label="事项"]','移动任务😀');await type('.ant-modal input[aria-label="预算"]','0');await click('保存','document.querySelector(\'.ant-modal\')')
    await until(`document.querySelector('[data-tool="multitable"]').textContent.includes('移动任务😀')`,'表格新增记录')
    await click('看板');assert.ok(await evaluate(`!![...document.querySelectorAll('.tool-card-title')].find(b=>b.textContent==='移动任务😀')`))
    await click('导出 Excel');await until(`!!window.__toolsQa.table`,'真实Excel写出')
    const table = await evaluate(`(async()=>{const r=window.__toolsQa.table;if(!r.成功)throw new Error(r.错误);return window.electronAPI.office.readXlsx(r.数据)})()`)
    assert.equal(table.成功,true);assert.match(table.工作表列表[0].html,/移动任务😀/);assert.match(table.工作表列表[0].html,/>0<\/td>/)
    if(output)fs.writeFileSync(path.join(output,'mobile-multitable.png'),(await win.capturePage()).toPNG())
    await navigate('notes');await click('新建笔记');await type('input[aria-label="笔记标题"]','移动笔记😀');await type('textarea[aria-label="笔记正文"]','# 项目记录\n\n- [x] 完成测试\n正文保留😀𠀀')
    await click('置顶');await click('预览');assert.ok(await evaluate(`!![...document.querySelectorAll('.notes-markdown h1')].find(n=>n.textContent==='项目记录')`))
    await evaluate(`(()=>{const input=document.querySelector('input[accept="image/png,image/jpeg,image/webp,image/gif"]');const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6PVEAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'本机配图.png',{type:'image/png'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await until(`!![...document.querySelectorAll('.notes-markdown img')].find(img=>img.complete&&img.naturalWidth>0)`,'笔记本机图片实际解码与预览')
    await click('导出备份');await until(`window.__toolsQa.files.some(f=>f.path.endsWith('.json')&&f.result.成功)`,'笔记实际备份')
    const note = await evaluate(`(async()=>{const file=window.__toolsQa.files.filter(f=>f.path.endsWith('.json')&&f.result.成功).at(-1);const r=await window.electronAPI.readFile(file.path);if(!r.成功)throw new Error(r.错误);return JSON.parse(r.内容)})()`)
    assert.ok(note.notes.some(n=>n.title==='移动笔记😀'&&n.text.includes('😀𠀀')&&n.text.includes('data:image/png;base64,')&&n.pinned))
    if(output)fs.writeFileSync(path.join(output,'mobile-notes.png'),(await win.capturePage()).toPNG())
    await navigate('design');assert.equal(await evaluate(`document.querySelectorAll('.design-template-grid article').length`),6)
    await click('使用设计','document.querySelector(\'.design-template-grid article\')')
    await until(`!!document.querySelector('.wps-ppt-canvas')`,'设计进入真实画布')
    for(const width of [360,390,820]) {
      win.setContentSize(width,844);await win.capturePage();await pause()
      const bounds=await evaluate(`(()=>{const r=document.querySelector('.wps-ppt-stage').getBoundingClientRect(),b=document.querySelector('.wps-ppt-body').getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,bottom:r.bottom,parentBottom:b.bottom,width:innerWidth}})()`)
      assert.ok(bounds.left>=0&&bounds.right<=bounds.width+1&&bounds.height>100&&bounds.bottom<=bounds.parentBottom+1,'手机演示画布必须留在视口内，不能因纵向flex换列移至屏幕外：'+JSON.stringify(bounds))
    }
    win.setContentSize(390,844);await pause()
    assert.ok(await evaluate(`document.querySelector('.wps-ppt-canvas').textContent.includes('让创意成为行动')`))
    await evaluate(`document.querySelector('.wps-ppt-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}))`)
    await until(`window.__toolsQa.files.some(f=>/\\.(?:slppt|sealshow|pptx)$/i.test(f.path)&&f.result.成功)`,'设计真实保存')
    const design=await evaluate(`(async()=>{const api=window.electronAPI,saved=window.__toolsQa.files.filter(f=>/\\.(?:slppt|sealshow|pptx)$/i.test(f.path)&&f.result.成功).at(-1),file=await api.readFile(saved.path);if(!file.成功)throw new Error(file.错误);const ext=saved.path.split('.').pop().toLowerCase();return ext==='pptx'?api.office.readPptx(file.内容):api.office.readSeal(ext,file.内容)})()`)
    assert.equal(design.成功,true);assert.deepEqual(design.演示文稿.页面尺寸,{宽:960,高:1280});assert.ok(design.演示文稿.幻灯片列表[0].对象列表.length>=3)
    for(const key of ['multitable','notes','design']){await navigate(key);for(const width of[360,820,1280]){win.setContentSize(width,844);await pause();assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),key+'不能横向撑开整页')}win.setContentSize(390,844);await pause()}
    checks.push('多维表格真实表单→看板→原生XLSX（零预算/Unicode）；笔记自动保存/预览/JSON恢复；设计真实画布→SLPPT/PPTX保存文件重开保留尺寸和对象；360/390/820/1280px布局')
  } finally { await evaluate(`(()=>{const q=window.__toolsQa;if(q){window.electronAPI.saveToFile=q.save;window.electronAPI.office.writePptx=q.write;window.electronAPI.office.writeXlsx=q.xlsx;delete window.__toolsQa}})()`);win.setContentSize(390,844) }
}
