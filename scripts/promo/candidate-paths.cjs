const fs = require('node:fs')
const path = require('node:path')
const { artifactName } = require('../artifact-names.cjs')

function promoPaths(root, version, environment = process.env) {
  root = path.resolve(root)
  let output = path.join(root, 'release', 'promo')
  if (environment.SEAL_PROMO_OUTPUT) {
    const privateRoot = fs.realpathSync(path.join(root, '.upgrade-private'))
    output = path.resolve(environment.SEAL_PROMO_OUTPUT)
    const initial = path.relative(privateRoot, output)
    if (!initial || initial === '..' || initial.startsWith('..' + path.sep) || path.isAbsolute(initial)) throw new Error('视频输出必须位于独立候选目录')
    let parent
    try { parent = fs.realpathSync(path.dirname(output)) } catch { throw new Error('独立候选目录的上级目录不存在') }
    const actual = fs.existsSync(output) ? fs.realpathSync(output) : path.join(parent, path.basename(output))
    const relative = path.relative(privateRoot, actual)
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('视频输出必须位于独立候选目录')
    output = actual
  }
  return { output,
    androidApk: path.resolve(environment.SEAL_PROMO_ANDROID_APK || path.join(root, 'release', 'v' + version, artifactName('android', version))),
    webZip: path.resolve(environment.SEAL_PROMO_WEB_ZIP || path.join(root, 'release', 'v' + version, artifactName('web', version))) }
}
module.exports = { promoPaths }
