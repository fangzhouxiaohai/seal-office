import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const project = path.dirname(directory)
const executable = process.platform === 'win32'
  ? path.join(project, 'node_modules/electron/dist/electron.exe')
  : path.join(project, 'node_modules/.bin/electron')
const child = spawn(executable, [path.join(directory, 'capture-android-store-screenshots.cjs')], {
  cwd: project,
  windowsHide: true,
  shell: false,
  stdio: 'inherit',
})
const timeout = setTimeout(() => {
  console.error('Android 商店截图生成超过 60 秒，已停止')
  child.kill()
  process.exitCode = 1
}, 60000)
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { clearTimeout(timeout); process.exitCode = code ?? 1 })
