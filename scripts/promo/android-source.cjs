const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

/** 录制资源须来自当前正式安卓包，不能误用旧云打包快照。 */
function verifyAndroidRecordingSource(officeRoot, apk, version) {
  const source = fs.realpathSync(officeRoot)
  const info = JSON.parse(fs.readFileSync(path.join(source, 'build-info.json'), 'utf8'))
  if (info.platform !== 'android' || info.desktopVersion !== version) throw new Error('安卓录制资源的平台或版本不一致')
  const verifier = path.resolve(__dirname, '../../android-studio/scripts/verify-apk.py')
  const result = spawnSync('python', [verifier, apk, '--office-root', source], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })
  if (result.status !== 0) throw new Error('安卓录制资源与正式安装包不一致：' + (result.stderr || result.stdout || result.error?.message || '校验未完成').trim())
  return source
}

module.exports = { verifyAndroidRecordingSource }
