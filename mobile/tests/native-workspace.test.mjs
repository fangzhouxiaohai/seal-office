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
  for(const url of ['/static/office/index.html?native=1','file:///android_asset/apps/test/www/static/office/index.html?native=1'])assert.equal(native.isWorkspaceDocument(url),true)
  for(const url of ['about:blank','data:image/png;base64,AA==','file:///android_asset/apps/test/www/static/office/assets/logo.png','https://seal.xingmasoft.com/api/v1/public','https://evil.test/static/office/index.html','/static/office/index.html/extra'])assert.equal(native.isWorkspaceDocument(url),false)
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
test('安卓启动页只配置一个正方形主图标',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../manifest.json',import.meta.url),'utf8'))
  const splash=manifest['app-android'].distribute.splashScreens
  assert.equal(Object.hasOwn(splash,'brand'),false)
  for(const name of Object.values(splash.icon)){
    const png=await fs.readFile(new URL('../'+name,import.meta.url))
    assert.equal(png.readUInt32BE(16),png.readUInt32BE(20))
  }
})
