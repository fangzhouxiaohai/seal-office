import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { artifactName } = createRequire(import.meta.url)('../../scripts/artifact-names.cjs')

const project = fileURLToPath(new URL('..', import.meta.url))
const platform = process.argv[2]
assert.ok(['android', 'harmony'].includes(platform), '请指定 android 或 harmony')
const manifest = JSON.parse(await fs.readFile(path.join(project, 'manifest.json'), 'utf8'))
const build = JSON.parse(await fs.readFile(path.join(project, 'static/office/build-info.json'), 'utf8'))
assert.equal(build.platform, platform, '请先构建对应平台的编辑器资源')
assert.equal(build.desktopVersion, manifest.versionName, '资源版本与云打包版本必须一致')
assert.match(manifest.versionName, /^\d+\.\d+\.\d+$/)
const base = path.resolve(project, 'unpackage/cloud-ready')
const target = path.resolve(base, manifest.versionName, platform)
assert.ok(target.startsWith(base + path.sep), '快照目录必须在 cloud-ready 内')
// 每个发行版本保留一次确定快照；拒绝将旧文件静默混入新版。
await fs.mkdir(target, { recursive: false }).catch(async error => {
  if (error.code === 'ENOENT') { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.mkdir(target); return }
  throw error
})
for (const entry of ['App.uvue', 'main.uts', 'pages.json', 'manifest.json', 'AndroidManifest.xml', 'package.json', 'pages', 'native', 'nativeResources', 'harmony-configs', 'static']) {
  await fs.cp(path.join(project, entry), path.join(target, entry), { recursive: true })
}
const files = []
async function inventory(directory, prefix = '') {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = path.join(prefix, entry.name)
    if (entry.isDirectory()) await inventory(path.join(directory, entry.name), name)
    else {
      const bytes = await fs.readFile(path.join(directory, entry.name))
      files.push({ path: name.replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
    }
  }
}
await inventory(target)
const report = { version: manifest.versionName, versionCode: manifest.versionCode, platform, createdAt: new Date().toISOString(), generatedNativePackage: false, expectedArchiveName: artifactName(platform, manifest.versionName), files }
await fs.writeFile(path.join(target, 'snapshot-info.json'), JSON.stringify(report, null, 2) + '\n')
await fs.writeFile(path.join(target, '云打包说明.txt'), `海豹办公 ${manifest.versionName} / ${manifest.versionCode}，目标平台：${platform}。\n使用 HBuilderX 打开此目录，沿用原项目的应用身份和签名，手动提交对应平台的云打包。此目录已包含内置编辑器资源，尚未生成 APK 或 HAP。\n云服务返回文件名可能不同，下载后回原仓库运行 check:${platform === 'android' ? 'apk' : 'hap'} -- <下载路径> --archive <归档目录>，归档名为 ${report.expectedArchiveName}；不改应用名、应用身份或签名。鸿蒙签名和设备安装另行验证。\n需要更新源码时请回到原项目 ${project} 构建并重新制作快照；本快照不包含开发依赖。\n`)
console.log(JSON.stringify({ platform, version: report.version, versionCode: report.versionCode, project: target, files: files.length }, null, 2))
