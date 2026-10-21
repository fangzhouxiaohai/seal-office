import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { archiveArtifact } from '../scripts/archive-artifact.mjs'
import { inspectHap } from '../scripts/hap-check.mjs'
import { pdfFontResources, inspectPdfFonts } from '../scripts/pdf-font-resources.mjs'

const JSZip = createRequire(import.meta.url)('jszip')
const manifest = { versionName: '2.0.0', versionCode: '20000', 'app-harmony': { distribute: { bundleName: 'com.sealoffice.mobile' } } }
const editor = Buffer.from('verified-current-editor-中文')
async function hap({ app = {}, build = {}, missing = '' } = {}) {
  const zip = new JSZip()
  zip.file('module.json', JSON.stringify({ app: { bundleName: 'com.sealoffice.mobile', versionName: '2.0.0', versionCode: 20000, debug: false, ...app }, module: { type: 'entry' } }))
  const prefix = 'resources/rawfile/apps/__UNI__B52B65B/www/static/office/'
  const entries = { 'build-info.json': JSON.stringify({ platform: 'harmony', desktopVersion: '2.0.0', ...build }), 'office.js': editor, 'index.html': '<html></html>', ...Object.fromEntries(pdfFontResources.map(name => ['fonts/' + name, Buffer.from('test-font-resource-' + name)])) }
  for (const [name, bytes] of Object.entries(entries)) if (name !== missing) zip.file(prefix + name, bytes)
  return zip.generateAsync({ type: 'nodebuffer' })
}

test('云包英文归档保留下载原件及原始二进制，同内容可重验，不同内容拒绝覆盖', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-cloud-package-'))
  try {
    for (const [platform, extension] of [['android', 'apk'], ['harmony', 'hap']]) {
      const source = path.join(directory, '云服务默认下载名.' + extension), data = Buffer.from('signed-cloud-binary-' + platform)
      await fs.writeFile(source, data)
      const report = await archiveArtifact({ platform, version: '2.0.0', source, directory: path.join(directory, 'release'), data })
      assert.equal(report.name, `seal-office-2.0.0-${platform}.${extension}`)
      assert.deepEqual(await fs.readFile(report.path), data)
      assert.deepEqual(await fs.readFile(source), data)
      assert.equal(report.originalPreserved, true)
      assert.equal(report.signedBytesUnchanged, true)
      assert.equal((await archiveArtifact({ platform, version: '2.0.0', source, directory: path.join(directory, 'release'), data })).sha256, report.sha256)
      await fs.writeFile(source, 'another-valid-release')
      await assert.rejects(archiveArtifact({ platform, version: '2.0.0', source, directory: path.join(directory, 'release') }), /拒绝覆盖/)
      assert.deepEqual(await fs.readFile(report.path), data)
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})

test('归档拒绝平台扩展名错误、校验后变化、路径版本和非普通文件目标', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-cloud-package-'))
  try {
    const source = path.join(directory, 'input.apk')
    await fs.writeFile(source, 'actual')
    const options = { platform: 'android', version: '2.0.0', source, directory: path.join(directory, 'release') }
    await assert.rejects(archiveArtifact({ ...options, platform: 'harmony' }), /扩展名/)
    await assert.rejects(archiveArtifact({ ...options, data: Buffer.from('old') }), /校验后云包已变化/)
    await assert.rejects(archiveArtifact({ ...options, version: '../2.0.0' }), /version/)
    await fs.mkdir(options.directory)
    // A directory at the target must also be rejected without touching its data.
    const target = path.join(options.directory, 'seal-office-2.0.0-android.apk')
    await fs.mkdir(target)
    await fs.writeFile(path.join(target, 'keep.txt'), 'keep')
    await assert.rejects(archiveArtifact(options), /拒绝覆盖/)
    assert.equal(await fs.readFile(path.join(target, 'keep.txt'), 'utf8'), 'keep')
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})

test('实际读取HAP ZIP样本核对身份、版本和当前内置资源，不虚构签名或真机结果', async () => {
  const result = await inspectHap(await hap(), manifest, editor)
  assert.equal(result.crcPassed, true)
  assert.equal(result.matchesCurrentSourceBuild, true)
  assert.equal(result.versionCode, '20000')
  assert.equal(result.signatureVerified, false)
  assert.equal(result.deviceVerified, false)
  assert.deepEqual(result.embeddedPdfFonts.map(item => item.name), pdfFontResources)
  for (const options of [{ app: { bundleName: 'other.app' } }, { app: { versionCode: 19999 } }, { app: { debug: true } }, { app: { debug: null } }, { build: { platform: 'android' } }, { missing: 'fonts/NotoSansSC.ttf' }]) await assert.rejects(inspectHap(await hap(options), manifest, editor))
  for (const name of pdfFontResources) await assert.rejects(inspectHap(await hap({ missing: 'fonts/' + name }), manifest, editor), /字体或许可证缺失/)
  await assert.rejects(inspectHap(await hap(), manifest, Buffer.from('stale-editor')), /当前鸿蒙构建资源/)
  const sourceZip = new JSZip(); sourceZip.file('manifest.json', '{}')
  await assert.rejects(inspectHap(await sourceZip.generateAsync({ type: 'nodebuffer' }), manifest, editor), /module.json/)
})

test('APK/HAP 共用双字体与双许可证校验，缺少或空资源均拒绝，读取不改变压缩包', async () => {
  const prefix = 'assets/apps/__UNI__test/www/static/office/', zip = new JSZip()
  for (const name of pdfFontResources) zip.file(prefix + 'fonts/' + name, 'resource-' + name)
  const bytes = await zip.generateAsync({ type: 'nodebuffer' }), copy = Buffer.from(bytes)
  const report = await inspectPdfFonts(await JSZip.loadAsync(bytes), prefix)
  assert.equal(report.length, 4)
  assert.ok(report.every(item => item.bytes > 0 && /^[a-f0-9]{64}$/.test(item.sha256)))
  assert.deepEqual(bytes, copy)
  zip.file(prefix + 'fonts/NotoSerifCJKsc-Regular.otf', '')
  await assert.rejects(inspectPdfFonts(zip, prefix), /字体或许可证为空.*NotoSerif/)
})
