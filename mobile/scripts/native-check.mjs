import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { findHBuilder } from './hbuilder.mjs'
const project = fileURLToPath(new URL('..', import.meta.url)), installation = path.dirname(findHBuilder())
const plugins = path.join(installation, 'plugins'), compiler = path.join(plugins, 'uniapp-cli-vite/node_modules/@dcloudio/vite-plugin-uni/bin/uni.js')
await fs.access(compiler)
await fs.access(path.join(project, 'static/office/index.html')).catch(() => { throw new Error('请先运行 npm run mobile:build，准备安卓内置资源') })
const output = path.join(project, 'unpackage/native-check/android')
const child = spawn(process.execPath, [compiler, 'build', '-p', 'app-android'], {
  cwd: path.join(plugins, 'uniapp-cli-vite'), windowsHide: true, shell: false,
  env: { ...process.env, UNI_INPUT_DIR: project, UNI_OUTPUT_DIR: output, UNI_HBUILDERX_PLUGINS: plugins, UNI_APP_X: 'true', UNI_APP_PLATFORM: 'android', UNI_UTS_PLATFORM: 'app-android', VITE_ROOT_DIR: project },
  stdio: ['ignore', 'pipe', 'pipe']
})
let diagnostics = ''
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { diagnostics += chunk; process.stdout.write(chunk) })
await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('安卓原生编译失败'))) })
if (/\bERROR\b|Build failed|error TS|编译失败/i.test(diagnostics)) throw new Error('编译器报告错误，请检查上方诊断')
await fs.access(path.join(output, '.uniappx/android/src/pages/workspace/workspace.kt'))
await fs.access(path.join(output, 'static/office/office.js'))
console.log('安卓 UTS 页面及安装包内静态资源检查通过。已生成 Kotlin 源码，此检查不生成 APK，也不提交云打包。')
