import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { findHBuilder } from './hbuilder.mjs'
const project = fileURLToPath(new URL('..', import.meta.url)), installation = path.dirname(findHBuilder())
const sourceIndex = process.argv.indexOf('--source')
if (sourceIndex >= 0 && (!process.argv[sourceIndex + 1] || process.argv[sourceIndex + 1].startsWith('--'))) throw new Error('--source 需要云打包源码目录')
const source = sourceIndex >= 0 ? path.resolve(process.argv[sourceIndex + 1]) : project
const plugins = path.join(installation, 'plugins'), compiler = path.join(plugins, 'uniapp-cli-vite/node_modules/@dcloudio/vite-plugin-uni/bin/uni.js')
await fs.access(compiler)
await fs.access(path.join(source, 'static/office/index.html')).catch(() => { throw new Error('请先运行对应平台的 build 命令，准备内置编辑器资源') })
const platform = process.argv.includes('--harmony') ? 'harmony' : 'android'
const build = JSON.parse(await fs.readFile(path.join(source, 'static/office/build-info.json'), 'utf8'))
const manifest = JSON.parse(await fs.readFile(path.join(source, 'manifest.json'), 'utf8'))
if (build.platform !== platform || build.desktopVersion !== manifest.versionName) throw new Error('原生检查的源码平台或版本与目标不一致')
const output = path.join(project, 'unpackage/native-check', platform)
const child = spawn(process.execPath, [compiler, 'build', '-p', 'app-' + platform], {
  cwd: path.join(plugins, 'uniapp-cli-vite'), windowsHide: true, shell: false,
  env: { ...process.env, UNI_INPUT_DIR: source, UNI_OUTPUT_DIR: output, UNI_HBUILDERX_PLUGINS: plugins, UNI_APP_X: 'true', UNI_APP_PLATFORM: platform, UNI_UTS_PLATFORM: 'app-' + platform, VITE_ROOT_DIR: source },
  stdio: ['ignore', 'pipe', 'pipe']
})
let diagnostics = ''
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { diagnostics += chunk; process.stdout.write(chunk) })
await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(platform + ' 原生编译失败'))) })
if (/\bERROR\b|Build failed|error TS|编译失败/i.test(diagnostics)) throw new Error('编译器报告错误，请检查上方诊断')
if (platform === 'android') await fs.access(path.join(output, '.uniappx/android/src/pages/workspace/workspace.kt'))
await fs.access(path.join(output, 'static/office/office.js'))
console.log(`${platform} UTS 页面及安装包内静态资源检查通过。此检查不生成或上传正式安装包。`)
