const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { promoPaths } = require('./candidate-paths.cjs')

test('默认使用原发行路径，可显式绑定独立候选目录和候选安装包', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-promo-paths-'))
  try {
    const privateDir = path.join(root, '.upgrade-private'); fs.mkdirSync(privateDir)
    const baseline = promoPaths(root, '2.7.2', {})
    assert.equal(baseline.output, path.join(root, 'release', 'promo'))
    assert.equal(baseline.androidApk, path.join(root, 'release', 'v2.7.2', 'seal-office-2.7.2-android.apk'))
    const output = path.join(privateDir, 'promo-candidate'), androidApk = path.join(privateDir, 'candidate.apk'), webZip = path.join(privateDir, 'candidate.zip')
    const actual = promoPaths(root, '2.7.2', { SEAL_PROMO_OUTPUT: output, SEAL_PROMO_ANDROID_APK: androidApk, SEAL_PROMO_WEB_ZIP: webZip })
    assert.equal(actual.output, output); assert.equal(actual.androidApk, androidApk); assert.equal(actual.webZip, webZip)
    assert.throws(() => promoPaths(root, '2.7.2', { SEAL_PROMO_OUTPUT: path.join(root, 'release', 'promo') }), /独立候选/)
  } finally { fs.rmSync(root, { recursive:true, force:true }) }
})
