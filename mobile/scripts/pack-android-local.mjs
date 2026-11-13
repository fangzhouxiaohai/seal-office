// 正式安卓版只使用仓库根目录 Java 工程；旧云打包入口保留用于历史追溯。
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { archiveArtifact } from './archive-artifact.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const certificate = '53b13e1c76a826eb15879061e8840d9bc051156ff9ed33530339f444cd3997ad'

export function validateSigningEnvironment(environment) {
  const keys = ['SEAL_ANDROID_KEYSTORE', 'SEAL_ANDROID_STORE_PASSWORD', 'SEAL_ANDROID_KEY_ALIAS', 'SEAL_ANDROID_KEY_PASSWORD']
  if (keys.some(key => !environment[key]?.trim())) throw new Error('缺少安卓正式签名配置，请在本机构建环境设置原证书和签名口令')
}

export async function validateAndroidBuild(directory) {
  const read = async name => JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))
  const { version } = await read('package.json')
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('安卓正式版版本号无效')
  const [major, minor, patch] = version.split('.').map(Number)
  const versionCode = major * 10000 + minor * 100 + patch
  const manifest = await read('mobile/manifest.json')
  if (manifest.versionName !== version || Number(manifest.versionCode) !== versionCode) throw new Error('移动清单版本或构建号未同步')
  const office = path.join(directory, 'mobile/static/office')
  const info = await read('mobile/static/office/build-info.json')
  if (info.platform !== 'android' || info.desktopVersion !== version) throw new Error('安卓资源的平台或版本不一致')
  for (const name of ['index.html', 'office.js', 'fonts/NotoSansSC.ttf', 'fonts/NotoSerifCJKsc-Regular.otf']) {
    const stat = await fs.stat(path.join(office, name)).catch(() => null)
    if (!stat?.isFile() || stat.size === 0) throw new Error('安卓工作台资源缺失或为空：' + name)
  }
  return { version, versionCode, project: path.join(directory, 'android-studio'), office,
    target: path.join(directory, 'release', 'v' + version, `seal-office-${version}-android.apk`) }
}

function run(program, args, cwd, capture = false) {
  const result = spawnSync(program, args, { cwd, windowsHide: true, shell: false,
    encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
  if (result.status !== 0) throw new Error('安卓本机验证失败：' + path.basename(program) + '，请检查构建日志')
  return result.stdout || ''
}

export async function packAndroidLocal() {
  validateSigningEnvironment(process.env)
  if (!(await fs.stat(process.env.SEAL_ANDROID_KEYSTORE)).isFile()) throw new Error('安卓签名文件不是普通文件')
  if (!process.argv.includes('--skip-build')) await (await import('./build.mjs')).buildPlatform('android')
  const config = await validateAndroidBuild(root)
  // 脚本及参数固定，避免把本机密码或动态路径拼进命令字符串。
  if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', 'gradlew.bat', '--no-daemon', 'testDebugUnitTest', 'assembleRelease'], config.project)
  else run('./gradlew', ['--no-daemon', 'testDebugUnitTest', 'assembleRelease'], config.project)
  const apk = path.join(config.project, 'app/build/outputs/apk/release/app-release.apk')
  run('python', [path.join(config.project, 'scripts/verify-apk.py'), apk], root)
  let sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME
  if (!sdk) {
    const properties = await fs.readFile(path.join(config.project, 'local.properties'), 'utf8')
    sdk = properties.match(/^sdk\.dir=(.+)$/m)?.[1]?.trim().replace(/\\([:\\])/g, '$1')
  }
  if (!sdk) throw new Error('未找到安卓 SDK，无法核验正式安装包签名')
  const tools = path.join(sdk, 'build-tools/36.0.0')
  const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java'
  const signed = run(java, ['-jar', path.join(tools, 'lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', apk], root, true)
  if (!signed.toLowerCase().includes('certificate sha-256 digest: ' + certificate)) throw new Error('正式安卓安装包证书与既有版本不一致')
  const badging = run(path.join(tools, process.platform === 'win32' ? 'aapt.exe' : 'aapt'), ['dump', 'badging', apk], root, true)
  if (!badging.includes("name='com.sealoffice.mobile'") || !badging.includes(`versionCode='${config.versionCode}'`) || !badging.includes(`versionName='${config.version}'`)) throw new Error('正式安卓安装包身份或版本不一致')
  const report = await archiveArtifact({ platform: 'android', version: config.version, source: apk, directory: path.dirname(config.target) })
  console.log(JSON.stringify({ ...report, version: config.version, versionCode: config.versionCode, certificateSha256: certificate, signatureVerified: true, resourcesVerified: true }, null, 2))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) packAndroidLocal().catch(error => { console.error(error.message); process.exitCode = 1 })
