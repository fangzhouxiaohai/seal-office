// Keep Windows runtime/resources separate. Run on Linux with npm run dist:ubuntu.
const { build, version } = require('../package.json')
const { 文件关联, MIME别名 } = require('../main/linux/mimeTypes')
module.exports = {
  extends: null,
  appId: build.appId,
  productName: build.productName,
  directories: { output: `release/v${version}`, buildResources: 'build' },
  // Reuse the verified Linux Electron runtime checked into the private upgrade
  // workspace. On Windows, electron-builder's temporary cache can disappear
  // between download and stat, which makes an otherwise valid Ubuntu build
  // fail nondeterministically.
  electronDist: process.platform === 'linux' ? 'node_modules/electron/dist' : '.upgrade-private/electron-linux-25.9.8',
  files: [...build.files, '!node_modules/@napi-rs/canvas-win32-*/**'],
  extraMetadata: { desktopName: 'sealoffice.desktop' },
  extraResources: [
    { from: 'mobile/web/public/fonts/NotoSansSC.ttf', to: 'fonts/NotoSansSC.ttf' },
    { from: 'mobile/web/public/fonts/OFL.txt', to: 'fonts/OFL.txt' },
    { from: 'mobile/web/public/fonts/NotoSerifCJKsc-Regular.otf', to: 'fonts/NotoSerifCJKsc-Regular.otf' },
    { from: 'mobile/web/public/fonts/NotoSerif-LICENSE.txt', to: 'fonts/NotoSerif-LICENSE.txt' },
  ],
  fileAssociations: 文件关联,
  npmRebuild: false,
  compression: 'normal',
  linux: {
    executableName: 'sealoffice', syncDesktopName: true,
    icon: 'build/icon.png', category: 'Office',
    maintainer: 'Seal Office <24519660@qq.com>',
    mimeTypes: MIME别名,
    target: [{ target: 'deb', arch: ['x64'] }, { target: 'dir', arch: ['x64'] }],
    desktop: { entry: { Name: '海豹办公', 'Name[en]': '海豹办公', Comment: '文字、表格、演示和 PDF 办公软件' } },
  },
  deb: {
    artifactName: require('./artifact-names.json').ubuntu,
    depends: ['libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6', 'xdg-utils', 'libatspi2.0-0', 'libuuid1', 'libsecret-1-0', 'libasound2 | libasound2t64', 'libgbm1', 'libdrm2', 'libxkbcommon0', 'libcups2 | libcups2t64', 'libreoffice-writer', 'libreoffice-calc', 'libreoffice-impress', 'libreoffice-base-core', 'libreoffice-base-drivers', 'fonts-noto-cjk'],
  },
}
