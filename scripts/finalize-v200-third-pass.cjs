// Finalize only this round's complete successful runs and freshly verified artifacts.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..'), output = path.join(root, 'docs/verification/v2.0.0-third-pass')
const resolve = name => path.join(root, name)
const read = name => JSON.parse(fs.readFileSync(resolve(name), 'utf8').replace(/^\uFEFF/, ''))
function sha(file) { const h = crypto.createHash('sha256'), fd = fs.openSync(resolve(file), 'r'), buffer = Buffer.alloc(1024 * 1024); try { for (let n; (n = fs.readSync(fd, buffer)) > 0;) h.update(buffer.subarray(0, n)) } finally { fs.closeSync(fd) }; return h.digest('hex') }
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n')
const record = name => ({ path: name, bytes: fs.statSync(resolve(name)).size, sha256: sha(name) })
const freeze = read('.upgrade-private/v200-third-source.json')
assert.equal(require('../package.json').version, '2.0.0')
for (const file of freeze.files) assert.equal(sha(file.path), file.sha256, 'Frozen source changed: ' + file.path)
function regression(name) {
  const file = '.upgrade-private/v200-third-' + name + '.json', result = read(file)
  assert.equal(result.success, true, name + ' must pass in one whole run')
  assert.equal(result.numFailedTests, 0); assert.equal(result.numFailedTestSuites, 0); assert.equal(result.numPendingTests, 0)
  assert(result.testResults.length > 0 && result.testResults.every(item => item.status === 'passed'))
  assert(result.startTime >= Date.parse(freeze.capturedAt))
  const report = { passed: true, oneWholeRunAllGreen: true, files: result.testResults.length, tests: result.numPassedTests, skipped: result.numPendingTests, source: record(file) }
  save(name + '-regression.json', report); return report
}
function nodeTests(name, file) {
  const log = fs.readFileSync(resolve(file), 'utf8'), passed = log.match(/\bpass\s+(\d+)/), failed = log.match(/\bfail\s+(\d+)/)
  assert(passed && failed && Number(passed[1]) > 0 && Number(failed[1]) === 0, name + ' node:test suite')
  return { passed: true, tests: Number(passed[1]), log: record(file) }
}
fs.mkdirSync(output, { recursive: true })
const renderer = regression('renderer'), main = regression('main')
const units = {
  server: nodeTests('server', '.tmp-v200-third-server.log'), mobile: nodeTests('mobile', '.tmp-v200-third-mobile-unit.log'), packaging: nodeTests('packaging', '.tmp-v200-third-packaging.log'),
}
for (const name of ['typecheck-final', 'mobile-typecheck', 'mobile-check', 'build']) {
  const file = '.tmp-v200-third-' + name + '.log', log = fs.readFileSync(resolve(file), 'utf8')
  assert(!/error TS\d+|Build failed|failed to build/i.test(log)); assert(fs.statSync(resolve(file)).mtimeMs >= Date.parse(freeze.capturedAt))
}
assert.match(fs.readFileSync(resolve('.tmp-v200-third-deploy-unit.log'), 'utf8'), /Ran 3 tests[\s\S]*OK/)
const documents = Object.fromEntries(['desktop-artifacts', 'linux-deb', 'compatible-formats', 'packaged-codecs', 'windows-runtime', 'windows-executables', 'windows-archives', 'mobile', 'web-deployment', 'backend-deployment', 'office-pdf', 'office-pdf-visual', 'spill', 'mobile-reading', 'template-expansion', 'workspace-tools', 'diagrams'].map(name => [name, read('docs/verification/v2.0.0-third-pass/' + name + '.json')]))
const reading = documents['mobile-reading'], templates = documents['template-expansion']
assert(reading.status === 'passed' && reading.tests.production.passed && reading.tests.production.electron.results.length === 2)
for (const [name, expected] of Object.entries(reading.sourceHashes)) assert.equal(sha(name), expected, 'Reading source differs from tested source: ' + name)
assert(templates.passed && templates.pages.length === 108 && templates.roundtrips.length === 12 && templates.errors.length === 0 && templates.overflowing.length === 0 && templates.missingImages.length === 0)
assert.equal(templates.unexpectedDialogsChecked, true, 'Template production QA must reject unexpected dialogs')
for (const name of ['workspace-tools', 'diagrams']) assert(documents[name].status === 'passed' && documents[name].errors.length === 0 && documents[name].blocked.length === 0)
for (const [name, expected] of Object.entries(documents['workspace-tools'].sourceHashes)) assert.equal(sha(name), expected, 'Workspace tool source differs from tested source: ' + name)
const desktop = documents['desktop-artifacts'], manifest = read('main/integrity-manifest.json')
for (const file of manifest.文件) assert.equal(sha(file.路径), file.校验值)
assert(desktop.packages.length === 2 && desktop.packages.every(item => item.passed && item.matchesFinalWorkspaceBuild && item.checkedIntegrityFiles === manifest.文件.length))
assert(documents['linux-deb'].passed)
assert.equal(documents['compatible-formats'].status, 'passed'); assert.equal(documents['compatible-formats'].failures.length, 0)
assert(documents['packaged-codecs'].passed)
assert(documents['windows-runtime'].results.length === 2 && documents['windows-runtime'].results.every(item => item.allProcessesExitedNormally && item.phases.length === 3 && item.phases.every(phase => phase.integrity)))
assert(documents['windows-executables'].every(item => item.productName === '海豹办公' && item.productVersion === '2.0.0'))
assert(documents['windows-archives'].archiveTests.length === 2 && documents['windows-archives'].archiveTests.every(item => item.passed))
assert(documents['office-pdf'].status === 'passed' && documents['office-pdf'].checks.length === 5)
assert(documents['office-pdf-visual'].passed && documents['office-pdf-visual'].documents.length === 2)
const mobile = documents.mobile, web = documents['web-deployment'], backend = documents['backend-deployment']
assert(mobile.stage === 'final-third-pass' && mobile.versionCode === '20000' && mobile.finalAndroidStaticEqualsSnapshot && mobile.frozenRuntimeSourceUnchanged && mobile.standaloneWebOutputUnchanged)
assert(['android', 'harmony'].every(platform => mobile.nativeCompilation[platform].passed))
assert(['file', 'http'].every(scheme => mobile.productionBrowser.schemes[scheme].passed))
const expectedBrowserGroups = ['core', 'reading', 'editor', 'workspace', 'diagram']
for (const scheme of ['file', 'http']) {
  const result = mobile.productionBrowser.schemes[scheme]
  assert(result.allGroupsCompleted && result.processWatchdogMs === 120000)
  assert.deepEqual(result.groups.map(group => group.name), expectedBrowserGroups)
  assert(result.groups.every(group => group.passed && group.checks > 0))
  assert.equal(result.bundleSha256, mobile.productionBrowser.resourceOfficeJsSha256)
}
assert.equal(web.status, 'published-verified'); assert(web.publicBrowserAcceptance.passed && web.publishedHealth.passed && web.productionAccountOperations === 0)
const standaloneWeb = read('.upgrade-private/mobile-third-pass-20261018/web-smoke/result.json')
assert(standaloneWeb.passed && standaloneWeb.allGroupsCompleted && standaloneWeb.groups.every(group => group.passed))
assert.deepEqual(standaloneWeb.groups.map(group => group.name), expectedBrowserGroups)
assert.equal(standaloneWeb.bundleSha256, web.frozenBuild.mainJsSha256)
assert(backend.passed, 'New backend + worker must be deployed and verified')
const artifactPaths = ['release/v2.0.0/海豹办公安装程序2.0.0.exe', 'release/v2.0.0/海豹办公2.0.0.exe', 'release/v2.0.0/海豹办公Ubuntu2.0.0-amd64.deb', 'release/web-2.0.0-third-pass/海豹办公-2.0.0-Web.zip']
const artifacts = artifactPaths.map(file => ({ name: path.basename(file), ...record(file) }))
assert(artifacts.every(item => item.bytes > 0))
assert.equal(artifacts.find(item => item.name.endsWith('.zip')).sha256, web.artifacts.zipSha256)
assert.equal(artifacts.find(item => item.name.endsWith('.deb')).sha256, documents['linux-deb'].sha256)
for (const executable of documents['windows-executables']) assert.equal(artifacts.find(item => item.name === executable.name).sha256, executable.sha256)
save('release-files.json', { version: '2.0.0', recordedAt: new Date().toISOString(), artifacts })
fs.writeFileSync(resolve('release/v2.0.0/SHA256SUMS.txt'), artifacts.map(item => `${item.sha256}  ${item.path.startsWith('release/v2.0.0/') ? item.name : '../web-2.0.0-third-pass/' + item.name}`).join('\n') + '\n')
const report = {
  version: '2.0.0', recordedAt: new Date().toISOString(), scope: 'third-pass frozen implementation, complete regressions, rebuilt artifacts and synchronized public Web', fullWpsParityAchieved: false,
  renderer, main, units, typecheck: { passed: true, rootAndMobile: true }, deploymentScriptTests: { passed: true, tests: 3 },
  sourceFreeze: { capturedAt: freeze.capturedAt, files: freeze.files.length, allSha256Verified: true, qaHarnessAmendments: freeze.qaHarnessAmendments || [], manifest: record('.upgrade-private/v200-third-source.json') },
  compatibleFormats: { passed: true, checks: documents['compatible-formats'].checks.length }, packagedCodecs: { passed: true, checks: documents['packaged-codecs'].checks.length },
  nativePdf: { passed: true, scenarios: 5, complexDocuments: 2, complexPhysicalPages: 10 }, windowsRuntime: documents['windows-runtime'].results, desktopIntegrityFilesPerPlatform: manifest.文件.length,
  web: { publicUrl: web.publicUrl, releaseId: web.releaseId, status: web.status, browserChecks: web.publicBrowserAcceptance.checks.length },
  mobile: { passed: true, report: 'mobile.json', cloudReady: mobile.cloudReady.map(item => ({ platform: item.platform, snapshotPath: item.snapshotPath, snapshotFiles: item.snapshotFiles })), apkOrHapGenerated: false },
  backend: { passed: true, report: 'backend-deployment.json' }, spreadsheetEvidence: 'spill.json', wordEvidence: '../../v2.0.0-Word修订与复杂结构验收.md', readingEvidence: 'mobile-reading.json', templateEvidence: { report: 'template-expansion.json', fullTemplates: 12, pages: 108 }, workspaceToolsEvidence: ['workspace-tools.json', 'diagrams.json'], artifacts,
  applicationIntegrityManifestSha256: sha('main/integrity-manifest.json'),
  limitations: [
    'Not every WPS formula parameter, native revision combination, layout property or drawing object is directly editable; unsupported content remains protected with explicit warnings.',
    'Rich realtime collaboration provides online members, but complete remote character caret positioning and transparent public publishing of realtime rooms are not implemented.',
    'No original third-party WPS cloud-export failure file was available. Independent synthetic WPS/LibreOffice comparisons and actual OOXML roundtrips define the verified scope.',
    'Linux was cross-built and statically inspected, without Linux installation or desktop runtime/UI validation.',
    'Windows unpacked and portable flows were tested. NSIS installation/uninstallation was not exercised and EXEs are unsigned.',
    'Android/HarmonyOS snapshots and UTS/browser checks passed; cloud APK/HAP generation, signing and physical-device installation/upgrade validation remain for the user.',
  ],
}
save('verification.json', report)
console.log(JSON.stringify({ version: report.version, renderer: renderer.tests, main: main.tests, server: units.server.tests, mobile: units.mobile.tests, artifacts: artifacts.map(item => ({ name: item.name, bytes: item.bytes })), publicUrl: web.publicUrl, passed: true }, null, 2))
