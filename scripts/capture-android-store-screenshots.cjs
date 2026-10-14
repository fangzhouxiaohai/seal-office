const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')

const project = path.resolve(__dirname, '..')
const webRoot = path.join(project, 'mobile/static/office')
const output = path.join(project, 'build/store-assets/android-v1.9.15')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' }

console.log('准备生成 Android 商店截图…')

const wait = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds))

async function capture(serverUrl, name, setup) {
  const win = new BrowserWindow({
    show: false,
    width: 390,
    height: 844,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition: `store-screenshot-${process.pid}-${name}`,
    },
  })
  const evaluate = (source) => win.webContents.executeJavaScript(source, true)
  try {
    await win.loadURL(serverUrl)
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (await evaluate(`!!document.querySelector('.wps-app')`)) break
      await wait(100)
    }
    if (!await evaluate(`!!document.querySelector('.wps-app')`)) throw new Error(`${name} 页面启动失败`)
    await setup(evaluate)
    await wait(500)
    const width = await evaluate('document.documentElement.scrollWidth')
    if (width > 391) throw new Error(`${name} 横向溢出：${width}px`)
    const image = await win.capturePage()
    fs.writeFileSync(path.join(output, name), image.toPNG())
  } finally {
    win.destroy()
  }
}

const profile = path.join(project, '.upgrade-private', `store-screenshot-profile-${process.pid}`)
fs.mkdirSync(profile, { recursive: true })
app.setPath('userData', profile)
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
const keepAlive = setInterval(() => {}, 1000)
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  const server = http.createServer((request, response) => {
    const filename = path.resolve(webRoot, '.' + decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/\/$/, '/index.html'))
    if (!filename.startsWith(webRoot + path.sep)) { response.writeHead(403); response.end(); return }
    const stream = fs.createReadStream(filename)
    stream.on('error', () => { if (!response.headersSent) response.writeHead(404); response.end() })
    response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' })
    stream.pipe(response)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const serverUrl = `http://127.0.0.1:${address.port}/`
  try {
    await capture(serverUrl, '01-home.png', async evaluate => {
      await evaluate(`document.querySelector('[aria-label="全部功能"]').click()`)
    })
    await capture(serverUrl, '02-word.png', async evaluate => {
      await evaluate(`document.querySelector('[aria-label="全部功能"]').click()`)
      await wait(250)
      await evaluate(`document.querySelector('[data-document-type="word"]').click()`)
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (await evaluate(`!!document.querySelector('.wps-editor-canvas__content')`)) break
        await wait(50)
      }
      await evaluate(`(()=>{const editor=document.querySelector('.wps-editor-canvas__content');editor.innerHTML='<h1>移动办公，从海豹办公开始</h1><p>创建、编辑和导出文字文档，支持中文与常用排版。</p><p>文件保存在本机，按需分享。</p>';editor.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    })
    await capture(serverUrl, '03-spreadsheet.png', async evaluate => {
      await evaluate(`document.querySelector('[aria-label="全部功能"]').click()`)
      await wait(250)
      await evaluate(`document.querySelector('[data-document-type="table"]').click()`)
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (await evaluate(`!!document.querySelector('[aria-label="公式栏"]')`)) break
        await wait(50)
      }
      await evaluate(`(()=>{const input=document.querySelector('[aria-label="公式栏"]');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'项目进度');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()`)
    })
    await capture(serverUrl, '04-presentation.png', async evaluate => {
      await evaluate(`document.querySelector('[aria-label="全部功能"]').click()`)
      await wait(250)
      await evaluate(`document.querySelector('[data-document-type="ppt"]').click()`)
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (await evaluate(`!!document.querySelector('.wps-ppt-canvas')`)) break
        await wait(50)
      }
    })
    console.log(`Android 商店截图已生成：${output}`)
  } finally {
    await new Promise(resolve => server.close(resolve))
    clearInterval(keepAlive)
    app.quit()
  }
}).catch(error => { clearInterval(keepAlive); console.error(error); app.exit(1) })
