import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const root = new URL('../../android-mobile/android-studio/', import.meta.url)
const read = path => fs.readFile(new URL(path, root), 'utf8')

test('安卓原生工作台先确认安全桥接，再展示编辑器', async () => {
  const source = await read('app/src/main/java/com/sealoffice/mobile/MainActivity.java')
  assert.match(source, /if\s*\(!configureWebView\(\)\)\s*return/)
  assert.match(source, /WebViewCompat\.addWebMessageListener/)
  assert.match(source, /window\.dispatchEvent\(new Event\('seal-native-ready'\)\)/)
})

test('安卓启动时只保留系统启动页，工作台就绪后直接显示内容', async () => {
  const activity = await read('app/src/main/java/com/sealoffice/mobile/MainActivity.java')
  const manifest = await read('app/src/main/AndroidManifest.xml')
  const theme = await read('app/src/main/res/values/styles.xml')
  assert.match(activity, /SplashScreen\.installSplashScreen\(this\)/)
  assert.match(activity, /setKeepOnScreenCondition/)
  assert.doesNotMatch(activity, /new ImageView\(this\)|logo\.setVisibility/)
  assert.match(manifest, /android:theme="@style\/Theme\.SealOffice\.Starting"/)
  assert.match(theme, /windowSplashScreenAnimatedIcon">@drawable\/seal_splash/)
  assert.equal((await fs.stat(new URL('app/src/main/res/drawable-nodpi/seal_splash.png', root))).size > 0, true)
})

test('原生桥接就绪后立即上报工作台状态', async () => {
  const source = await fs.readFile(new URL('../web/navigation.tsx', import.meta.url), 'utf8')
  assert.match(source, /window\.addEventListener\('seal-native-ready',\s*report\)/)
  assert.match(source, /window\.removeEventListener\('seal-native-ready',\s*report\)/)
})

test('安卓调试包与正式包应用身份隔离，保留旧版用户数据', async () => {
  const source = await read('app/build.gradle')
  assert.match(source, /applicationId 'com\.sealoffice\.mobile'/)
  assert.match(source, /applicationIdSuffix '\.nativeqa'/)
})

test('底部主导航返回键明确打开系统桌面', async () => {
  const source = await read('app/src/main/java/com/sealoffice/mobile/MainActivity.java')
  assert.match(source, /Intent\.CATEGORY_HOME/)
  assert.match(source, /HostProtocol\.allowBackground[\s\S]*?openSystemHome\(\)/)
})

test('正式安装包必须使用旧版证书并校验证书指纹', async () => {
  const source = await read('app/build.gradle')
  assert.match(source, /verifyReleaseSigning/)
  assert.match(source, /53b13e1c76a826eb15879061e8840d9bc051156ff9ed33530339f444cd3997ad/)
  assert.match(source, /preReleaseBuild/)
})
