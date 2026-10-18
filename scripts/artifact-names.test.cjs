const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { templates, artifactName } = require('./artifact-names.cjs')
const pkg = require('../package.json')
const ubuntu = require('../build/electron-ubuntu.cjs')
const mobile = require('../mobile/manifest.json')

test('all six distribution names use the requested English convention, including future versions', () => {
  assert.deepEqual(Object.fromEntries(Object.keys(templates).map(key => [key, artifactName(key, '2.0.0')])), {
    windowsSetup: 'seal-office-setup-2.0.0.exe',
    windowsPortable: 'seal-office-2.0.0-portable.exe',
    ubuntu: 'seal-office-2.0.0-amd64.deb',
    web: 'seal-office-2.0.0-web.zip',
    android: 'seal-office-2.0.0-android.apk',
    harmony: 'seal-office-2.0.0-harmony.hap',
  })
  assert.equal(artifactName('windowsSetup', '2.1.3'), 'seal-office-setup-2.1.3.exe')
  assert.equal(artifactName('harmony', '3.0.1'), 'seal-office-3.0.1-harmony.hap')
  for (const version of ['../2.0.0', '2.0.0/other', '2.0', '2.0.0.exe', '${version}', '', null]) assert.throws(() => artifactName('android', version))
  for (const platform of ['../android', '__proto__', 'constructor', 'ios']) assert.throws(() => artifactName(platform, '2.0.0'))
})

test('electron-builder uses the shared filenames while product, shortcuts and application identities retain their values', () => {
  assert.equal(pkg.build.nsis.artifactName, templates.windowsSetup)
  assert.equal(pkg.build.portable.artifactName, templates.windowsPortable)
  assert.equal(ubuntu.deb.artifactName, templates.ubuntu)
  assert.equal(pkg.name, 'seal-office')
  assert.equal(pkg.build.productName, '海豹办公')
  assert.equal(pkg.build.nsis.shortcutName, '海豹办公')
  assert.equal(pkg.build.appId, 'com.sealoffice.desktop')
  assert.equal(pkg.build.appx.displayName, 'seal-office')
  assert.equal(pkg.build.appx.applicationId, 'SealOffice')
  assert.equal(ubuntu.productName, '海豹办公')
  assert.equal(ubuntu.linux.executableName, 'sealoffice')
  assert.equal(ubuntu.linux.desktop.entry.Name, '海豹办公')
  assert.equal(mobile.name, '海豹办公')
  assert.equal(mobile.appid, '__UNI__B52B65B')
  assert.equal(mobile['app-android'].distribute.packagename, 'com.sealoffice.mobile')
  assert.equal(mobile['app-harmony'].distribute.bundleName, 'com.sealoffice.mobile')
  assert.equal(mobile.versionName, pkg.version)
  const [major, minor, patch] = pkg.version.split('.').map(Number)
  assert.equal(mobile.versionCode, String(major * 10000 + minor * 100 + patch))
})

test('portable verification follows the public name while installed and MSIX executable checks remain Chinese', () => {
  const read = filename => fs.readFileSync(path.join(__dirname, filename), 'utf8')
  assert.match(read('verify-windows-release.ps1'), /seal-office-\$taskVersion-portable\.exe/)
  assert.match(read('verify-windows-release.ps1'), /win-unpacked\\海豹办公\.exe/)
  assert.match(read('build-msix.ps1'), /Executable="海豹办公\.exe"/)
  assert.match(read('build-msix.ps1'), /\[string\]\$DisplayName = 'seal-office'/)
  for (const script of ['package-deb-on-windows.cjs', 'verify-ubuntu-release.cjs']) assert.match(read(script), /artifactName\('ubuntu', (?:pkg\.)?version\)/)
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ubuntu.yml'), 'utf8')
  assert.match(workflow, /artifactName\('ubuntu', version\)/)
})
