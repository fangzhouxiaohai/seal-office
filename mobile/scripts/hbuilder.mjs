import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
const candidates = ['D:/HBuilderX/cli.exe', 'C:/HBuilderX/cli.exe', 'E:/HBuilderX/cli.exe']
export function findHBuilder(config = {}) {
  const supplied = process.env.HBUILDERX_PATH || config.hbuilderx
  const values = supplied ? [supplied] : candidates
  for (const value of values) {
    const executable = /cli(?:\.exe)?$/i.test(value) ? value : path.join(value, process.platform === 'win32' ? 'cli.exe' : 'cli')
    if (fs.existsSync(executable)) return path.resolve(executable)
  }
  throw new Error('未找到 HBuilderX，请设置 HBUILDERX_PATH，或在 pack.config.json 中填写 hbuilderx')
}
export function runHBuilder(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: path.dirname(executable), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk.toString(); process.stdout.write(chunk) })
    child.stderr.on('data', (chunk) => { output += chunk.toString(); process.stderr.write(chunk) })
    child.on('error', reject)
    child.on('exit', (code) => { if (code !== 0 || /未检测到已打开|未登录|打包失败|发行失败|编译失败|Error:/i.test(output)) reject(new Error('HBuilderX 未完成命令，请查看上面的诊断；必要时在 HBuilderX 中重新打开项目')); else resolve(output) })
  })
}
