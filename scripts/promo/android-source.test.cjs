const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const JSZip = require('jszip')
const { verifyAndroidRecordingSource } = require('./android-source.cjs')

test('安卓录制资源必须来自当前版本且与正式安装包完整一致', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-promo-source-'))
  const office = path.join(root, 'office'), apk = path.join(root, 'test.apk')
  fs.mkdirSync(office)
  try {
    const info = JSON.stringify({ platform: 'android', desktopVersion: '2.7.0' })
    fs.writeFileSync(path.join(office, 'build-info.json'), info)
    fs.writeFileSync(path.join(office, 'office.js'), '测试脚本')
    const archive = new JSZip()
    archive.file('assets/apps/__UNI__B52B65B/www/static/office/build-info.json', info)
    archive.file('assets/apps/__UNI__B52B65B/www/static/office/office.js', '测试脚本')
    fs.writeFileSync(apk, await archive.generateAsync({ type: 'nodebuffer' }))
    assert.doesNotThrow(() => verifyAndroidRecordingSource(office, apk, '2.7.0'))
    assert.throws(() => verifyAndroidRecordingSource(office, apk, '2.8.0'), /版本/)
    fs.writeFileSync(path.join(office, 'office.js'), '已改变')
    assert.throws(() => verifyAndroidRecordingSource(office, apk, '2.7.0'), /不一致/)
  } finally {
    fs.unlinkSync(path.join(office, 'build-info.json')); fs.unlinkSync(path.join(office, 'office.js'))
    fs.unlinkSync(apk); fs.rmdirSync(office); fs.rmdirSync(root)
  }
})
