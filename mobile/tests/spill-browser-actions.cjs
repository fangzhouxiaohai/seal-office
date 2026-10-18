const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')

/** Final production browser/WebView regression. Uses real UI and real local XLSX
 * codecs/storage; creates synthetic local documents only and needs no account. */
module.exports = async function spillBrowserActions({ win, evaluate, output, checks = [] }) {
  const pause = () => new Promise(resolve => setTimeout(resolve, 100))
  const until = async (code, label) => { for (let attempt=0;attempt<120;attempt++) { if(await evaluate(code)) return;await pause() }throw new Error(label) }
  const filename = await evaluate(`(async()=>{const api=window.electronAPI;window.__spillBrowserProbe={open:api.showOpenDialog,save:api.saveToFile,saved:[],blurred:0};api.saveToFile=async(...args)=>{const result=await window.__spillBrowserProbe.save.apply(api,args);window.__spillBrowserProbe.saved.push({path:args[0],success:result.成功});return result};const model={工作表:[{名称:'动态数组',数据:[[{公式:'SEQUENCE(3,2,10)',结果:9999,动态数组:true,数组范围:'A1:B3'},9999,'',{公式:'TRANSPOSE(A1#)',结果:9999,动态数组:true,数组范围:'D1:F2'},9999,9999,'',{公式:'LEN("😀")',结果:9999}],[9999,9999,'',9999,9999,9999,'',{文字:[{文本:'5'}],数据验证:{类型:'整数',最小值:1,最大值:10,允许空白:false}}],[9999,9999],[],[],[{公式:'Data!A1:B2',结果:9999,动态数组:true,数组范围:'A6:B7'},9999],[9999,9999]]},{名称:'Data',数据:[[1,''],[2,3]]}]};const bytes=await api.office.writeXlsx(model);if(!bytes.成功)throw new Error(bytes.错误);const file=await api.showSaveDialog('动态数组生产验收.xlsx','table');const saved=await api.saveToFile(file,bytes.数据,'二进制');if(!saved.成功)throw new Error(saved.错误);window.__spillBrowserProbe.saved=[];api.showOpenDialog=async()=>file;document.querySelector('.seal-mobile-nav [aria-label="打开文件"]').click();return file})()`)
  try {
    await until(`document.querySelector('[data-地址="B3"]')?.textContent==='15'`, '真实XLSX动态数组必须在编辑器重新计算，不能沿用故意错误9999缓存')
    assert.equal(await evaluate(`document.querySelector('[data-地址="F2"]').textContent`),'15')
    assert.equal(await evaluate(`document.querySelector('[data-地址="H1"]').textContent`),'1')
    assert.equal(await evaluate(`document.querySelector('[data-地址="B6"]').textContent`),'0')
    await evaluate(`document.querySelector('[data-地址="B2"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);await pause()
    assert.ok(await evaluate(`document.querySelector('[aria-label="公式栏"]').readOnly`))
    assert.match(await evaluate(`document.querySelector('[role="status"]').textContent`),/^动态数组结果来自 A1，请在锚点编辑公式；结果区域不能单独修改。$/)
    await evaluate(`document.querySelector('[data-地址="B2"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));document.querySelector('.wps-sheet').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}))`)
    assert.equal(await evaluate(`!!document.querySelector('.wps-sheet__editor')`),false)
    assert.equal(await evaluate(`document.querySelector('[data-地址="B2"]').textContent`),'13')
    await evaluate(`document.querySelector('[data-地址="A1"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await pause()
    await evaluate(`(()=>{const input=document.querySelector('.wps-sheet__editor');window.__spillBrowserProbe.blurInput=input;window.__spillBrowserProbe.blurListener=()=>window.__spillBrowserProbe.blurred++;input.addEventListener('blur',window.__spillBrowserProbe.blurListener);input.focus();input.select();})()`)
    await win.webContents.insertText('=SEQUENCE(4,2,20)');await pause()
    const input = await evaluate(`(()=>{const input=document.querySelector('.wps-sheet__editor');const before={value:input.value,focused:document.activeElement===input,blurred:window.__spillBrowserProbe.blurred};input.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));return before})()`)
    assert.equal(input.value,'=SEQUENCE(4,2,20)');assert.equal(input.focused,true);assert.equal(input.blurred,0)
    await until(`window.__spillBrowserProbe.saved.length>0`,'未失焦CtrlS必须实际保存XLSX文件')
    const saved = await evaluate(`(async()=>{const api=window.electronAPI,file=await api.readFile(${JSON.stringify(filename)});if(!file.成功)throw new Error(file.错误);return api.office.readXlsx(file.内容)})()`)
    assert.equal(saved.成功,true,JSON.stringify(saved));const origin=saved.工作表列表[0].元数据.公式来源
    assert.equal(origin.A1.结果,20);assert.equal(origin.A1.动态数组,true);assert.equal(origin.A1.数组范围,'A1:B4');assert.equal(origin.A1.数组缓存.B4,27)
    assert.equal(origin.D1.数组范围,'D1:G2');assert.equal(origin.D1.数组缓存.G2,27);assert.match(origin.D1.原始值,/ANCHORARRAY/)
    assert.ok(await evaluate(`document.activeElement.classList.contains('wps-sheet__editor')`),'保存不能通过blur偷偷提交')
    await evaluate(`(()=>{const select=document.querySelector('[aria-label="公式兼容模式"]');select.value='WPS';select.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause()
    assert.equal(await evaluate(`document.querySelector('[data-地址="H1"]').textContent`),'2')
    assert.equal(await evaluate(`document.querySelector('[data-地址="B6"]').textContent`),'')
    await evaluate(`window.__spillBrowserProbe.saved=[];document.querySelector('.wps-sheet').dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}))`)
    await until(`window.__spillBrowserProbe.saved.length>0`,'WPS兼容模式必须可实际保存')
    const compatibility=await evaluate(`(async()=>{const api=window.electronAPI,file=await api.readFile(${JSON.stringify(filename)});return api.office.readXlsx(file.内容)})()`)
    assert.equal(compatibility.工作表列表[0].元数据.公式兼容模式,'WPS');assert.equal(compatibility.工作表列表[0].元数据.公式来源.H1.结果,2)
    for(const width of[390,1280]){win.setContentSize(width,844);await pause();assert.ok(await evaluate(`document.querySelector('.wps-sheet-toolbar').scrollWidth<=document.querySelector('.wps-sheet-toolbar').clientWidth+1`));if(output)await win.capturePage().then(image=>fs.writeFileSync(path.join(output,'spill-'+width+'.png'),image.toPNG()))}
    await evaluate(`(()=>{const select=document.querySelector('[aria-label="公式兼容模式"]');select.value='Excel';select.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause()
    assert.equal(await evaluate(`document.querySelector('[data-地址="H1"]').textContent`),'1')
    await evaluate(`document.querySelector('[data-地址="H2"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await pause()
    await evaluate(`(()=>{const input=document.querySelector('.wps-sheet__editor');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'999');input.dispatchEvent(new Event('input',{bubbles:true}));window.__spillBrowserProbe.saved=[]})()`);await pause()
    await evaluate(`document.querySelector('.wps-sheet__editor').dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}))`)
    await until(`document.body.textContent.includes('输入不符合数据验证')`,'无效草稿应明确提示验证失败')
    assert.equal(await evaluate(`window.__spillBrowserProbe.saved.length`),0,'验证失败禁止写旧值或非法值')
    assert.equal(await evaluate(`document.querySelector('.wps-sheet__editor').value`),'999')
    await evaluate(`Array.from(document.querySelectorAll('.ant-modal-confirm-btns button')).find(button=>/确定|OK/.test(button.textContent))?.click()`)
    await pause();await evaluate(`document.querySelector('.wps-sheet__editor')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
    checks.push('动态数组：真实XLSX错缓存导入重算、二维SEQUENCE/跨表/ANCHORARRAY、子格只读及部分删除保护')
    checks.push('表格草稿：未失焦CtrlS实际保存XLSX、扩展区域及跨表#引用缓存重开正确；无效验证草稿禁止保存')
    checks.push('WPS/Excel公式兼容模式：Unicode计数及空白数组差异可切换，原生自定义属性保存重开，390/1280px公式栏无溢出')
    return {passed:true,actualXlsxRoundtrip:true,latestUnblurredDraft:true,validationRefused:true,editableCompatibility:true,widths:[390,1280]}
  } finally {
    await evaluate(`(()=>{const probe=window.__spillBrowserProbe;if(probe){probe.blurInput?.removeEventListener('blur',probe.blurListener);window.electronAPI.saveToFile=probe.save;window.electronAPI.showOpenDialog=probe.open;delete window.__spillBrowserProbe}})()`)
  }
}
