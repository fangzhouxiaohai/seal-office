// Keep Windows runtime/resources separate. Run on Linux with npm run dist:ubuntu.
const { build } = require('../package.json')
const { 文件关联, MIME类型 } = require('../main/linux/mimeTypes')
module.exports = {
  extends: null,
  appId: build.appId,
  productName: build.productName,
  directories: { output: 'release/ubuntu', buildResources: 'build' },
  files: build.files,
  extraMetadata: { desktopName: 'sealoffice.desktop' },
  extraResources: [
    { from: 'mobile/web/public/fonts/NotoSansSC.ttf', to: 'fonts/NotoSansSC.ttf' },
    { from: 'mobile/web/public/fonts/OFL.txt', to: 'fonts/OFL.txt' },
  ],
  fileAssociations: 文件关联,
  npmRebuild: false,
  compression: 'normal',
  linux: {
    executableName: 'sealoffice', syncDesktopName: true,
    icon: 'build/icon.png', category: 'Office',
    maintainer: 'Seal Office <24519660@qq.com>',
    target: [{ target: 'deb', arch: ['x64'] }, { target: 'dir', arch: ['x64'] }],
    mimeTypes: MIME类型,
    desktop: { entry: { Name: '海豹办公', 'Name[en]': 'Seal Office', Comment: '文字、表格、演示和 PDF 办公软件' } },
  },
  deb: {
    artifactName: 'SealOfficeUbuntu${version}-amd64.deb',
    depends: ['libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6', 'xdg-utils', 'libatspi2.0-0', 'libuuid1', 'libsecret-1-0', 'libasound2 | libasound2t64', 'libreoffice-writer', 'libreoffice-calc', 'libreoffice-impress', 'fonts-noto-cjk'],
  },
}
