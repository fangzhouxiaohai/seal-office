import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { archiveArtifact } from './archive-artifact.mjs'
import { inspectPdfFonts } from './pdf-font-resources.mjs'

const require = createRequire(import.meta.url), JSZip = require('jszip')
const project = fileURLToPath(new URL('../..', import.meta.url))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

export async function inspectHap(data, manifest, currentEditor) {
  const zip = await JSZip.loadAsync(data, { checkCRC32: true })
  const configuration = zip.file('module.json')
  if (!configuration) throw new Error('HAP 缺少编译后的 module.json；不接受源码快照、APP 或 HAR 冒充 HAP')
  const { app, module } = JSON.parse(await configuration.async('string'))
  if (app?.bundleName !== manifest['app-harmony']?.distribute?.bundleName || app?.versionName !== manifest.versionName || String(app?.versionCode) !== manifest.versionCode) throw new Error('HAP 应用身份或版本与当前项目不一致')
  if (app.debug !== false || module?.type !== 'entry') throw new Error('请提供明确关闭调试的 entry HAP')
  const builds = Object.keys(zip.files).filter(name => /(?:^|\/)static\/office\/build-info\.json$/.test(name))
  if (builds.length !== 1) throw new Error('HAP 内未找到唯一内置编辑器资源')
  const prefix = builds[0].slice(0, -'build-info.json'.length)
  const build = JSON.parse(await zip.file(builds[0]).async('string'))
  const editor = zip.file(prefix + 'office.js')
  if (build.platform !== 'harmony' || build.desktopVersion !== manifest.versionName || !editor || !zip.file(prefix + 'index.html')) throw new Error('HAP 内置编辑器的平台、版本或必要资源不完整')
  const embeddedPdfFonts = await inspectPdfFonts(zip, prefix)
  const editorHash = digest(await editor.async('nodebuffer'))
  if (!currentEditor || editorHash !== digest(currentEditor)) throw new Error('HAP 不包含当前鸿蒙构建资源，请重新云打包')
  return { bundleName: app.bundleName, version: app.versionName, versionCode: String(app.versionCode), build, embeddedEditorSha256: editorHash, embeddedPdfFonts, matchesCurrentSourceBuild: true, crcPassed: true, signatureVerified: false, deviceVerified: false }
}

export async function main(args = process.argv.slice(2)) {
  const [source] = args
  if (!source || source.startsWith('--')) throw new Error('用法：npm --prefix mobile run check:hap -- <HAP路径> [--archive <归档目录>]')
  const manifest = JSON.parse(await fs.readFile(path.join(project, 'mobile/manifest.json'), 'utf8'))
  const snapshot = path.join(project, 'mobile/unpackage/cloud-ready', manifest.versionName, 'harmony/static/office')
  const build = JSON.parse(await fs.readFile(path.join(snapshot, 'build-info.json'), 'utf8'))
  if (build.platform !== 'harmony' || build.desktopVersion !== manifest.versionName) throw new Error('请先保留当前版本鸿蒙云打包快照')
  const filename = path.resolve(source)
  if (path.extname(filename).toLowerCase() !== '.hap') throw new Error('请提供 HAP 文件')
  const data = await fs.readFile(filename)
  const report = { inspectedAt: new Date().toISOString(), originalPath: filename, sha256: digest(data), bytes: data.length, ...await inspectHap(data, manifest, await fs.readFile(path.join(snapshot, 'office.js'))) }
  const archiveIndex = args.indexOf('--archive')
  if (archiveIndex >= 0) {
    const directory = args[archiveIndex + 1]
    if (!directory || directory.startsWith('--')) throw new Error('--archive 需要归档目录')
    report.archive = await archiveArtifact({ platform: 'harmony', version: manifest.versionName, source: filename, directory, data })
  }
  const output = path.join(project, '.upgrade-private/mobile-verification/harmony-hap.json')
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  console.log('此检查覆盖身份、版本、ZIP CRC 与内置编辑器，不替代鸿蒙签名工具及设备安装验收。')
  return report
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
