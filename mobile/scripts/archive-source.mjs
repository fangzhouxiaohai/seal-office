import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const { artifactName } = createRequire(import.meta.url)('../../scripts/artifact-names.cjs')
const root = fileURLToPath(new URL('../..', import.meta.url))
const platform = process.argv[2]
assert.ok(['android', 'harmony'].includes(platform), 'Specify android or harmony')
function label(option) {
  const index = process.argv.indexOf(option)
  if (index < 0) return ''
  const value = process.argv[index + 1]
  assert.match(value || '', /^[a-z][a-z0-9-]{0,31}$/, 'Invalid archive label')
  return value
}
const snapshotLabel = label('--snapshot-label'), outputLabel = label('--output-label')
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json')))
const source = path.join(root, 'mobile/unpackage/cloud-ready', version, platform + (snapshotLabel ? '-' + snapshotLabel : ''))
const read = name => fs.readFile(path.join(source, name))
const snapshot = JSON.parse(await read('snapshot-info.json'))
const manifest = JSON.parse(await read('manifest.json'))
const build = JSON.parse(await read('static/office/build-info.json'))
assert.equal(snapshot.platform, platform)
assert.equal(build.platform, platform, 'Wrong platform editor resources')
for (const actual of [snapshot.version, manifest.versionName, build.desktopVersion]) assert.equal(actual, version)
const [major, minor, patch] = version.split('.').map(Number)
assert.equal(manifest.versionCode, String(major * 10000 + minor * 100 + patch))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const zip = new JSZip(), files = []
async function walk(dir, prefix = '') {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'Links are not allowed in source archives')
    const name = prefix + entry.name
    if (entry.isDirectory()) { await walk(path.join(dir, entry.name), name + '/'); continue }
    assert.ok(!/(?:^|\/)(?:node_modules|unpackage|\.git|\.env)(?:\/|$)|\.(?:keystore|jks|p12|pfx|apk|hap|app)$/i.test(name), 'Unexpected archive content: ' + name)
    const bytes = await fs.readFile(path.join(dir, entry.name))
    files.push({ path: name, bytes: bytes.length, sha256: sha(bytes) })
    zip.file(name, bytes)
  }
}
await walk(source)
for (const expected of snapshot.files) assert.deepEqual(files.find(file => file.path === expected.path), expected, 'Frozen snapshot changed: ' + expected.path)
for (const name of ['NotoSansSC.ttf', 'NotoSerifCJKsc-Regular.otf']) {
  assert.equal(sha(await read('static/office/fonts/' + name)), sha(await fs.readFile(path.join(root, 'mobile/web/public/fonts', name))), 'Complete font must be preserved')
}
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
const nativeOffice = path.join(root, 'mobile/unpackage/native-check', platform, 'static/office')
const nativeBuild = JSON.parse(await fs.readFile(path.join(nativeOffice, 'build-info.json')))
assert.equal(nativeBuild.platform, platform, 'Native check used the wrong platform build')
assert.equal(nativeBuild.desktopVersion, version)
assert.equal(sha(await fs.readFile(path.join(nativeOffice, 'office.js'))), sha(await read('static/office/office.js')), 'Native check must cover the frozen editor bytes')
const editorText = (await read('static/office/office.js')).toString('utf8')
const imagesRoot = path.join(root, 'mobile/assets/template-images')
const images = JSON.parse(await fs.readFile(path.join(imagesRoot, 'manifest.json')))
for (const image of images) {
  const payload = await fs.readFile(path.join(imagesRoot, image.output))
  assert.equal(sha(payload), image.sha256)
  assert.ok(editorText.includes(image.sha256) && editorText.includes(payload.toString('base64')), 'Editor must contain matching template metadata and image bytes: ' + image.output)
}
const limit = 60_000_000 // Decimal MB; stricter than 60 MiB. Applies to expanded files AND ZIP.
if (platform === 'android') assert.ok(totalBytes <= limit, `Android source exceeds 60 MB: ${totalBytes}`)
const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
if (platform === 'android') assert.ok(bytes.length <= limit, 'Android ZIP exceeds 60 MB')
const check = await JSZip.loadAsync(bytes, { checkCRC32: true })
for (const file of files) assert.equal(sha(await check.file(file.path).async('nodebuffer')), file.sha256, 'ZIP payload mismatch: ' + file.path)
const output = path.join(root, 'release', 'v' + version, outputLabel)
await fs.mkdir(output, { recursive: true })
const name = artifactName(platform + 'Source', version)
await fs.writeFile(path.join(output, name), bytes, { flag: 'wx' })
const report = { version, versionCode: manifest.versionCode, platform, archive: name, archiveBytes: bytes.length, sourceBytes: totalBytes, sizeLimitBytes: platform === 'android' ? limit : null, sha256: sha(bytes), editorSha256: files.find(f => f.path === 'static/office/office.js').sha256, crcAndAllPayloadHashesVerified: true, completeFontsUnchanged: true, generatedNativePackage: false, files }
await fs.writeFile(path.join(output, name + '.verification.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ ...report, files: files.length }, null, 2))
