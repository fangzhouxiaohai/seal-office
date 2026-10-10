import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const project = fileURLToPath(new URL('../..', import.meta.url))
const executable = process.platform === 'win32' ? path.join(project, 'node_modules/electron/dist/electron.exe') : path.join(project, 'node_modules/.bin/electron')
const child = spawn(executable, [path.join(project, 'mobile/tests/browser-smoke.cjs'), ...process.argv.slice(2)], { cwd: project, windowsHide: true, shell: false, stdio: 'inherit' })
const timeout = setTimeout(() => { console.error('浏览器验收超过 120 秒，已停止测试窗口'); child.kill(); process.exitCode = 1 }, 120000)
child.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code) => { clearTimeout(timeout); process.exitCode = code ?? 1 })
