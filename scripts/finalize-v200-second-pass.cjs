// Aggregate only completed second-pass checks. Never substitute archived first-pass results.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict')
const root = path.resolve(__dirname, '..'), version = require('../package.json').version
const output = path.join(root, 'docs/verification/v2.0.0-second-pass')
const resolve = name => path.join(root, name)
const read = name => JSON.parse(fs.readFileSync(resolve(name), 'utf8').replace(/^\uFEFF/, ''))
const write = (name, data) => fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2) + '\n')
function digest(file) {
  const descriptor = fs.openSync(file, 'r'), hash = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024)
  try { for (let count; (count = fs.readSync(descriptor, buffer)) > 0;) hash.update(buffer.subarray(0, count)) } finally { fs.closeSync(descriptor) }
  return hash.digest('hex')
}
function logRecord(name) { const file = resolve(name); return { path: name, bytes: fs.statSync(file).size, sha256: digest(file) } }
function regression(name, file) {
  const report = read(file)
  assert.equal(report.success, true, name + ' complete suite must pass')
  assert.equal(report.numFailedTests, 0); assert.equal(report.numFailedTestSuites, 0)
  assert(report.testResults.length > 0 && report.testResults.every(item => item.status === 'passed'))
  const summary = { passed: true, files: report.testResults.length, tests: report.numPassedTests, skipped: report.numPendingTests, source: logRecord(file) }
  write(name + '-regression.json', summary)
  return summary
}
function unit(name, file) {
  const text = fs.readFileSync(resolve(file), 'utf8'), passed = text.match(/\bpass\s+(\d+)/), failed = text.match(/\bfail\s+(\d+)/)
  assert(passed && failed && Number(passed[1]) > 0 && Number(failed[1]) === 0, name + ' node:test result')
  return { passed: true, tests: Number(passed[1]), source: logRecord(file) }
}
function rendererRegression() {
  const file = '.upgrade-private/v200-second-pass-renderer.json', full = read(file)
  if (full.success) return regression('renderer', file)
  // The runtime is frozen. Recheck both complete changed test files, preserving the
  // failed whole-run result instead of presenting a synthetic all-green run.
  const failedFiles = full.testResults.filter(item => item.status !== 'passed')
  const suffixes = ['renderer/src/App.test.tsx', 'renderer/src/pages/SettingsPage.test.tsx']
  assert.equal(full.numFailedTests, 2); assert.equal(failedFiles.length, 2)
  assert(failedFiles.every(item => suffixes.some(suffix => item.name.replaceAll('\\', '/').endsWith(suffix))))
  const appLogPath = '.tmp-app-full-after.log', appLog = fs.readFileSync(resolve(appLogPath), 'utf8').replace(/\u001b\[[0-9;]*m/g, '')
  assert.match(appLog, /Test Files\s+1 passed \(1\)/)
  const appMatch = appLog.match(/Tests\s+(\d+) passed \((\d+)\)/)
  assert(appMatch && appMatch[1] === appMatch[2])
  const settingsFile = '.upgrade-private/v200-second-settings-fixed.json', settings = read(settingsFile)
  assert(settings.success && settings.numFailedTests === 0 && settings.testResults.length === 1 && settings.testResults[0].status === 'passed')
  const oldRecheckedTests = failedFiles.reduce((sum, item) => sum + item.assertionResults.length, 0)
  const newRecheckedTests = Number(appMatch[1]) + settings.numPassedTests
  assert.equal(newRecheckedTests, oldRecheckedTests, 'No test cases were removed')
  const production = read('docs/verification/v2.0.0-second-pass/settings-input-production.json')
  assert(production.passed && production.syntheticKeyOnly && production.trials.every(item => item.fullValueBeforeSave && item.fullValuePassedToSaveService && item.focusLost === 0 && !item.plaintextInLocalStorage))
  const summary = {
    passed: true, method: 'full-run-plus-complete-corrected-test-file-rechecks', oneWholeRunAllGreen: false,
    files: full.testResults.length, tests: full.numPassedTests + full.numFailedTests, skipped: full.numPendingTests,
    originalWholeRun: { passed: false, passedTests: full.numPassedTests, failedTests: full.numFailedTests, source: logRecord(file), failures: failedFiles.map(item => ({ file: path.relative(root, item.name).replaceAll('\\', '/'), tests: item.assertionResults.filter(test => test.status === 'failed').map(test => test.fullName) })) },
    unchangedPassingFiles: full.testResults.length - failedFiles.length,
    correctedFileRechecks: [
      { file: suffixes[0], tests: Number(appMatch[1]), passed: true, source: logRecord(appLogPath), currentTestFileSha256: digest(resolve(suffixes[0])), reason: 'Replace the obsolete coming-soon assertion with real sharing navigation, login gate, return action and unchanged recent-file ordering.' },
      { file: suffixes[1], tests: settings.numPassedTests, passed: true, source: logRecord(settingsFile), currentTestFileSha256: digest(resolve(suffixes[1])), reason: 'Provide the backupClear dependency missing from the partial desktop mock. Its error dialog stole keyboard focus. Keep full-value/security assertions, add hydrated-input and exact-save assertions.' },
    ],
    runtimeCodeChangedForTheseCorrections: false, source: logRecord(file), audit: 'renderer-audit.json',
  }
  write('renderer-regression.json', summary)
  write('renderer-audit.json', { ...summary, productionInputProof: 'settings-input-production.json', inputDiagnosis: 'settings-input-diagnostic.md', privateFocusTrace: '.upgrade-private/settings-focus-diagnostic/pair-instrumented.log', privateCausalControl: '.upgrade-private/settings-focus-diagnostic/causal.log', subsequentWholeRunPerformed: false, rationale: `Only two test files changed; all product sources/assets and the other ${full.testResults.length - failedFiles.length} passing test files remained unchanged. Both corrected files were rechecked completely. The original whole-run failures remain recorded.` })
  return summary
}
assert.equal(version, '2.0.0')
fs.mkdirSync(output, { recursive: true })
const renderer = rendererRegression()
const main = regression('main', '.upgrade-private/v200-second-pass-main-release.json')
const packaging = unit('packaging', '.tmp-v200-second-packaging.log'), mobileUnit = unit('mobile', '.tmp-v200-second-mobile-unit.log')
const documents = Object.fromEntries(['desktop-artifacts', 'linux-deb', 'compatible-formats', 'packaged-codecs', 'windows-runtime', 'windows-executables', 'windows-archives', 'mobile', 'web-deployment', 'wps-native'].map(name => [name, read('docs/verification/v2.0.0-second-pass/' + name + '.json')]))
const desktop = documents['desktop-artifacts'], manifest = read('main/integrity-manifest.json')
for (const entry of manifest.文件) assert.equal(digest(resolve(entry.路径)), entry.校验值, 'Runtime source/build changed after packaging: ' + entry.路径)
assert.equal(desktop.packages.length, 2)
assert(desktop.packages.every(item => item.passed && item.matchesFinalWorkspaceBuild && item.checkedIntegrityFiles === manifest.文件.length))
assert(documents['linux-deb'].passed)
assert.equal(documents['compatible-formats'].status, 'passed'); assert.equal(documents['compatible-formats'].failures.length, 0)
assert(documents['packaged-codecs'].passed)
assert(documents['windows-runtime'].results.length === 2 && documents['windows-runtime'].results.every(item => item.allProcessesExitedNormally && item.phases.every(phase => phase.integrity)))
assert(documents['windows-executables'].every(item => item.productName === '海豹办公' && item.productVersion === version))
assert(documents['windows-archives'].archiveTests.every(item => item.passed))
const mobile = documents.mobile, web = documents['web-deployment'], native = documents['wps-native']
assert.equal(mobile.stage, 'final-second-pass'); assert.equal(mobile.versionCode, '20000')
assert(mobile.finalAndroidStaticEqualsSnapshot && mobile.standaloneWebOutputUnchanged && mobile.frozenRuntimeSourceUnchanged)
assert(['android', 'harmony'].every(platform => mobile.nativeCompilation[platform].passed))
assert(['file', 'http'].every(scheme => mobile.productionBrowser.schemes[scheme].passed))
assert.equal(web.status, 'published-verified'); assert(web.publicBrowserAcceptance.passed && web.publishedHealth.passed)
assert.equal(web.productionAccountOperations, 0); assert.equal(web.remaining.length, 0)
assert(native.components.length === 5 && native.components.every(item => item.currentStatus === 'auto-analysis-complete' && item.attempts.at(-1).closed))
const artifactPaths = [
  'release/v2.0.0/海豹办公安装程序2.0.0.exe', 'release/v2.0.0/海豹办公2.0.0.exe',
  'release/v2.0.0/海豹办公Ubuntu2.0.0-amd64.deb', 'release/web-2.0.0-second-pass/海豹办公-2.0.0-Web.zip',
]
const artifacts = artifactPaths.map(file => ({ name: path.basename(file), path: file, bytes: fs.statSync(resolve(file)).size, sha256: digest(resolve(file)) }))
assert(artifacts.every(item => item.bytes > 0))
assert.equal(artifacts.find(item => item.name.endsWith('.zip')).sha256, web.artifacts.zipSha256)
assert.equal(artifacts.find(item => item.name.endsWith('.deb')).sha256, documents['linux-deb'].sha256)
for (const executable of documents['windows-executables']) assert.equal(artifacts.find(item => item.name === executable.name).sha256, executable.sha256)
write('release-files.json', { version, recordedAt: new Date().toISOString(), artifacts })
fs.writeFileSync(resolve('release/v2.0.0/SHA256SUMS.txt'), artifacts.map(item => `${item.sha256}  ${item.path.startsWith('release/v2.0.0/') ? item.name : '../web-2.0.0-second-pass/' + item.name}`).join('\n') + '\n')
const logs = ['.tmp-v200-second-typecheck-final.log', '.tmp-v200-second-mobile-typecheck.log', '.tmp-v200-second-mobile-check.log', '.tmp-v200-second-windows-runtime.log', '.tmp-v200-second-portable-runtime.log', '.tmp-v200-second-build.log'].map(logRecord)
const report = {
  version, recordedAt: new Date().toISOString(), scope: 'second-pass implemented features, final frozen artifacts and public Web deployment', fullWpsParityAchieved: false,
  renderer: { ...renderer, configuration: 'unchanged repository default: one isolated worker' }, main, packagingTests: packaging, mobileUnitTests: mobileUnit,
  typecheck: { passed: true, rootAndMobile: true },
  compatibleFormats: { passed: true, checks: documents['compatible-formats'].checks.length },
  packagedCodecs: { passed: true, checks: documents['packaged-codecs'].checks.length },
  windowsRuntime: documents['windows-runtime'].results, desktopIntegrityFilesPerPlatform: manifest.文件.length, debStaticCheck: true,
  web: { publicUrl: web.publicUrl, releaseId: web.releaseId, status: web.status, browserChecks: web.publicBrowserAcceptance.checks.length, staticFilesVerified: web.publishedHealth.publicAssetsSha256Verified },
  mobile: { passed: true, report: 'mobile.json', fileChecks: mobile.productionBrowser.schemes.file.checks.length, httpChecks: mobile.productionBrowser.schemes.http.checks.length, cloudReady: mobile.cloudReady, apkOrHapGenerated: false },
  native: { report: 'wps-native.json', componentsAnalyzed: native.components.length, sessionsClosed: true, allWpsCommandsExecuted: false },
  artifacts, applicationIntegrityManifestSha256: digest(resolve('main/integrity-manifest.json')), logs,
  limitations: [
    'Full WPS command/shortcut parity, exact typography/pagination, dynamic spilling, every formula parameter, native revision history and all cloud/team features are not established.',
    'No original failing WPS cloud-export workbook was available; constructed OOXML workbooks and independent LibreOffice recalculation provide bounded regression evidence.',
    'Collaboration uses explicit versioned publication and conflict detection; real-time co-editing is not implemented. Public tests made no production account/SMS/invitation operations.',
    'Linux received a cross-build and static archive inspection, without Linux installation or desktop runtime/UI validation.',
    'Windows unpacked and portable flows passed. NSIS installation/uninstallation was not performed; EXEs are unsigned.',
    'Mobile project snapshots, UTS compilation and browser/host simulation passed; APK/HAP cloud builds and physical-device install/upgrade checks remain outstanding.',
  ],
}
write('verification.json', report)
// Keep the original version-level entry point clearly pointing to the current audit.
fs.writeFileSync(resolve('docs/verification/v2.0.0/verification.json'), JSON.stringify({ version, audit: 'second-pass', currentReport: '../v2.0.0-second-pass/verification.json', firstPass: '../v2.0.0-first-pass/verification.json', fullWpsParityAchieved: false }, null, 2) + '\n')
console.log(JSON.stringify({ version, renderer: renderer.tests, main: main.tests, artifacts: artifacts.map(item => item.name), publicUrl: web.publicUrl }))
