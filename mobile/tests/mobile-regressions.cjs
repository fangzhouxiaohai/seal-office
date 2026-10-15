// Exercise the real packaged IIFE and browser-side IPC, not mocked desktop APIs.
const { app, BrowserWindow, nativeImage } = require('electron')
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const root = path.resolve(__dirname, '../..')
const output = path.join(root, '.upgrade-private/mobile-verification/market-login-splash')
app.disableHardwareAcceleration()
app.setPath('userData', path.join(output, 'profile-' + process.pid))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  const win = new BrowserWindow({ show: false, width: 390, height: 844,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  const checks = [], failures = []
  const evaluate = async code => {
    const result = await win.webContents.executeJavaScript(`(async()=>{try{return {value:await (0,eval)(${JSON.stringify(code)})}}catch(error){return {error:String(error.stack||error)}}})()`, true)
    if (result.error) throw new Error(result.error)
    return result.value
  }
  const until = async code => {
    for (let i=0;i<100;i++) { if (await evaluate(code)) return; await wait(100) }
    throw new Error('Timed out: ' + code)
  }
  const check = async (name, task) => {
    try { await task(); checks.push(name); console.log('PASS ' + name) }
    catch (error) { failures.push({name,error:error.message}); console.error('FAIL '+name+': '+error.message) }
  }
  try {
    await win.loadFile(path.join(root, 'mobile/static/office/index.html'))
    await until("!!document.querySelector('.wps-app')")
    await check('file:// 登录 Logo 实际解码、固定正方形尺寸与离线资源路径', async () => {
      await evaluate(`document.querySelector('[aria-label="未登录，点击登录"]').click()`)
      await until("!!document.querySelector('.seal-login__brand img')")
      const image = await evaluate(`(async()=>{const image=document.querySelector('.seal-login__brand img');let error='';try{await image.decode()}catch(e){error=String(e)}const rect=image.getBoundingClientRect();return {src:image.currentSrc,loaded:image.complete&&image.naturalWidth>0,error,width:rect.width,height:rect.height}})()`)
      await wait(300)
      await win.capturePage().then(image=>fs.writeFileSync(path.join(output,'mobile-login.png'),image.toPNG()))
      assert.ok(image.loaded, JSON.stringify(image))
      assert.equal(image.width,64); assert.equal(image.height,64)
      assert.ok(image.src.startsWith('file:') || image.src.startsWith('data:'),image.src)
    })
    await evaluate(`document.querySelector('.seal-login-modal .ant-modal-close')?.click()`)
    await wait(250)
    await check('生产桥接真实恢复、读取、导出和释放演示图片资源', async () => {
      const result = await evaluate(`(async()=>{const api=window.electronAPI.presentationResources;const canvas=document.createElement('canvas');canvas.width=canvas.height=8;canvas.getContext('2d').fillRect(0,0,8,8);const data=canvas.toDataURL('image/png').split(',')[1];const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');const restored=await api.restore([{标识:id,类型:'image/png',数据:data}]);const read=await api.read(id);const synced=await api.sync('real-mobile-regression',[id]);const exported=await api.export([id]);const released=await api.release('real-mobile-regression');return {restored,read,synced,exported,released,data}})()`)
      for(const key of ['restored','read','synced','exported','released']) assert.equal(result[key].成功,true,key+': '+JSON.stringify(result[key]))
      assert.equal(result.read.数据,result.data)
      assert.equal(result.exported.条目.length,1)
    })
    await check('手机市场逐一打开八个模板、九页预览、实际配图与使用编辑副本', async () => {
      await evaluate(`document.querySelector('[aria-label="全部功能"]').click()`)
      await until("!!document.querySelector('[data-nav-key=\"market\"]')")
      await evaluate(`document.querySelector('[data-nav-key="market"]').click()`)
      await until("document.querySelectorAll('.seal-market-cover').length===8")
      for(let index=0;index<8;index++) {
        await evaluate(`document.querySelectorAll('.seal-market-cover')[${index}].click()`)
        await until("(!!document.querySelector('.seal-market-preview')&&getComputedStyle(document.querySelector('.seal-market-preview').closest('.ant-modal-wrap')).display!=='none')||document.body.textContent.includes('演示操作未完成')")
        assert.equal(await evaluate("document.body.textContent.includes('演示操作未完成')"),false,'模板 '+index+'：'+await evaluate("document.querySelector('.ant-modal-body')?.textContent"))
        assert.equal(await evaluate("document.querySelector('.seal-market-preview').children.length"),9)
        await until("Array.from(document.querySelectorAll('.seal-market-preview img')).every(i=>i.complete&&i.naturalWidth>0)")
        assert.ok(await evaluate("document.querySelectorAll('.seal-market-preview img').length>0"))
        if(index===7) {
          await wait(300)
          await win.capturePage().then(image=>fs.writeFileSync(path.join(output,'mobile-template-preview.png'),image.toPNG()))
          await evaluate(`Array.from(document.querySelectorAll('.ant-modal button')).find(b=>b.textContent.includes('使用并编辑副本')).click()`)
          await until("!!document.querySelector('.wps-ppt-canvas')")
          assert.equal(await evaluate("document.querySelectorAll('.wps-ppt-thumb').length"),9)
        } else {
          await evaluate(`document.querySelector('.seal-market-preview').closest('.ant-modal').querySelector('.ant-modal-close').click()`)
          await until("!document.querySelector('.seal-market-preview')||getComputedStyle(document.querySelector('.seal-market-preview').closest('.ant-modal-wrap')).display==='none'")
        }
      }
      await wait(300)
      await win.capturePage().then(image=>fs.writeFileSync(path.join(output,'mobile-template-editor.png'),image.toPNG()))
    })
    await check('启动图三种密度均为专用留白资源，Logo 约 96dp 且无底部品牌图', async () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(root,'mobile/manifest.json'),'utf8'))
      const splash = manifest['app-android'].distribute.splashScreens
      assert.equal(Object.hasOwn(splash,'brand'),false)
      for(const [density,size] of [['xhdpi',576],['xxhdpi',864],['xxxhdpi',1152]]) {
        const filename=splash.icon[density]
        assert.notEqual(filename,'static/icon.png','启动图不能直接复用铺满画布的应用图标')
        const image=nativeImage.createFromPath(path.join(root,'mobile',filename))
        assert.deepEqual(image.getSize(),{width:size,height:size})
        const bytes=image.toBitmap(),stride=size*4
        let left=size,top=size,right=0,bottom=0
        for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(bytes[y*stride+x*4+3]>127){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
        const dp=(right-left+1)/size*288
        assert.ok(dp>=90&&dp<=98,JSON.stringify({density,dp,left,right}))
        assert.ok(Math.abs((right-left)-(bottom-top))<=1,'Logo 保持正方形')
        assert.ok(Math.abs((left+right+1)/2-size/2)<=1,'水平居中')
        assert.ok(Math.abs((top+bottom+1)/2-size/2)<=1,'垂直居中')
      }
    })
  } catch(error) { failures.push({name:'test setup',error:error.stack}) }
  finally {
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:!failures.length,checks,failures,scheme:'file',width:390},null,2))
    console.log(JSON.stringify({passed:!failures.length,checks,failures,output},null,2))
    win.destroy(); app.exit(failures.length?1:0)
  }
})
