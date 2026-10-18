import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {transform} from 'esbuild'

// Exercise Android's compiled branch with a queued UI dispatcher. A network reply
// must wait for that dispatcher, including when it originates on a worker thread.
const uts=await fs.readFile(new URL('../native/workspace.uts',import.meta.url),'utf8')
const androidSource=uts.replace(/\/\/ #ifndef APP-ANDROID[\s\S]*?\/\/ #endif/g,'')
const result=await transform(androidSource,{loader:'ts',format:'esm'})
const native=await import('data:text/javascript;base64,'+Buffer.from(result.code).toString('base64'))
test('只有本地入口页错误可移除工作台，图片、接口和弹窗子页错误保留工作台',()=>{
  for(const url of ['/static/office/index.html?native=1','file:///android_asset/apps/test/www/static/office/index.html?native=1','resource://rawfile/apps/test/www/static/office/index.html?native=1#home'])assert.equal(native.isWorkspaceDocument(url),true)
  for(const url of ['about:blank','data:image/png;base64,AA==','file:///android_asset/apps/test/www/static/office/assets/logo.png','https://seal.xingmasoft.com/api/v1/public','https://evil.test/static/office/index.html','/static/office/index.html/extra'])assert.equal(native.isWorkspaceDocument(url),false)
})
test('鸿蒙打印权限仅用于系统打印，不请求高敏感粘贴板读取权限',async()=>{
  const config=JSON.parse(await fs.readFile(new URL('../harmony-configs/entry/src/main/module.json5',import.meta.url),'utf8'))
  const permissions=config.module.requestPermissions.map(item=>item.name)
  assert.ok(permissions.includes('ohos.permission.PRINT'))
  assert.equal(permissions.includes('ohos.permission.READ_PASTEBOARD'),false)
  const workspace=await fs.readFile(new URL('../pages/workspace/workspace.uvue',import.meta.url),'utf8')
  assert.match(workspace,/return true/)
  assert.match(workspace,/action == 'back-root'/)
  assert.match(workspace,/seal-native-probe/)
  assert.match(workspace,/uni\.createWebViewContext\('seal-office', this\)/)
})
test('后台回调经 UI 队列执行，宿主已经退出时不会调用 WebView',()=>{
  const previous=globalThis.UTSAndroid,queue=[]
  let alive=true,calls=0
  try{
    globalThis.UTSAndroid={getUniActivity:()=>alive?{runOnUiThread:task=>queue.push(task)}:null}
    native.onUIThread(()=>calls++)
    assert.equal(calls,0)
    queue.shift()()
    assert.equal(calls,1)
    alive=false
    native.onUIThread(()=>calls++)
    assert.equal(queue.length,0)
    assert.equal(calls,1)
  }finally{globalThis.UTSAndroid=previous}
})
test('宿主加载错误先探测存活工作台，原生返回必须等待网页层根页面确认',async()=>{
  const page=await fs.readFile(new URL('../pages/workspace/workspace.uvue',import.meta.url),'utf8')
  const source=page.match(/<script lang="uts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'')
  const compiled=await transform(source,{loader:'ts',format:'esm'})
  const options=(await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'))).default
  const previous={uni:globalThis.uni,onUIThread:globalThis.onUIThread,isWorkspaceDocument:globalThis.isWorkspaceDocument,setTimeout:globalThis.setTimeout}
  const scripts=[],timers=[];let backgrounds=0
  try{
    globalThis.uni={createWebViewContext:(id,owner)=>{assert.equal(id,'seal-office');assert.ok(owner);return {evalJS:script=>scripts.push(script)}}}
    globalThis.onUIThread=task=>task();globalThis.isWorkspaceDocument=native.isWorkspaceDocument
    globalThis.setTimeout=task=>{timers.push(task);return 1}
    const host=Object.assign(options.data(),options.methods,{moveToBackground:()=>backgrounds++})
    host.workspaceReady=true
    host.onError({detail:{fullUrl:'file:///app/static/office/assets/image.png',src:'',errCode:-6}})
    assert.equal(timers.length,0);assert.equal(host.errorText,'')
    host.onError({detail:{fullUrl:'file:///app/static/office/index.html?native=1',src:'',errCode:-6}})
    assert.match(scripts.at(-1),/seal-native-probe/)
    const message=action=>({getString:key=>key==='action'?action:key==='token'?host.token:null})
    host.onMessage({detail:{data:[message('healthy')]}});timers.shift()();assert.equal(host.errorText,'')
    assert.equal(options.onBackPress.call(host),true);assert.equal(backgrounds,0);assert.match(scripts.at(-1),/seal-native-back/)
    host.onMessage({detail:{data:[message('back-root')]}});assert.equal(backgrounds,1)
    host.onError({detail:{fullUrl:'resource://rawfile/app/static/office/index.html',src:'',errCode:-6}})
    timers.shift()();assert.match(host.errorText,/本地工作台加载失败/)
  }finally{Object.assign(globalThis,previous)}
})
test('安卓启动页只配置一个正方形主图标',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../manifest.json',import.meta.url),'utf8'))
  const splash=manifest['app-android'].distribute.splashScreens
  assert.equal(Object.hasOwn(splash,'brand'),false)
  for(const [density,size] of [['xhdpi',576],['xxhdpi',864],['xxxhdpi',1152]]){
    const name=splash.icon[density]
    assert.equal(name,`static/splash/android/icon-${density}.png`)
    const png=await fs.readFile(new URL('../'+name,import.meta.url))
    assert.equal(png.readUInt32BE(16),size)
    assert.equal(png.readUInt32BE(20),size)
  }
})
