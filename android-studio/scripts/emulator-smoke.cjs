const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const WebSocket = require('ws')

const adb = process.env.ANDROID_ADB || 'adb'
const packageName = 'com.sealoffice.mobile.nativeqa'
const activity = `${packageName}/com.sealoffice.mobile.MainActivity`
const run = (...args) => execFileSync(adb, args, { encoding: 'utf8', timeout: 15000 }).trim()
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function connect() {
  const pid = run('shell', 'pidof', packageName).split(/\s+/)[0]
  if (!pid) throw new Error('本机测试应用未运行')
  run('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`)
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
  const target = targets.find(item => item.url.startsWith('file:///android_asset/apps/__UNI__B52B65B/www/static/office/index.html'))
  if (!target) throw new Error('未找到原生工作台的调试页面')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  let serial = 0
  const pending = new Map()
  socket.on('message', raw => {
    const response = JSON.parse(String(raw))
    const entry = pending.get(response.id)
    if (entry) { pending.delete(response.id); response.error ? entry.reject(new Error(response.error.message)) : entry.resolve(response.result) }
  })
  const evaluate = expression => new Promise((resolve, reject) => {
    const id = ++serial
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, userGesture: true } }))
  }).then(result => {
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result?.value
  })
  return { socket, evaluate }
}

const bridgeAction = (action, extra = {}) => `(async()=>{
  const id='native-qa-'+Math.random().toString(36).slice(2);
  return await new Promise((resolve,reject)=>{
    const previous=window.sealReceiveNative;
    const events=[];
    const timer=setTimeout(()=>{window.sealReceiveNative=previous;reject(new Error('原生操作超时：${action}'))},15000);
    window.sealReceiveNative=(event)=>{
      previous?.(event);
      if(event.id!==id)return;
      events.push(event);
      if(['ready','written','end','error','cancel'].includes(event.type)){
        clearTimeout(timer);window.sealReceiveNative=previous;
        resolve({types:events.map(value=>value.type),status:events.find(value=>value.type==='headers')?.status,
          name:events.find(value=>value.type==='file-start')?.name,
          data:events.filter(value=>value.type==='chunk').map(value=>value.data||'').join(''),error:event.error||''});
      }
    };
    window.uni.webView.postMessage({data:{id,action:'${action}',token:window.sealNative.token,...${JSON.stringify(extra)}}});
  });
})()`

async function selectTestFile() {
  await pause(1200)
  run('shell', 'input', 'tap', '80', '145')
  await pause(650)
  run('shell', 'input', 'tap', '240', '830')
  await pause(650)
  run('shell', 'input', 'tap', '860', '145')
  await pause(350)
  run('shell', 'input', 'text', 'seal-native-import-qa.txt')
  run('shell', 'input', 'keyevent', '66')
  await pause(900)
  run('shell', 'input', 'tap', '285', '800')
}

