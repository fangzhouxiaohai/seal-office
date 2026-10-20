// Static package inspection complements Windows runtime QA; it cannot run Linux.
const fs = require('fs')
const path = require('path')
const assert = require('assert/strict')
const { createHash } = require('crypto')
const asar = require('@electron/asar')
const root = path.resolve(__dirname, '..')
const version = require('../package.json').version
const hash = value => createHash('sha256').update(value).digest('hex')
const expectedManifest = JSON.parse(fs.readFileSync(path.join(root, 'main/integrity-manifest.json'), 'utf8'))
const report = { version, mode: 'static-package-inspection', packages: [], limitations: ['Linux installation and UI execution are not established by static checks.'] }
for (const [platform, archive] of [
  ['windows', path.join(root, 'release', `v${version}`, 'win-unpacked/resources/app.asar')],
  ['linux', path.join(root, 'release', `v${version}`, 'linux-unpacked/resources/app.asar')],
]) {
  const names = asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''))
  const read = name => asar.extractFile(archive, path.normalize(name))
  assert.equal(JSON.parse(read('package.json')).version, version, `${platform} version`)
  for (const name of ['main/office/ooxmlNamespaces.js', 'main/office/xlsxFormulas.js', 'main/office/xlsxNamespaces.js', 'main/office/xlsxMetadata.js', 'main/office/xlsxFunctionNames.js', 'main/office/docxSource.js', 'main/office/docxRevisions.js', 'main/cloud/collaboration.js', 'main/cloud/realtime.js', 'node_modules/ssf/ssf.js', 'node_modules/@formulajs/formulajs/package.json', 'node_modules/yjs/package.json', 'dist/licenses/ssf-LICENSE.txt', 'dist/licenses/formulajs-LICENSE.txt', 'dist/licenses/yjs-LICENSE.txt', 'dist/licenses/lib0-LICENSE.txt', 'dist/licenses/isomorphic.js-LICENSE.txt']) assert(names.includes(name), `${platform} missing ${name}`)
  assert(!names.some(name => /^main\/.*\.(?:test|spec)\.js$/.test(name)), 'backend tests are excluded')
  assert(!names.some(name => /^main\/.*\/__fixtures__\//.test(name)), 'synthetic test fixtures are excluded')
  assert(!names.some(name => /(?:^|\/)(?:command-resources\.zip|resource-inventory\.json|wps\.exe|etcore\.dll|wpscore\.dll|wppcore\.dll)$/.test(name)), 'WPS analysis resources are excluded')
  const manifest = JSON.parse(read('main/integrity-manifest.json'))
  assert.deepEqual(manifest, expectedManifest, `${platform} contains the final workspace build`)
  for (const entry of manifest.文件) {
    const bytes = read(entry.路径)
    assert.equal(bytes.length, entry.字节数, entry.路径)
    assert.equal(hash(bytes), entry.校验值, entry.路径)
    assert.equal(hash(fs.readFileSync(path.join(root, entry.路径))), entry.校验值, `${platform} final source: ${entry.路径}`)
  }
  report.packages.push({ platform, archive: path.relative(root, archive), appAsarSha256: hash(fs.readFileSync(archive)), checkedIntegrityFiles: manifest.文件.length, matchesFinalWorkspaceBuild: true, fileCount: names.length, passed: true })
}
const output = path.join(root, 'docs/verification', `v${version}`, 'desktop-artifacts.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
