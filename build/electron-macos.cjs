const { build, version } = require('../package.json')
const 格式 = require('../main/documentFormats.json')

// 此配置仅用于未签名的隔离测试包，正式发布需独立配置签名与公证。
module.exports = {
  extends: null,
  appId: build.appId,
  productName: build.productName,
  directories: { output: `release/v${version}`, buildResources: 'build' },
  electronDist: 'node_modules/electron/dist',
  files: build.files,
  extraResources: build.extraResources.filter(x =>
    x.to.startsWith('fonts/') || x.to === 'third-party-notice.txt' || x.to === 'licenses/citeproc-LICENSE.txt'),
  fileAssociations: 格式.map(({ extension, label }) => ({ ext: extension, name: label, description: label, role: 'Editor' })),
  npmRebuild: false,
  mac: {
    icon: 'build/icon.png',
    target: [{ target: 'dmg', arch: ['arm64'] }],
    artifactName: require('./artifact-names.json').macos,
    identity: null,
    hardenedRuntime: false,
  },
}
