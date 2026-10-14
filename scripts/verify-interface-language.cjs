// Runtime smoke test for the persisted Chinese/English UI switch.
// With no argument this exercises the development build (and requires Vite on
// http://127.0.0.1:5172). Pass a packaged executable path to exercise the exact
// files that will be shipped instead.
const fs = require('fs')
const os = require('os')
const path = require('path')
const net = require('net')
const { spawn, spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const electron = path.join(root, 'node_modules/electron/dist/electron.exe')
const packagedExecutable = process.argv[2] ? path.resolve(process.argv[2]) : ''
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-language-'))
const screenshot = path.join(root, 'docs/screenshots/v1.9.15/interface-language-en.png')
const newDialogScreenshot = path.join(root, 'docs/screenshots/v1.9.15/interface-language-new-en.png')
const settingsScreenshot = path.join(root, 'docs/screenshots/v1.9.15/interface-language-settings-en.png')
const ribbonScreenshotDirectory = path.join(root, 'docs/screenshots/v1.9.15/interface-language-word-ribbon-en')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

async function connect(port) {
  let target
  for (let index = 0; index < 150; index += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
    } catch {}
    if (target) break
    await pause(100)
  }
  if (!target) throw new Error('The Electron renderer did not expose a debugging target')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let serial = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    const task = pending.get(message.id)
    if (!task) return
    pending.delete(message.id)
    clearTimeout(task.timer)
    if (message.error) task.reject(new Error(message.error.message))
    else task.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 20000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Renderer evaluation failed')
    return result.result.value
  }
  return { socket, send, evaluate }
}

async function waitFor(evaluate, expression, message) {
  for (let index = 0; index < 100; index += 1) {
    if (await evaluate(expression)) return
    await pause(100)
  }
  throw new Error(message)
}

