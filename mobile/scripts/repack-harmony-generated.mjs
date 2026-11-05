// HBuilderX 命令行不可连接时，将本机原生编译器的新产物同步到已生成的鸿蒙工程。
// 编译器新产物必须通过版本、清单和返回键协议核对，拒绝混用过时资源。
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const mobile = fileURLToPath(new URL('..', import.meta.url))
const project = path.join(mobile, 'unpackage/dist/build/app-harmony')
const generated = path.join(project, 'entry/src/main/resources/resfile/uni-app-x/apps/__UNI__B52B65B/www')
const compiled = path.join(mobile, 'unpackage/native-check/harmony')

export function assertCompiledWorkspace(input) {
  if (/backStartedAtHome|atHome/.test(input) ||
      !input.includes('this.workspaceReady&&a(e,"backToDesktop")&&o(e,"seq")==this.backSequence&&this.moveToBackground()')) {
    throw new Error('鸿蒙原生工作台编译产物不符合已核对的版本')
  }
}

export function assertGeneratedDiff(missing, extra) {
  const nativeMissing = missing.filter(name => !name.startsWith('static/office/'))
  const nativeExtra = extra.filter(name => !name.startsWith('static/office/'))
  if (JSON.stringify(nativeMissing) !== JSON.stringify(['uni_modules/build-profile.json5', 'uni_modules/index.generated.ets', 'uni_modules/oh-package.json5']) ||
      JSON.stringify(nativeExtra) !== JSON.stringify(['buildstamp'])) {
    throw new Error('鸿蒙生成项目与本机编译产物的文件清单不匹配：缺少 ' + JSON.stringify(missing) + '，多出 ' + JSON.stringify(extra))
  }
}

const digest = bytes => createHash('sha256').update(bytes).digest('hex')

async function listFiles(root, prefix = '') {
  const files = []
  for (const item of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const name = path.join(prefix, item.name)
    if (item.isDirectory()) files.push(...await listFiles(root, name))
    else if (item.isFile()) files.push(name)
    else throw new Error('办公资源中出现非普通文件：' + name)
  }
  return files.map(name => name.replaceAll(path.sep, '/')).sort()
}

export async function prepareGeneratedHarmony() {
  const currentOffice = path.join(mobile, 'static/office')
  const info = JSON.parse(await fs.readFile(path.join(currentOffice, 'build-info.json'), 'utf8'))
  const compiledInfo = JSON.parse(await fs.readFile(path.join(compiled, 'static/office/build-info.json'), 'utf8'))
  if (info.platform !== 'harmony' || info.desktopVersion !== '2.7.0' ||
      JSON.stringify(info) !== JSON.stringify(compiledInfo)) throw new Error('请先生成并原生编译 2.7.0 鸿蒙专用资源')
  const source = await fs.readFile(path.join(mobile, 'pages/workspace/workspace.uvue'), 'utf8')
  if (source.includes('backStartedAtHome') || !source.includes("messageBoolean(message, 'backToDesktop')")) {
    throw new Error('鸿蒙原生源码的返回键协议与已核对版本不一致')
  }
  const projectRoot = await fs.realpath(project)
  const outputRoot = await fs.realpath(generated)
  if (!outputRoot.startsWith(projectRoot + path.sep) || path.basename(outputRoot) !== 'www') {
    throw new Error('鸿蒙生成资源目标不在预期项目内')
  }
  const fresh = await listFiles(compiled)
  const existing = await listFiles(generated)
  const missing = fresh.filter(name => !existing.includes(name))
  const extra = existing.filter(name => !fresh.includes(name))
  assertGeneratedDiff(missing, extra)
  assertCompiledWorkspace(await fs.readFile(path.join(compiled, 'assets/pages/workspace/workspace.js'), 'utf8'))
  for (const name of extra.filter(name => name.startsWith('static/office/'))) await fs.unlink(path.join(generated, name))
  for (const name of fresh.filter(name => !missing.includes(name) || name.startsWith('static/office/'))) {
    const bytes = await fs.readFile(path.join(compiled, name))
    await fs.mkdir(path.dirname(path.join(generated, name)), { recursive: true })
    await fs.writeFile(path.join(generated, name), bytes)
    if (digest(await fs.readFile(path.join(generated, name))) !== digest(bytes)) throw new Error('鸿蒙生成文件字节不一致：' + name)
  }
  const officeFiles = await listFiles(currentOffice)
  if (JSON.stringify(await listFiles(path.join(generated, 'static/office'))) !== JSON.stringify(officeFiles)) throw new Error('鸿蒙网页资源文件清单与本次构建不一致')
  for (const name of officeFiles) {
    const [a, b] = await Promise.all([fs.readFile(path.join(currentOffice, name)), fs.readFile(path.join(generated, 'static/office', name))])
    if (digest(a) !== digest(b)) throw new Error('鸿蒙网页资源字节不一致：' + name)
  }
  console.log(`鸿蒙生成项目已同步本机原生编译结果：${fresh.length - missing.length} 个文件，网页资源 ${officeFiles.length} 个文件。`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  prepareGeneratedHarmony().catch(error => { console.error(error.message); process.exitCode = 1 })
}
