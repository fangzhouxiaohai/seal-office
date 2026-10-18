// Keep immutable chunks requested by tabs opened before a Web release switch.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function retainHashedAssets({ root, previous, directory, maxBytes = 1024 * 1024 * 1024, maxFiles = 2000 }) {
  const boundary = fs.realpathSync(root) + path.sep
  const admit = value => { const result = fs.realpathSync(value); if (!result.startsWith(boundary)) throw Error('Web release outside retention root'); return result }
  const source = admit(previous), target = admit(directory)
  if (source === target) throw Error('Retention requires two distinct releases')
  const sourceAssets = path.join(source, 'assets'), targetAssets = path.join(target, 'assets'), pending = []
  if (!fs.existsSync(sourceAssets)) return { passed: true, retained: [], reused: 0, bytes: 0 }
  if (fs.lstatSync(sourceAssets).isSymbolicLink() || fs.existsSync(targetAssets) && fs.lstatSync(targetAssets).isSymbolicLink()) throw Error('Asset symlinks are not admitted')
  let total = 0, reused = 0
  // Vite uses flat, content-hashed JS/CSS names. Fixed-name HTML, configuration,
  // native bridges and source maps must never replace the new release's files.
  for (const entry of fs.readdirSync(sourceAssets, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw Error('Asset symlinks are not admitted')
    if (!entry.isFile() || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*-[a-f0-9]{8,64}\.(?:m?js|css)$/.test(entry.name)) continue
    const file = path.join(sourceAssets, entry.name), destination = path.join(targetAssets, entry.name), sha256 = digest(file), bytes = fs.statSync(file).size
    if (fs.existsSync(destination)) { if (fs.lstatSync(destination).isSymbolicLink() || !fs.statSync(destination).isFile() || digest(destination) !== sha256) throw Error('Existing hashed asset has different content'); reused++; continue }
    total += bytes; pending.push({ file, destination, path: 'assets/' + entry.name, bytes, sha256 })
    if (total > maxBytes || pending.length > maxFiles) throw Error('Retained asset budget exceeded')
  }
  fs.mkdirSync(targetAssets, { recursive: true })
  for (const item of pending) {
    const temporary = path.join(targetAssets, '.retain-' + crypto.randomUUID())
    try {
      fs.copyFileSync(item.file, temporary, fs.constants.COPYFILE_EXCL)
      if (digest(temporary) !== item.sha256) throw Error('Previous asset changed while being retained')
      fs.chmodSync(temporary, 0o644)
      try { fs.linkSync(temporary, item.destination) } catch (error) { if (error.code !== 'EEXIST' || fs.lstatSync(item.destination).isSymbolicLink() || digest(item.destination) !== item.sha256) throw error }
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
  }
  return { passed: true, previous: source, directory: target, retained: pending.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), reused, bytes: total }
}
module.exports = { retainHashedAssets }
