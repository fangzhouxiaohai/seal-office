// HarmonyOS 本机打包：HBuilderX `cli pack app-harmony` 使用 manifest.json 中的签名配置，
// 同时归档已签名 App Pack（AppGallery 上架）与已签名 HAP（hdc / DevEco 直接安装）。
// 用法：npm --prefix mobile run pack:harmony
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
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

async function signTool() {
  const defaults = process.platform === 'darwin'
    ? ['/Applications/DevEco-Studio.app']
    : ['E:/DevEco Studio', 'D:/DevEco Studio', 'C:/Program Files/Huawei/DevEco Studio']
  const roots = [process.env.DEVECO_STUDIO_HOME, ...defaults].filter(Boolean)
  for (const base of roots) {
    const contents = process.platform === 'darwin' && base.endsWith('.app') ? path.join(base, 'Contents') : base
    const jar = path.join(contents, 'sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar')
    const java = path.join(contents, process.platform === 'darwin' ? 'jbr/Contents/Home/bin/java' : 'jbr/bin/java.exe')
    if (await fs.access(jar).then(() => true, () => false) && await fs.access(java).then(() => true, () => false)) return { jar, java }
  }
  return null
}

function verify(tool, file, temporary) {
  const output = execFileSync(tool.java, ['-jar', tool.jar, 'verify-app', '-inFile', file, '-outCertChain', path.join(temporary, 'chain.cer'), '-outProfile', path.join(temporary, 'profile.p7b')], { encoding: 'utf8', windowsHide: true })
  if (!/verify-app success/.test(output)) throw new Error('鸿蒙签名校验失败：' + path.basename(file))
}

export async function packHarmony() {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'))
  const version = manifest.versionName
  const tool = await signTool()
  if (!tool) throw new Error('未找到 DevEco Studio 的 hap-sign-tool，请设置 DEVECO_STUDIO_HOME')
  await buildPlatform('harmony')
  const executable = findHBuilder()
  await runHBuilder(executable, ['project', 'open', '--path', directory])
  await Promise.all([appFile, hapFile].map(file => fs.rm(file, { force: true })))
  await runHBuilder(executable, ['pack', 'app-harmony', '--project', directory])
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-harmony-signature-'))
  try {
    verify(tool, appFile, temporary)
    verify(tool, hapFile, temporary)
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
  const target = path.join(root, 'release', 'v' + version)
  await fs.mkdir(target, { recursive: true })
  const result = { version, versionCode: manifest.versionCode, signatureVerified: true, files: [] }
  for (const [source, name] of [[appFile, `seal-office-${version}-harmony.app`], [hapFile, artifactName('harmony', version)]]) {
    const bytes = await fs.readFile(source)
    await fs.writeFile(path.join(target, name), bytes)
    result.files.push({ name, bytes: bytes.length, sha256: sha256(bytes) })
  }
  console.log(JSON.stringify(result, null, 2))
  console.log('HAP 使用 manifest 中的签名配置：Release Profile 只能经 AppGallery（含测试渠道）安装；直接用 hdc 安装到手机需要包含该手机 UDID 的调试 Profile。')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) packHarmony().catch((error) => { console.error(error.message); process.exitCode = 1 })
