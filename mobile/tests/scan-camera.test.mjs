import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// 拍照扫描（2.7.1）：相机权限、宿主拍照通道与隐私说明必须一致。
const read = path => fs.readFile(new URL(path, import.meta.url), 'utf8')

test('安卓 Java 宿主声明相机权限与仅限缓存目录的 FileProvider，相机设为非必需硬件', async () => {
  const manifest = await read('../../android-studio/app/src/main/AndroidManifest.xml')
  assert.match(manifest, /<uses-permission android:name="android\.permission\.CAMERA" \/>/)
  assert.match(manifest, /<uses-feature android:name="android\.hardware\.camera" android:required="false" \/>/)
  assert.match(manifest, /androidx\.core\.content\.FileProvider[\s\S]*android:authorities="\$\{applicationId\}\.scanfiles"[\s\S]*android:exported="false"[\s\S]*android:grantUriPermissions="true"/)
  const paths = await read('../../android-studio/app/src/main/res/xml/scan_files.xml')
  assert.match(paths, /<cache-path name="camera" path="camera\/" \/>/)
  assert.doesNotMatch(paths, /external|files-path|root-path/)
})

test('安卓宿主先请求运行时相机权限再打开系统相机，拒绝时回传中文原因，网页 capture 输入同样走相机', async () => {
  const activity = await read('../../android-studio/app/src/main/java/com/sealoffice/mobile/MainActivity.java')
  assert.match(activity, /case "camera-capture": capturePhoto\(id, null\); break;/)
  assert.match(activity, /checkSelfPermission\(Manifest\.permission\.CAMERA\)[\s\S]*requestPermissions\(new String\[\]\{Manifest\.permission\.CAMERA\}, CAMERA_PERMISSION\)/)
  assert.match(activity, /onRequestPermissionsResult[\s\S]*HostProtocol\.permissionGranted\(results\)[\s\S]*"camera-denied"/)
  assert.match(activity, /MediaStore\.ACTION_IMAGE_CAPTURE[\s\S]*MediaStore\.EXTRA_OUTPUT/)
  assert.match(activity, /HostProtocol\.wantsCamera\(params\.isCaptureEnabled\(\), params\.getAcceptTypes\(\)\)/)
  const gradle = await read('../../android-studio/app/build.gradle')
  assert.match(gradle, /implementation 'androidx\.core:core:1\.6\.0'/)
})

test('鸿蒙声明相机权限并提供使用理由，拍照前先申请权限，宿主两份源码保持一致', async () => {
  for (const root of ['../harmony-configs', '../../harmony-mobile/harmony-configs']) {
    const config = JSON.parse(await read(root + '/entry/src/main/module.json5'))
    const camera = config.module.requestPermissions.find(item => item.name === 'ohos.permission.CAMERA')
    assert.ok(camera, root + ' 缺少相机权限')
    assert.equal(camera.reason, '$string:seal_camera_reason')
    assert.deepEqual(camera.usedScene, { abilities: ['EntryAbility'], when: 'inuse' })
    const strings = JSON.parse(await read(root + '/entry/src/main/resources/base/element/seal_scan.json')).string
    assert.match(strings.find(item => item.name === 'seal_camera_reason').value, /拍摄文档/)
  }
  const mobile = await read('../pages/workspace/workspace.uvue'), harmony = await read('../../harmony-mobile/pages/workspace/workspace.uvue')
  assert.equal(mobile, harmony, '发行前工作源码和鸿蒙交付源码必须同步')
  for (const source of ['../pages/workspace/workspace.uvue', '../../harmony-mobile/pages/workspace/workspace.uvue']) {
    const code = await read(source)
    assert.match(code, /action == 'camera-capture'\) this\.capturePhoto\(id\)/, source)
    assert.match(code, /requestSystemPermission\(\['ohos\.permission\.CAMERA'\][\s\S]*this\.openCamera\(id\)/, source)
    assert.match(code, /uni\.chooseImage\(\{[^}]*sourceType: \['camera'\]/, source)
  }
})

test('网页侧拍照通道复用分块传输，拒绝相机权限时给出可识别的错误，取消返回空列表', async () => {
  const previous = globalThis.window, messages = []
  globalThis.window = { fetch: globalThis.fetch, sealNative: { token: 'test-only', platform: 'android' }, uni: { webView: { postMessage: ({ data }) => messages.push(data) } } }
  try {
    const result = await build({ entryPoints: [fileURLToPath(new URL('../web/native.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
    const native = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text + '\n//camera').toString('base64'))
    const reply = (type, extra = {}) => window.sealReceiveNative({ id: messages.at(-1).id, type, ...extra })
    const taking = native.captureNativePhoto()
    assert.equal(messages.at(-1).action, 'camera-capture')
    reply('file-start', { name: 'photo-1.jpg' }); reply('chunk', { data: Buffer.from('jpeg').toString('base64') }); reply('file-end'); reply('end')
    const files = await taking
    assert.deepEqual(files.map(file => file.name), ['photo-1.jpg'])
    const denied = native.captureNativePhoto(); reply('camera-denied', { error: '未获得相机权限' })
    await assert.rejects(denied, error => error.name === 'CameraDeniedError' && /相机权限/.test(error.message))
    const cancelled = native.captureNativePhoto(); reply('cancel'); assert.deepEqual(await cancelled, [])
  } finally { globalThis.window = previous }
})

test('隐私声明写明相机用途与识别上传，并与安卓、鸿蒙权限清单一致', async () => {
  const privacy = await read('../../docs/隐私声明.md')
  assert.match(privacy, /相机/)
  assert.match(privacy, /android\.permission\.CAMERA/)
  assert.match(privacy, /ohos\.permission\.CAMERA/)
  assert.match(privacy, /拒绝相机权限[^。]*相册/)
  assert.match(privacy, /识别[^。]*授权确认/)
  assert.doesNotMatch(privacy, /程序不使用摄像头|不读取通讯录、位置或相机|程序不申请摄像头/)
})
