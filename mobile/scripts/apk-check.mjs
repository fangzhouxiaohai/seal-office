import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'

const run = promisify(execFile), require = createRequire(import.meta.url), JSZip = require('jszip')
const project = fileURLToPath(new URL('../..', import.meta.url))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const execute = async (command, args) => (await run(command, args, { windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 })).stdout
const exists = async filename => { try { await fs.access(filename); return true } catch { return false } }
function elfLoads(bytes) {
  if (bytes.subarray(0, 4).toString('hex') !== '7f454c46' || bytes[5] !== 1) throw new Error('原生库不是 little-endian ELF')
  const is64 = bytes[4] === 2
  const table = is64 ? Number(bytes.readBigUInt64LE(32)) : bytes.readUInt32LE(28)
  const stride = bytes.readUInt16LE(is64 ? 54 : 42), count = bytes.readUInt16LE(is64 ? 56 : 44), loads = []
  for (let index = 0; index < count; index++) {
    const offset = table + stride * index
    if (bytes.readUInt32LE(offset) !== 1) continue
    const alignment = is64 ? Number(bytes.readBigUInt64LE(offset + 48)) : bytes.readUInt32LE(offset + 28)
    loads.push(alignment)
  }
  return loads
}

async function main() {
  const args = process.argv.slice(2), filename = args[0]
  if (!filename || filename.startsWith('--')) throw new Error('用法：npm --prefix mobile run check:apk -- <APK路径> [--device <ADB序列号>] [--require-current]')
  const apkPath = path.resolve(filename), data = await fs.readFile(apkPath), zip = await JSZip.loadAsync(data)
  const roots = Object.keys(zip.files).filter(name => /^assets\/apps\/__UNI__[A-Za-z0-9]+\/www\/manifest\.json$/.test(name))
  if (roots.length !== 1) throw new Error('APK 内未找到唯一的 uni-app x 应用清单')
  const appRoot = roots[0].slice(0, -'manifest.json'.length), officeRoot = appRoot + 'static/office/'
  const json = async name => JSON.parse(await zip.file(name).async('string'))
  const manifest = await json(roots[0]), build = await json(officeRoot + 'build-info.json')
  const office = zip.file(officeRoot + 'office.js'), font = zip.file(officeRoot + 'fonts/NotoSansSC.ttf')
  if (!office || !font || !zip.file(officeRoot + 'index.html') || build.platform !== 'android') throw new Error('安卓包内办公脚本、中文字体或平台信息缺失')
  const localOffice = path.join(project, 'mobile/static/office/office.js')
  const report = {
    inspectedAt: new Date().toISOString(), apkPath, sha256: hash(data), bytes: data.length,
    appId: manifest.id, version: manifest.version, build,
    embeddedEditor: { present: true, sha256: hash(await office.async('nodebuffer')), matchesCurrentSourceBuild: await exists(localOffice) ? hash(await office.async('nodebuffer')) === hash(await fs.readFile(localOffice)) : null },
    duplicatedJavaScriptBytes: 0, sdkMetadata: null, signature: null, device: null,
    nativeLibraries16KiB: [],
  }
  for (const [name, item] of Object.entries(zip.files)) {
    if (!item.dir && name.startsWith(officeRoot + 'assets/') && /\.m?js$/.test(name)) report.duplicatedJavaScriptBytes += (await item.async('nodebuffer')).length
    if (/^lib\/arm64-v8a\/[^/]+\.so$/.test(name)) {
      const alignments = elfLoads(await item.async('nodebuffer'))
      report.nativeLibraries16KiB.push({ name, loadAlignments: alignments, compatible: alignments.length > 0 && alignments.every(alignment => alignment >= 16384) })
    }
  }
  let sdk
  for (const candidate of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, 'E:/Applications/Android/Sdk'].filter(Boolean)) {
    if (await exists(path.join(candidate, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'))) { sdk = candidate; break }
  }
  if (sdk) {
    const versions = (await fs.readdir(path.join(sdk, 'build-tools'))).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    const buildTools = versions.find(version => /^\d+\.\d+\.\d+$/.test(version))
    if (buildTools) {
      const tools = path.join(sdk, 'build-tools', buildTools)
      const badging = await execute(path.join(tools, process.platform === 'win32' ? 'aapt.exe' : 'aapt'), ['dump', 'badging', apkPath])
      const packageInfo = badging.match(/package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/)
      if (!packageInfo || !/^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/.test(packageInfo[1])) throw new Error('安卓包名无效')
      report.sdkMetadata = { packageName: packageInfo[1], versionCode: packageInfo[2], versionName: packageInfo[3], minSdk: badging.match(/sdkVersion:'([^']+)'/)?.[1], targetSdk: badging.match(/targetSdkVersion:'([^']+)'/)?.[1], abi: badging.match(/native-code: (.+)/)?.[1], permissions: [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map(item => item[1]) }
      const signature = await execute('java', ['-jar', path.join(tools, 'lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', apkPath])
      report.signature = { verified: true, v1: /v1 scheme.*: true/.test(signature), v2: /v2 scheme.*: true/.test(signature), certificateSha256: signature.match(/certificate SHA-256 digest: (\w+)/)?.[1] }
    }
    const deviceIndex = args.indexOf('--device')
    if (deviceIndex >= 0) {
      const serial = args[deviceIndex + 1]
      if (!serial || serial.startsWith('--') || !report.sdkMetadata) throw new Error('请提供 ADB 序列号，并安装 Android SDK build-tools')
      const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
      const device = async command => execute(adb, ['-s', serial, ...command])
      const installed = (await device(['shell', 'pm', 'path', report.sdkMetadata.packageName])).trim().split(/\r?\n/).find(line => line.startsWith('package:'))?.slice(8)
      if (!installed || !/^\/[A-Za-z0-9/_.~+=-]+\.apk$/.test(installed)) throw new Error('设备未安装该应用或 APK 路径异常；本命令不会安装或覆盖应用')
      const installedHash = (await device(['shell', 'sha256sum', installed])).trim().split(/\s/)[0]
      report.device = { serial, androidVersion: (await device(['shell', 'getprop', 'ro.build.version.release'])).trim(), installedApkMatches: installedHash === report.sha256 }
    }
  } else if (args.includes('--device')) throw new Error('未找到 Android SDK；请设置 ANDROID_HOME')
  const output = path.join(project, '.upgrade-private/mobile-verification/android-apk.json')
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  console.log('验包记录：' + output)
  if (args.includes('--require-current') && !report.embeddedEditor.matchesCurrentSourceBuild) throw new Error('APK 不包含当前构建的修复，请重新云打包')
  if (args.includes('--require-current') && report.sdkMetadata) {
    if (Number(report.sdkMetadata.minSdk) !== 28 || Number(report.sdkMetadata.targetSdk) !== 36 || !report.sdkMetadata.abi?.includes('armeabi-v7a') || !report.sdkMetadata.abi?.includes('arm64-v8a')) throw new Error('APK 的 Android 9–16 或双 ABI 配置未生效')
    if (report.nativeLibraries16KiB.some(item => !item.compatible)) throw new Error('APK 存在未满足 16 KiB ELF 加载对齐的原生库')
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
