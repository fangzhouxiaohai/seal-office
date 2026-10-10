const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')

// 运行实际生产编辑器和 Canvas，不以 jsdom 的空图片或模型模拟裁剪结果。
module.exports = async function imageActions({ win, evaluate, output, checks }) {
  const wait = () => new Promise(resolve => setTimeout(resolve, 180))
  const clickTool = async name => { await evaluate(`Array.from(document.querySelectorAll('.seal-image-toolbar button')).find(button=>button.textContent===${JSON.stringify(name)}).click()`); await wait() }
  const clickModal = async name => { await evaluate(`Array.from(document.querySelectorAll('.ant-modal-wrap')).filter(wrap=>getComputedStyle(wrap).display!=='none').flatMap(wrap=>Array.from(wrap.querySelectorAll('button'))).find(button=>button.textContent.replace(/\s/g,'')===${JSON.stringify(name.replace(/\s/g,''))}).click()`); await wait() }
  const closeModal = async () => { await evaluate(`Array.from(document.querySelectorAll('.ant-modal-wrap')).find(wrap=>getComputedStyle(wrap).display!=='none').querySelector('.ant-modal-close').click()`); await wait() }
  const imageState = () => evaluate(`(()=>{const image=document.querySelector('.wps-editor-canvas__content img');return {width:image.width,height:image.height,transform:image.style.transform,src:image.src}})()`)
  const gesture = async (handle, dx, dy, cancel = false) => {
    await evaluate(`(()=>{const target=document.querySelector(${JSON.stringify(handle)}),rect=target.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:7,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:y}));document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerId:7,pointerType:'touch',clientX:x+${dx},clientY:y+${dy}}));document.dispatchEvent(new PointerEvent(${JSON.stringify(cancel?'pointercancel':'pointerup')},{bubbles:true,pointerId:7,pointerType:'touch',clientX:x+${dx},clientY:y+${dy}}))})()`)
    await wait()
  }
  win.setContentSize(1280, 900); await wait()
  await evaluate(`document.querySelector('.wps-editor-canvas__paper').style.zoom='1';window.dispatchEvent(new Event('resize'))`); await wait()
  await evaluate(`(()=>{const editor=document.querySelector('.wps-editor-canvas__content'),canvas=document.createElement('canvas');canvas.width=200;canvas.height=100;const context=canvas.getContext('2d');context.fillStyle='#ff0000';context.fillRect(0,0,100,100);context.fillStyle='#0000ff';context.fillRect(100,0,100,100);const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);editor.focus();window.getSelection().removeAllRanges();window.getSelection().addRange(range);document.execCommand('insertHTML',false,'<p><img alt="图片验收" width="200" height="100" style="width:200px;height:100px" src="'+canvas.toDataURL('image/png')+'"></p><p>图片目标正文</p>');editor.dispatchEvent(new Event('input',{bubbles:true}));editor.querySelector('img').click()})()`)
  await wait()
  assert.equal(await evaluate(`document.querySelectorAll('.seal-image-handle').length`), 8)
  assert.ok(await evaluate(`!!document.querySelector('.seal-image-rotate')`))
  await gesture('.seal-image-handle--se', 40, 20)
  let state = await imageState(); assert.equal(state.width, 240); assert.equal(state.height, 120)
  await gesture('.seal-image-handle--e', 30, 0, true)
  assert.equal((await imageState()).width, 240, '系统取消手势恢复尺寸')
  await evaluate(`(()=>{const image=document.querySelector('.wps-editor-canvas__content img'),rect=image.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,target=document.querySelector('.seal-image-rotate');target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,isPrimary:true,pointerId:8,clientX:cx,clientY:cy-90}));document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:8,clientX:cx+90,clientY:cy}));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:8,clientX:cx+90,clientY:cy}))})()`)
  await wait(); assert.match((await imageState()).transform, /rotate\(90deg\)/)
  await clickTool('布局选项'); await clickModal('居中')
  assert.equal(await evaluate(`document.querySelector('.wps-editor-canvas__content img').closest('p').style.textAlign`), 'center')
  await clickTool('图片预览'); assert.ok(await evaluate(`document.querySelector('.seal-image-preview img').naturalWidth===200`)); await closeModal()
  await clickTool('更多功能')
  await evaluate(`Array.from(document.querySelectorAll('.seal-image-menu .ant-dropdown-menu-item')).find(item=>item.textContent==='水平翻转').click()`); await wait()
  assert.match((await imageState()).transform, /scale\(-1, 1\)/)
  await new Promise(resolve=>setTimeout(resolve,300))
  await win.capturePage().then(image=>fs.writeFileSync(path.join(output,'pc-word-image.png'),image.toPNG()))
  await clickTool('图片裁剪')
  await evaluate(`(()=>{const input=document.querySelector('[aria-label="裁剪左侧百分比"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'50');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await wait(); await clickModal('裁剪')
  for(let attempt=0;attempt<80;attempt++) { if((await imageState()).width===120)break; await new Promise(resolve=>setTimeout(resolve,50)) }
  state = await imageState(); assert.equal(state.width,120); assert.equal(state.height,120)
  const pixels = await evaluate(`(async()=>{const image=new Image();image.src=document.querySelector('.wps-editor-canvas__content img').src;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);return {width:canvas.width,height:canvas.height,center:Array.from(context.getImageData(50,50,1,1).data)}})()`)
  assert.equal(pixels.width,100); assert.equal(pixels.height,100); assert.deepEqual(pixels.center,[0,0,255,255], '左边红色裁去后真实像素应为蓝色')
  // 文档的撤销/重做必须恢复媒体字节，不只恢复 CSS 尺寸。
  await evaluate(`(()=>{const editor=document.querySelector('.wps-editor-canvas__content');editor.focus();editor.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))})()`); await wait()
  assert.equal((await imageState()).width,240)
  await evaluate(`(()=>{const editor=document.querySelector('.wps-editor-canvas__content');editor.focus();editor.dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true}))})()`); await wait()
  assert.equal((await imageState()).width,120)
  await evaluate(`document.querySelector('.wps-editor-canvas__content img').click()`); await wait()
  await evaluate(`(()=>{const editor=document.querySelector('.wps-editor-canvas__content'),image=editor.querySelector('img'),target=Array.from(editor.querySelectorAll('p')).find(p=>p.textContent.includes('图片目标正文')),range=document.createRange();range.selectNodeContents(target);const rect=range.getBoundingClientRect(),from=image.getBoundingClientRect();image.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,isPrimary:true,pointerId:10,pointerType:'touch',clientX:from.left+10,clientY:from.top+10}));document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:10,pointerType:'touch',clientX:rect.left+5,clientY:rect.top+rect.height/2}));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:10,pointerType:'touch',clientX:rect.left+5,clientY:rect.top+rect.height/2}))})()`); await wait()
  assert.equal(await evaluate(`document.querySelector('.wps-editor-canvas__content img').closest('p').textContent`),'图片目标正文', '拖动需移动到正文目标，不复制图片或删除文字')
  await clickTool('更多功能'); await evaluate(`Array.from(document.querySelectorAll('.seal-image-menu .ant-dropdown-menu-item')).find(item=>item.textContent==='删除图片').click()`); await wait()
  assert.equal(await evaluate(`document.querySelectorAll('.wps-editor-canvas__content img').length`),0)
  await evaluate(`(()=>{const editor=document.querySelector('.wps-editor-canvas__content');editor.focus();editor.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))})()`); await new Promise(resolve=>setTimeout(resolve,450))
  await evaluate(`document.querySelector('.wps-editor-canvas__content img').click()`); await wait()
  assert.equal((await imageState()).src,state.src, '删除后撤销恢复裁剪媒体')
  // 在 CSS zoom 为 150% 时，选框的实际尺寸必须跟随图片显示尺寸。
  await evaluate(`document.querySelector('.wps-editor-canvas__paper').style.zoom='1.5';window.dispatchEvent(new Event('resize'))`); await wait()
  const frame = await evaluate(`(()=>{const frame=document.querySelector('.seal-image-frame');return {width:parseFloat(frame.style.width),height:parseFloat(frame.style.height)}})()`)
  assert.equal(frame.width,180); assert.equal(frame.height,180)
  await evaluate(`document.querySelector('.wps-editor-canvas__paper').style.zoom='1';window.dispatchEvent(new Event('resize'))`); await wait()
  win.setContentSize(390,844); await wait()
  const toolbar = await evaluate(`(()=>{const rect=document.querySelector('.seal-image-toolbar').getBoundingClientRect();return {left:rect.left,right:rect.right,bottom:rect.bottom,width:innerWidth,height:innerHeight}})()`)
  assert.ok(toolbar.left>=0 && toolbar.right<=toolbar.width && toolbar.bottom<=toolbar.height-90, '移动端图片工具应在屏幕内且避开底部导航')
  await win.capturePage().then(image=>fs.writeFileSync(path.join(output,'mobile-word-image.png'),image.toPNG()))
  await evaluate(`window.dispatchEvent(new Event('seal-persist-workspace'));true`); await new Promise(resolve=>setTimeout(resolve,500))
  await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload()})
  for(let attempt=0;attempt<100;attempt++){if(await evaluate(`!!document.querySelector('.wps-editor-canvas__content img')`))break;await new Promise(resolve=>setTimeout(resolve,100))}
  const restored = await imageState()
  assert.equal(restored.src,state.src); assert.equal(restored.transform,state.transform); assert.equal(restored.width,120)
  checks.push('Word 图片：八个尺寸手柄、触摸缩放与取消、手柄旋转、布局、预览、翻转、真实像素裁剪、撤销重做、正文触摸移动、删除及撤销、缩放选框与移动工具条、工作区恢复')
}
