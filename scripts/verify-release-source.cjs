// Record the tested release inputs and reject any later addition, deletion or byte change.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..'), report = path.join(root, '.upgrade-private', 'v' + require('../package.json').version + '-source.json')
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
function inventory() {
  const names = []
  function walk(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (['node_modules', '.git', '.vitest', 'data', 'uploads', '__pycache__'].includes(entry.name)) continue
      if (relative === 'mobile/web' && entry.name === 'generated') continue
      const name = relative + '/' + entry.name
      assert(!entry.isSymbolicLink(), 'Release source cannot contain a symlink: ' + name)
      if (entry.isDirectory()) walk(name)
      else if (name !== 'main/integrity-manifest.json' && !/\.(?:md|log)$/.test(name)) names.push(name)
    }
  }
  for (const directory of ['main', 'renderer/src', 'renderer/public', 'mobile/web', 'mobile/native', 'mobile/pages', 'mobile/tests', 'mobile/scripts', 'server', 'scripts']) walk(directory)
  for (const name of ['package.json', 'package-lock.json', 'mobile/package.json', 'mobile/package-lock.json', 'mobile/manifest.json', 'mobile/AndroidManifest.xml', 'mobile/App.uvue', 'mobile/main.uts', 'mobile/pages.json', 'mobile/web.vite.config.mjs', 'build/electron-ubuntu.cjs', 'build/artifact-names.json', 'docs/promo/current-storyboard.json', 'AGENTS.md', '.github/workflows/ubuntu.yml', 'vitest.main.config.js', 'vite.config.js']) {
    if (fs.existsSync(path.join(root, name))) names.push(name)
  }
  return [...new Set(names)].sort().map(name => { const bytes = fs.readFileSync(path.join(root, name)); return { path: name, bytes: bytes.length, sha256: sha(bytes) } })
}
if (process.argv[2] === 'freeze') {
  const result = { version: require('../package.json').version, capturedAt: new Date().toISOString(), files: inventory() }
  fs.mkdirSync(path.dirname(report), { recursive: true }); fs.writeFileSync(report, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ version: result.version, files: result.files.length, capturedAt: result.capturedAt }))
} else if (process.argv[2] === 'check') {
  const baseline = JSON.parse(fs.readFileSync(report, 'utf8'))
  assert.deepEqual(inventory(), baseline.files, 'Source changed after the complete regression baseline')
  console.log(JSON.stringify({ passed: true, files: baseline.files.length, frozenAt: baseline.capturedAt }))
} else throw new Error('Use freeze or check')
