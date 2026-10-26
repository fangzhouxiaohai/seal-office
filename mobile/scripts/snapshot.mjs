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
const revision = process.argv[3] || ''
assert.ok(!revision || /^[a-z][a-z0-9-]{0,31}$/.test(revision), '快照修订标签必须为安全英文名')
const manifest = JSON.parse(await fs.readFile(path.join(project, 'manifest.json'), 'utf8'))
const build = JSON.parse(await fs.readFile(path.join(project, 'static/office/build-info.json'), 'utf8'))
assert.equal(build.platform, platform, '请先构建对应平台的编辑器资源')
assert.equal(build.desktopVersion, manifest.versionName, '资源版本与云打包版本必须一致')
assert.match(manifest.versionName, /^\d+\.\d+\.\d+$/)
const base = path.resolve(project, 'unpackage/cloud-ready')
const target = path.resolve(base, manifest.versionName, platform + (revision ? '-' + revision : ''))
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
console.log(JSON.stringify({ platform, version: report.version, versionCode: report.versionCode, project: target, files: files.length }, null, 2))
