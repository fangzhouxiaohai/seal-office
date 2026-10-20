const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')

/** Actual production Web/WebView UI + codecs. Creates only disposable local files. */
module.exports = async function revisionActions({ win, evaluate, output, checks = [] }) {
  const pause = () => new Promise(resolve => setTimeout(resolve, 120))
  const until = async (code, label) => { for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(code)) return; await pause() } throw new Error(label) }
  const filename = await evaluate(`(async()=>{const api=window.electronAPI,stamp={作者:'来源审阅人',时间:'2026-10-18T09:30:00Z'};const model={段落:[{类型:'段落',级别:0,对齐:'左',列表:'无',文字:[{文本:'正文起点'},{文本:'来源插入',修订:[{类型:'ins',标识:'10',...stamp}]},{文本:'来源删除',修订:[{类型:'del',标识:'11',...stamp}]}]},{类型:'段落',级别:0,对齐:'左',列表:'无',文字:[{文本:'格式历史',加粗:true,格式修订:{标识:'12',...stamp,原来格式:{加粗:false,倾斜:true}}}]}],未覆盖:[]};const written=await api.office.writeDocx(model);if(!written.成功)throw new Error(written.错误);const read=await api.office.readDocx(written.数据);if(!read.成功||!read.html.includes('data-seal-docx-package'))throw new Error(read.错误||'源包历史没有保留');const file=await api.showSaveDialog('修订生产验收.docx','word');const saved=await api.saveToFile(file,written.数据,'二进制');if(!saved.成功)throw new Error(saved.错误);return file})()`)
  await evaluate(`window.electronAPI.showOpenDialog=async()=>${JSON.stringify(filename)};(async()=>{document.querySelector('.seal-mobile-nav [aria-label="返回首页"]').click();for(let i=0;i<100&&!document.querySelector('.seal-mobile-homebar [aria-label="导入文件"]');i++)await new Promise(resolve=>setTimeout(resolve,20));document.querySelector('.seal-mobile-homebar [aria-label="导入文件"]').click()})()`)
  await until(`document.querySelector('.wps-editor-canvas__content')?.textContent.includes('来源插入')`, '修订夹具必须实际打开')
  if (await evaluate(`document.querySelector('.wps-editor-canvas__content').contentEditable==='false'`)) await evaluate(`Array.from(document.querySelectorAll('.seal-reading-toolbar button')).find(button=>button.textContent==='编辑').click()`)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='查看修订历史')`),false,'不应出现常驻的历史按钮行')
  await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(node=>node.textContent==='审阅').click()`);await pause()
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='修订历史').click()`)
  await until(`!!document.querySelector('[aria-label="修订历史"]')`, '修订列表必须出现')
  assert.equal(await evaluate(`document.querySelectorAll('.seal-revisions li').length`), 3, '显示插入、删除和原生格式三条历史')
  assert.match(await evaluate(`document.querySelector('.seal-revisions').textContent`), /来源审阅人/)
  const selectView = async (label) => { await evaluate(`document.querySelector('.seal-revisions .ant-select-selector').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))`); await pause(); await evaluate(`Array.from(document.querySelectorAll('.ant-select-item-option')).find(node=>node.textContent===${JSON.stringify(label)}).click()`); await pause() }
  const original = await evaluate(`document.querySelector('.wps-editor-canvas__content').innerHTML`)
  await selectView('最终正文'); assert.equal(await evaluate(`getComputedStyle(document.querySelector('.wps-editor-canvas__content .wps-delete')).display`), 'none')
  await selectView('原始正文'); assert.equal(await evaluate(`getComputedStyle(document.querySelector('.wps-editor-canvas__content .wps-insert')).display`), 'none'); assert.equal(await evaluate(`document.querySelector('.wps-editor-canvas__content').contentEditable`), 'false')
  await selectView('全部标记'); assert.equal(await evaluate(`document.querySelector('.wps-editor-canvas__content').innerHTML`), original, '显示方式不能修改历史数据')
  await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(node=>node.textContent==='审阅').click()`); await pause(); await evaluate(`document.querySelector('[aria-label="修订"]').click()`)
  await evaluate(`(()=>{const input=document.querySelector('[aria-label="审阅作者"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'手机审阅甲');input.dispatchEvent(new Event('input',{bubbles:true}))})()`); await pause()
  await evaluate(`(()=>{const root=document.querySelector('.wps-editor-canvas__content'),text=document.createTreeWalker(root.querySelector('p'),NodeFilter.SHOW_TEXT).nextNode(),range=document.createRange();root.focus();range.setStart(text,2);range.collapse(true);window.getSelection().removeAllRanges();window.getSelection().addRange(range);root.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'手机新修订'}))})()`)
  await until(`Array.from(document.querySelectorAll('.wps-editor-canvas__content [data-seal-revision-author]')).some(node=>node.dataset.sealRevisionAuthor==='手机审阅甲'&&node.textContent==='手机新修订')`, '真实输入必须记录作者与修订')
  await evaluate(`(()=>{const root=document.querySelector('.wps-editor-canvas__content'),text=document.createTreeWalker(root.querySelector('p'),NodeFilter.SHOW_TEXT).nextNode(),range=document.createRange();range.setStart(text,0);range.setEnd(text,1);window.getSelection().removeAllRanges();window.getSelection().addRange(range);const data=new DataTransfer();data.setData('text/html','<em>移动粘贴</em>');data.setData('text/plain','移动粘贴');root.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))})()`)
  assert.equal(await evaluate(`document.querySelector('.wps-editor-canvas__content .wps-insert em')?.textContent`), '移动粘贴', '实际粘贴保留新内容格式')
  assert.equal(await evaluate(`document.querySelector('.wps-editor-canvas__content .wps-delete')?.textContent`), '正', '替换原文保留为删除历史')
  await evaluate(`document.querySelector('.wps-editor-canvas__content').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',ctrlKey:true,bubbles:true,cancelable:true}))`)
  assert.equal(await evaluate(`!!window.getSelection().anchorNode?.parentElement?.closest('[hidden],[data-seal-docx-package]')`), false, 'CtrlHome不得定位隐藏源包')
  for (const width of [360, 390, 820]) {
    win.setContentSize(width, 844); await pause()
    const layout = await evaluate(`(()=>{const panel=document.querySelector('.seal-revisions').getBoundingClientRect(),editor=document.querySelector('.wps-editor-canvas__content').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,panel:{left:panel.left,right:panel.right,height:panel.height},editor:{height:editor.height,top:editor.top}}})()`)
    assert.ok(layout.scroll <= layout.width + 1 && layout.panel.left >= 0 && layout.panel.right <= layout.width + 1, '修订面板窄屏不能产生整页横向溢出：' + JSON.stringify(layout))
    assert.ok(layout.editor.height >= 50 && layout.editor.top < 844, '修订面板不得挤掉正文：' + JSON.stringify(layout))
  }
  win.setContentSize(390, 844); await pause()
  if (output) await win.capturePage().then(image => fs.writeFileSync(path.join(output, 'mobile-word-revisions.png'), image.toPNG()))
  await evaluate(`window.__revisionQaOriginalWrite=window.electronAPI.office.writeDocx;window.__revisionQaWritten=null;window.electronAPI.office.writeDocx=async model=>{const result=await window.__revisionQaOriginalWrite(model);window.__revisionQaWritten=result;return result};document.querySelector('.wps-editor-canvas__content').dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}))`)
  try {
    await until(`!!window.__revisionQaWritten`, '真实CtrlS必须调用DOCX保存')
    const saved = await evaluate(`(async()=>{const result=window.__revisionQaWritten;if(!result.成功)throw new Error(result.错误);const reopened=await window.electronAPI.office.readDocx(result.数据);if(!reopened.成功)throw new Error(reopened.错误);return reopened.html})()`)
    assert.match(saved, /手机新修订/); assert.match(saved, /data-seal-revision-author="手机审阅甲"/); assert.match(saved, /data-seal-revision-catalog=/)
  } finally { await evaluate(`window.electronAPI.office.writeDocx=window.__revisionQaOriginalWrite;delete window.__revisionQaOriginalWrite;delete window.__revisionQaWritten;true`) }
  checks.push('修订：生产WebView真实插删/格式历史、作者时间、markup/final/original无损切换、CtrlHome排除源包、360/390/820px面板及实际DOCX保存重开')
}
