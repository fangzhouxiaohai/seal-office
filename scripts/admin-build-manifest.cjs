// 后台构建记录同时绑定源码和产物，防止复用上一版本的入口资源。
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function files(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = prefix + entry.name
    return entry.isDirectory() ? files(path.join(directory, entry.name), name + '/') : [name]
  }).sort()
}
function sourceHashes(root) {
  const names = ['server/admin/build.cjs', 'scripts/admin-build-manifest.cjs', 'build/icon.png', ...files(path.join(root, 'server/admin/overlay')).map(name => 'server/admin/overlay/' + name)]
  return Object.fromEntries(names.map(name => [name, digest(path.join(root, name))]))
}
function writeManifest(root, directory) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  const outputs = files(directory).filter(name => name !== 'build-manifest.json')
  const manifest = { version, sources: sourceHashes(root), files: Object.fromEntries(outputs.map(name => [name, digest(path.join(directory, name))])) }
  fs.writeFileSync(path.join(directory, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}
function verifyManifest(root, directory) {
  const fail = () => { throw new Error('后台构建记录与当前源文件或产物不一致，请执行 node server/admin/build.cjs 重新构建') }
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(path.join(directory, 'build-manifest.json'), 'utf8')) } catch { fail() }
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  if (manifest.version !== version || JSON.stringify(manifest.sources) !== JSON.stringify(sourceHashes(root)) || !manifest.files?.['index.html']) fail()
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (name.includes('..') || name.includes('\\') || path.isAbsolute(name) || !fs.existsSync(path.join(directory, name)) || digest(path.join(directory, name)) !== hash) fail()
  }
  return manifest
}
module.exports = { writeManifest, verifyManifest }