async function main() {
  if (packagedExecutable && !fs.existsSync(packagedExecutable)) {
    throw new Error(`Packaged executable was not found: ${packagedExecutable}`)
  }
  fs.mkdirSync(path.dirname(screenshot), { recursive: true })
  fs.mkdirSync(ribbonScreenshotDirectory, { recursive: true })
  const port = await freePort()
  const app = spawn(packagedExecutable || electron, [
    ...(packagedExecutable ? [] : ['.']),
    `--user-data-dir=${profile}`,
    '--skip-default-app-check',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
  ], {
    cwd: root,
    windowsHide: true,
    stdio: 'ignore',
  })
  let channel
  try {
    channel = await connect(port)
    await waitFor(channel.evaluate, `document.querySelector('button[aria-label="切换界面语言"]') !== null`, 'Chinese language switch was not rendered')
    await channel.evaluate(`document.querySelector('button[aria-label="切换界面语言"]').click()`)
    await waitFor(channel.evaluate, `Array.from(document.querySelectorAll('.ant-dropdown-menu-item')).some(item => item.textContent.trim() === 'English')`, 'Language menu did not open')
    await channel.evaluate(`Array.from(document.querySelectorAll('.ant-dropdown-menu-item')).find(item => item.textContent.trim() === 'English').click()`)
    await waitFor(channel.evaluate, `document.documentElement.lang === 'en-US' && localStorage.getItem('seal-language') === 'en-US'`, 'English preference was not applied or persisted')
    const state = await channel.evaluate(`({
      language: document.documentElement.lang,
      stored: localStorage.getItem('seal-language'),
      switchLabel: document.querySelector('.wps-language-switcher')?.textContent.trim(),
      page: document.querySelector('.wps-titlebar__page')?.textContent.trim(),
      recent: document.querySelector('.wps-home__title')?.textContent.trim(),
      body: document.body.innerText.slice(0, 1200),
    })`)
    if (state.switchLabel !== 'EN' || state.page !== 'Home' || state.recent !== 'Recent') {
      throw new Error(`English shell did not render correctly: ${JSON.stringify(state)}`)
    }
    await channel.send('Page.enable')
    const captured = await channel.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(screenshot, Buffer.from(captured.data, 'base64'))

    // Close the language menu, then exercise two important dynamically mounted surfaces.
    await channel.evaluate(`document.querySelector('button[aria-label="Switch interface language"]').click()`)
    await channel.evaluate(`Array.from(document.querySelectorAll('button')).find(item => item.textContent.trim() === 'New').click()`)
    await waitFor(channel.evaluate, `document.querySelector('.ant-modal-content') !== null`, 'New dialog did not open')
    const newDialogBody = await channel.evaluate(`document.querySelector('.ant-modal-content').innerText`)
    const newDialogCaptured = await channel.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(newDialogScreenshot, Buffer.from(newDialogCaptured.data, 'base64'))
    await channel.evaluate(`document.querySelector('.wps-newdoc-option').click()`)
    await waitFor(channel.evaluate, `document.querySelector('.wps-ribbon-tabs') !== null`, 'Document editor did not open')
    const ribbonAudit = []
    const ribbonTabs = await channel.evaluate(`Array.from(document.querySelectorAll('.wps-ribbon-tabs [role="tab"]')).map(item => item.textContent.trim())`)
    for (const tab of ribbonTabs) {
      await channel.evaluate(`Array.from(document.querySelectorAll('.wps-ribbon-tabs [role="tab"]')).find(item => item.textContent.trim() === ${JSON.stringify(tab)}).click()`)
      await pause(150)
      const result = await channel.evaluate(`({
        tab: ${JSON.stringify(tab)},
        text: document.querySelector('.wps-ribbon-panel')?.innerText || '',
        chinese: (document.querySelector('.wps-ribbon-panel')?.innerText || '').match(/[\\u3400-\\u9fff]+/gu) || [],
      })`)
      if (result.chinese.length > 0) throw new Error(`English Word ribbon still contains Chinese text: ${JSON.stringify(result)}`)
      ribbonAudit.push(result)
      const ribbonCaptured = await channel.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      fs.writeFileSync(path.join(ribbonScreenshotDirectory, `${ribbonAudit.length}-${tab.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}.png`), Buffer.from(ribbonCaptured.data, 'base64'))
    }
    const editorBody = await channel.evaluate(`document.body.innerText.slice(0, 4000)`)
    await channel.evaluate(`document.querySelector('.wps-global-tabs__home').click()`)
    await waitFor(channel.evaluate, `document.querySelector('.wps-titlebar__page')?.textContent.trim() === 'Home'`, 'Home did not reopen after editor smoke test')

    await channel.evaluate(`document.querySelector('button[aria-label="Settings"]').click()`)
    await waitFor(channel.evaluate, `Array.from(document.querySelectorAll('.ant-dropdown-menu-item')).some(item => item.textContent.trim() === 'Settings')`, 'Settings menu did not open')
    await channel.evaluate(`Array.from(document.querySelectorAll('.ant-dropdown-menu-item')).find(item => item.textContent.trim() === 'Settings').click()`)
    await waitFor(channel.evaluate, `document.querySelector('.wps-titlebar__page')?.textContent.trim() === 'Settings'`, 'Settings page did not open')
    const settingsBody = await channel.evaluate(`document.body.innerText.slice(0, 4000)`)
    const settingsCaptured = await channel.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(settingsScreenshot, Buffer.from(settingsCaptured.data, 'base64'))

    await channel.evaluate(`document.querySelector('button[aria-label="Switch interface language"]').click()`)
    await waitFor(channel.evaluate, `Array.from(document.querySelectorAll('.ant-dropdown-menu-item')).some(item => ['简体中文', 'Simplified Chinese'].includes(item.textContent.trim()))`, 'Chinese option was not shown')
    await channel.evaluate(`Array.from(document.querySelectorAll('.ant-dropdown-menu-item')).find(item => ['简体中文', 'Simplified Chinese'].includes(item.textContent.trim())).click()`)
    await waitFor(channel.evaluate, `document.documentElement.lang === 'zh-CN' && localStorage.getItem('seal-language') === 'zh-CN'`, 'Chinese preference was not restored')
    const restored = await channel.evaluate(`({ page: document.querySelector('.wps-titlebar__page')?.textContent.trim() })`)
    if (restored.page !== '设置') throw new Error(`Chinese shell was not restored: ${JSON.stringify(restored)}`)
    console.log(JSON.stringify({ english: state, newDialogBody, ribbonAudit, editorBody, settingsBody, chinese: restored, screenshot, newDialogScreenshot, settingsScreenshot, ribbonScreenshotDirectory }, null, 2))
  } finally {
    if (channel) channel.socket.close()
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } else {
      app.kill()
    }
    await pause(300)
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        fs.rmSync(profile, { recursive: true, force: true })
        break
      } catch (error) {
        if (attempt === 9) console.warn(`Could not remove temporary profile ${profile}: ${error.message}`)
        else await pause(200)
      }
    }
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
