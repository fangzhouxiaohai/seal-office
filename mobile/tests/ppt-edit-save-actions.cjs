const assert = require('node:assert/strict')

module.exports = async function pptEditingSaveActions({ evaluate }) {
  const draft = '未失焦直接保存：中文"草稿" 😀𠀀👩🏽‍💻é & <PPT>\n第二行'
  const wait = () => new Promise(resolve => setTimeout(resolve, 100))
  await evaluate(`(()=>{const api=window.electronAPI;window.__pptEditingSaveProbe={originalSave:api.saveToFile,saved:null,blurred:0};api.saveToFile=async(...args)=>{const result=await window.__pptEditingSaveProbe.originalSave.apply(api,args);if(/\\.(?:pptx|slppt|sealshow)$/i.test(String(args[0])))window.__pptEditingSaveProbe.saved={path:args[0],success:result.成功,error:result.错误};return result};document.querySelector('.wps-ppt-box').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))})()`)
  try {
    for (let i=0;i<50;i++) { if (await evaluate(`!!document.querySelector('textarea.wps-ppt-box__editor')`)) break; await wait() }
    assert.equal(await evaluate(`!!document.querySelector('textarea.wps-ppt-box__editor')`), true, '必须进入真实PPT文本框编辑')
    await evaluate(`(()=>{const input=document.querySelector('textarea.wps-ppt-box__editor');window.__pptEditingSaveProbe.blurInput=input;window.__pptEditingSaveProbe.blurListener=()=>window.__pptEditingSaveProbe.blurred++;input.addEventListener('blur',window.__pptEditingSaveProbe.blurListener);input.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(draft)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await wait()
    const before = await evaluate(`(()=>{const input=document.querySelector('textarea.wps-ppt-box__editor');const state={focused:document.activeElement===input,value:input.value,blurred:window.__pptEditingSaveProbe.blurred};input.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));return state})()`)
    assert.equal(before.focused, true); assert.equal(before.blurred, 0); assert.equal(before.value, draft)
    for (let i=0;i<100;i++) { if (await evaluate(`!!window.__pptEditingSaveProbe.saved`)) break; await wait() }
    const saved = await evaluate(`window.__pptEditingSaveProbe.saved`)
    assert.ok(saved, '未失焦Ctrl+S必须实际调用文件保存')
    assert.equal(saved.success, true, JSON.stringify(saved))
    const reopened = await evaluate(`(async()=>{const api=window.electronAPI;const file=await api.readFile(${JSON.stringify(saved.path)});if(!file.成功)throw new Error(file.错误);const ext=${JSON.stringify(saved.path)}.split('.').pop().toLowerCase();return ext==='pptx'?api.office.readPptx(file.内容):api.office.readSeal(ext,file.内容)})()`)
    assert.equal(reopened.成功, true, JSON.stringify(reopened))
    const texts = reopened.演示文稿.幻灯片列表.flatMap(slide => slide.文本框列表.map(box => box.text.replace(/\r\n?/g, '\n')))
    assert.ok(texts.includes(draft), '真实保存文件重开后必须包含尚未失焦的最新文本：' + JSON.stringify(texts))
    return { passed: true, shortcut: 'Ctrl+S', textareaFocusedBeforeShortcut: true, blurredBeforeShortcut: false, actualSavedFileReopened: true, latestDraftPreserved: true, unicodePreserved: true, charactersVerified: '😀𠀀👩🏽‍💻é' }
  } finally {
    await evaluate(`(()=>{const probe=window.__pptEditingSaveProbe;if(probe){probe.blurInput?.removeEventListener('blur',probe.blurListener);window.electronAPI.saveToFile=probe.originalSave;delete window.__pptEditingSaveProbe}})()`)
  }
}