async function main() {
  run('shell', 'am', 'start', '-n', activity)
  await pause(2000)
  const { socket, evaluate } = await connect()
  try {
    let loaded = false
    for (let attempt = 0; attempt < 15 && !loaded; attempt++) {
      loaded = await evaluate("Boolean(window.sealNative&&window.uni?.webView&&document.querySelectorAll('.seal-mobile-nav button').length===5&&!document.querySelector('.startup-screen'))")
      if (!loaded) await pause(1000)
    }
    if (!loaded) throw new Error('工作台或五个底部主导航未完整加载')
    if (process.argv.includes('--verify-storage')) {
      const stored = await evaluate(`(async()=>{
        const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('seal-office-mobile-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
        const key='__nativeqa_storage_probe';
        const put=db.transaction('meta','readwrite').objectStore('meta').put('本机存储可用',key);
        await new Promise((resolve,reject)=>{put.onsuccess=resolve;put.onerror=()=>reject(put.error)});
        const get=db.transaction('meta','readonly').objectStore('meta').get(key);
        const value=await new Promise((resolve,reject)=>{get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error)});
        const remove=db.transaction('meta','readwrite').objectStore('meta').delete(key);
        await new Promise((resolve,reject)=>{remove.onsuccess=resolve;remove.onerror=()=>reject(remove.error)});
        db.close();return {origin:location.protocol,value};
      })()`)
      if (stored.origin !== 'file:' || stored.value !== '本机存储可用') throw new Error(`旧版文件来源的持久存储失败：${JSON.stringify(stored)}`)
      console.log('旧版 file 来源的 IndexedDB 读写：通过')
    }
    const ping = await evaluate(bridgeAction('ping'))
    if (ping.types.at(-1) !== 'ready') throw new Error(`原生握手失败：${JSON.stringify(ping)}`)
    const clipboard = await evaluate(bridgeAction('clipboard-write', { text: '海豹办公本机测试' }))
    if (clipboard.types.at(-1) !== 'written') throw new Error(`剪贴板失败：${JSON.stringify(clipboard)}`)
    const request = await evaluate(bridgeAction('request', { url: 'https://seal.xingmasoft.com/share/', method: 'GET', headers: {} }))
    if (request.status !== 200 || request.types.at(-1) !== 'end') throw new Error(`原生联网失败：${JSON.stringify(request)}`)
    console.log('原生握手、剪贴板、匿名下载页联网：通过')
    if (process.argv.includes('--verify-import')) {
      const expected = Buffer.from('seal-native-import-qa-2026', 'utf8')
      const localPath = path.join(os.tmpdir(), 'seal-native-import-qa.txt')
      const devicePath = '/sdcard/Download/seal-native-import-qa.txt'
      fs.writeFileSync(localPath, expected)
      run('push', localPath, devicePath)
      try {
        const pendingAction = evaluate(bridgeAction('pick-files', { multiple: false }))
        await selectTestFile()
        const imported = await pendingAction
        if (imported.name !== path.basename(devicePath) ||
            Buffer.compare(Buffer.from(imported.data, 'base64'), expected) !== 0 ||
            imported.types.at(-1) !== 'end') throw new Error(`系统文件选择后读取字节失败：${JSON.stringify(imported)}`)
        console.log('系统选择器导入文件字节一致：通过')
        const htmlPending = evaluate(`(async()=>{
          const input=document.createElement('input');input.type='file';input.accept='*/*';input.hidden=true;document.body.appendChild(input);
          try{return await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(new Error('网页文件选择超时')),20000);
            input.onchange=async()=>{clearTimeout(timer);try{const file=input.files?.[0];if(!file)throw new Error('没有选中文件');resolve({name:file.name,data:Array.from(new Uint8Array(await file.arrayBuffer()))})}catch(error){reject(error)}};
            input.click();
          })}finally{input.remove()}
        })()`)
        await selectTestFile()
        const htmlImported = await htmlPending
        if (htmlImported.name !== path.basename(devicePath) ||
            Buffer.compare(Buffer.from(htmlImported.data), expected) !== 0) throw new Error(`网页文件选择后读取字节失败：${JSON.stringify(htmlImported)}`)
        console.log('编辑器网页文件选择读取字节一致：通过')
      } finally {
        fs.unlinkSync(localPath)
        run('shell', 'rm', devicePath)
      }
    }
    for (const [action, options] of [
      ['pick-files', { multiple: false }],
      ['save', { name: '本机选择器验收.txt', mime: 'text/plain', data: '5rW35pWw5Yqe5YWs' }],
    ]) {
      const pendingAction = evaluate(bridgeAction(action, options))
      let settled = false
      pendingAction.then(() => { settled = true }, () => { settled = true })
      await pause(900)
      for (let attempt = 0; attempt < 4 && !settled; attempt++) {
        run('shell', 'input', 'keyevent', '4')
        await pause(450)
      }
      const result = await pendingAction
      if (result.types.at(-1) !== 'cancel') throw new Error(`${action} 系统选择器取消回传失败：${JSON.stringify(result)}`)
    }
    console.log('系统导入与保存选择器取消回传：通过')
    for (let index = 0; index < 5; index++) {
      run('shell', 'am', 'start', '-n', activity)
      await pause(450)
      await evaluate(`document.querySelectorAll('.seal-mobile-nav button')[${index}].click();true`)
      await pause(400)
      run('shell', 'input', 'keyevent', '4')
      await pause(850)
      const activityState = run('shell', 'dumpsys', 'activity', 'activities')
      if (!/topResumedActivity=.*com\.android\.launcher3/.test(activityState)) throw new Error(`第 ${index + 1} 个主导航返回后没有到系统桌面`)
    }
    console.log('五个主导航单次返回系统桌面：通过')
  } finally {
    socket.close()
    run('forward', '--remove', 'tcp:9222')
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
