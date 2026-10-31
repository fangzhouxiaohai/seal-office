// HarmonyOS 本机打包：HBuilderX `cli pack app-harmony` 使用 manifest.json 中的签名配置，
// 同时归档已签名 App Pack（AppGallery 上架）与已签名 HAP（hdc / DevEco 直接安装）。
// 用法：npm --prefix mobile run pack:harmony
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { buildPlatform } from './build.mjs'
import { findHBuilder, runHBuilder } from './hbuilder.mjs'

const directory = fileURLToPath(new URL('..', import.meta.url))
const root = path.resolve(directory, '..')
const { artifactName } = createRequire(import.meta.url)('../../scripts/artifact-names.cjs')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const outputs = path.join(directory, 'unpackage/dist/build/app-harmony')
const appFile = path.join(outputs, 'build/outputs/release/app-harmony-release-signed.app')
const hapFile = path.join(outputs, 'entry/build/release/outputs/default/entry-default-signed.hap')

/** 查找 DevEco Studio 自带的签名校验工具；找不到时返回 null，不把未验签当作通过。 */
async function signTool() {
  const roots = [process.env.DEVECO_STUDIO_HOME, 'E:/DevEco Studio', 'D:/DevEco Studio', 'C:/Program Files/Huawei/DevEco Studio'].filter(Boolean)
  for (const base of roots) {
    const jar = path.join(base, 'sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar')
    const java = path.join(base, 'jbr/bin/java.exe')
    if (await fs.access(jar).then(() => true, () => false) && await fs.access(java).then(() => true, () => false)) return { jar, java }
  }
  return null
}

function verify(tool, file) {
  const output = execFileSync(tool.java, ['-jar', tool.jar, 'verify-app', '-inFile', file, '-outCertChain', file + '.cer', '-outProfile', file + '.p7b'], { encoding: 'utf8', windowsHide: true })
  if (!/verify-app success/.test(output)) throw new Error('鸿蒙签名校验失败：' + path.basename(file))
  return true
}

export async function packHarmony() {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'))
  const version = manifest.versionName
  await buildPlatform('harmony')
  const executable = findHBuilder()
  await runHBuilder(executable, ['project', 'open', '--path', directory])
  await runHBuilder(executable, ['pack', 'app-harmony', '--project', directory])
  const target = path.join(root, 'release', 'v' + version)
  await fs.mkdir(target, { recursive: true })
  const tool = await signTool()
  const result = { version, versionCode: manifest.versionCode, signatureVerified: Boolean(tool), files: [] }
  for (const [source, name] of [[appFile, `seal-office-${version}-harmony.app`], [hapFile, artifactName('harmony', version)]]) {
    const bytes = await fs.readFile(source)
    if (tool) verify(tool, source)
    await fs.writeFile(path.join(target, name), bytes)
    result.files.push({ name, bytes: bytes.length, sha256: sha256(bytes) })
  }
  console.log(JSON.stringify(result, null, 2))
  if (!tool) console.log('未找到 DevEco Studio 的 hap-sign-tool，已归档但未验签；设置 DEVECO_STUDIO_HOME 后重试。')
  console.log('HAP 使用 manifest 中的签名配置：Release Profile 只能经 AppGallery（含测试渠道）安装；直接用 hdc 安装到手机需要包含该手机 UDID 的调试 Profile。')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) packHarmony().catch((error) => { console.error(error.message); process.exitCode = 1 })
