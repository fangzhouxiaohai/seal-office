import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { findHBuilder } from './hbuilder.mjs'
const directory = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'))
assert.ok(Object.hasOwn(manifest, 'uni-app-x'), '项目必须标记为 uni-app x')
const pages = JSON.parse(await fs.readFile(path.join(directory, 'pages.json'), 'utf8'))
for (const page of pages.pages) await fs.access(path.join(directory, page.path + '.uvue'))
for (const filename of ['App.uvue', 'main.uts', 'web/public/uni.webview.js', 'web/public/fonts/NotoSansSC.ttf']) await fs.access(path.join(directory, filename))
assert.equal(manifest['app-android'].distribute.minSdkVersion, 28, '最低安卓版本应为 Android 9')
assert.equal(manifest['app-android'].distribute.targetSdkVersion, 36, '目标安卓版本应为 Android 16')
assert.deepEqual(manifest['app-android'].distribute.abiFilters, ['armeabi-v7a', 'arm64-v8a'])
const iconGroups = [manifest['app-android'].distribute.icons, manifest['app-ios'].distribute.icons, manifest['app-harmony'].distribute.icons]
for (const group of iconGroups) for (const filename of Object.values(group)) await fs.access(path.join(directory, filename))
const iosIcon = await fs.readFile(path.join(directory, manifest['app-ios'].distribute.icons.appstore))
assert.equal(iosIcon.readUInt32BE(16), 1024); assert.equal(iosIcon.readUInt32BE(20), 1024)
for (const filename of ['nativeResources/android/res/mipmap-anydpi-v26/icon.xml', 'nativeResources/android/res/mipmap-anydpi-v33/icon.xml', 'nativeResources/android/res/drawable-nodpi/icon_foreground.png', 'nativeResources/android/res/drawable-nodpi/icon_monochrome.png', 'web/public/manifest.webmanifest', 'web/public/compatibility.js']) await fs.access(path.join(directory, filename))
const androidManifest = await fs.readFile(path.join(directory, 'AndroidManifest.xml'), 'utf8')
assert.match(androidManifest, /package="com\.sealoffice\.mobile"/)
assert.match(androidManifest, /android:enableOnBackInvokedCallback="false"/)
const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
assert.ok(pkg.scripts.build.endsWith(' android')); assert.equal(pkg.scripts.pack, pkg.scripts['pack:android'])
console.log('uni-app x 结构、页面、各端 Logo、Android 9–16/双 ABI、返回保护与默认安卓流程检查通过。')
try { console.log('HBuilderX CLI：' + findHBuilder()) } catch (error) { console.log(error.message) }
if (!manifest.appid) console.log('尚无 DCloud AppID：资源构建可用，云打包需要在 HBuilderX 申请 AppID。')
