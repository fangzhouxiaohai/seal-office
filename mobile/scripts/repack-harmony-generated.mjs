// HBuilderX 命令行不可连接时，将本机原生编译器的新产物同步到已生成的鸿蒙工程。
// 编译器新产物必须通过版本、清单和返回键协议核对，拒绝混用过时资源。
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { parse } from 'acorn'

const mobile = fileURLToPath(new URL('..', import.meta.url))
const project = path.join(mobile, 'unpackage/dist/build/app-harmony')
const generated = path.join(project, 'entry/src/main/resources/resfile/uni-app-x/apps/__UNI__B52B65B/www')
const compiled = path.join(mobile, 'unpackage/native-check/harmony')

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string') visit(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit))
    else if (value && typeof value === 'object') walk(value, visit)
  }
}

const identifier = (node, name) => node?.type === 'Identifier' && node.name === name
const literal = (node, value) => node?.type === 'Literal' && node.value === value
const ownProperty = (node, name) => node?.type === 'MemberExpression' && !node.computed && node.object.type === 'ThisExpression' && identifier(node.property, name)
const equals = node => node?.type === 'BinaryExpression' && ['==', '==='].includes(node.operator)
const falseValue = node => literal(node, false) || (node?.type === 'UnaryExpression' && node.operator === '!' && literal(node.argument, 1))

// 从读取器的参数、索引访问及类型分支确认导出含义，不依赖压缩器分配的字母。
function readerExports(ast, valueType) {
  const readers = new Set()
  for (const node of ast.body) {
    if (node.type !== 'FunctionDeclaration' || node.params.length !== 3 || node.body.body.length !== 2) continue
    const [message, key, fallback] = node.params
    const declaration = node.body.body[0]
    const returned = node.body.body[1]
    if (message.type !== 'Identifier' || key.type !== 'Identifier' || fallback.type !== 'AssignmentPattern' ||
        fallback.left.type !== 'Identifier' || !(valueType === 'boolean' ? falseValue(fallback.right) : literal(fallback.right, 0)) ||
        declaration.type !== 'VariableDeclaration' || declaration.declarations.length !== 1 || returned.type !== 'ReturnStatement') continue
    const value = declaration.declarations[0]
    const read = value.init
    const branch = returned.argument
    if (value.id.type !== 'Identifier' || read?.type !== 'MemberExpression' || !read.computed ||
        !identifier(read.object, message.name) || !identifier(read.property, key.name) ||
        branch?.type !== 'ConditionalExpression' || !equals(branch.test) ||
        !identifier(branch.consequent, value.id.name) || !identifier(branch.alternate, fallback.left.name)) continue
    const isType = (a, b) => literal(a, valueType) && b?.type === 'UnaryExpression' && b.operator === 'typeof' && identifier(b.argument, value.id.name)
    if (isType(branch.test.left, branch.test.right) || isType(branch.test.right, branch.test.left)) readers.add(node.id.name)
  }
  return new Set(ast.body.filter(node => node.type === 'ExportNamedDeclaration').flatMap(node =>
    node.specifiers.filter(specifier => readers.has(specifier.local.name)).map(specifier => specifier.exported.name)))
}

export function assertCompiledWorkspace(input, nativeInput) {
  const reject = () => { throw new Error('鸿蒙原生工作台编译产物不符合已核对的版本') }
  if (/backStartedAtHome|atHome/.test(input) || typeof nativeInput !== 'string') reject()
  let ast, nativeAst
  try {
    ast = parse(input, { ecmaVersion: 'latest', sourceType: 'module' })
    nativeAst = parse(nativeInput, { ecmaVersion: 'latest', sourceType: 'module' })
  } catch { reject() }
  const imports = ast.body.filter(node => node.type === 'ImportDeclaration' && node.source.value === '../../native/workspace.js')
  const localReaders = type => {
    const exported = readerExports(nativeAst, type)
    return new Set(imports.flatMap(node => node.specifiers.filter(specifier => specifier.type === 'ImportSpecifier' && exported.has(specifier.imported.name)).map(specifier => specifier.local.name)))
  }
  const booleans = localReaders('boolean')
  const numbers = localReaders('number')
  const isReader = (node, names, key) => node?.type === 'CallExpression' && node.callee.type === 'Identifier' && names.has(node.callee.name) &&
    node.arguments.length === 2 && node.arguments[0].type === 'Identifier' && literal(node.arguments[1], key)
  const flatten = node => node?.type === 'LogicalExpression' && node.operator === '&&' ? [...flatten(node.left), ...flatten(node.right)] : [node]
  let matched = false
  walk(ast, node => {
    if (node.type !== 'IfStatement' || !equals(node.test) || !(literal(node.test.left, 'back-root') || literal(node.test.right, 'back-root'))) return
    const returned = node.consequent.type === 'BlockStatement' ? node.consequent.body[0] : node.consequent
    if (returned?.type !== 'ReturnStatement') return
    const argument = returned.argument?.type === 'SequenceExpression' ? returned.argument.expressions[0] : returned.argument
    const conditions = flatten(argument)
    if (conditions.length !== 4) return
    const [ready, allowed, sequence, move] = conditions
    matched ||= ownProperty(ready, 'workspaceReady') && isReader(allowed, booleans, 'backToDesktop') && equals(sequence) &&
      isReader(sequence.left, numbers, 'seq') && ownProperty(sequence.right, 'backSequence') &&
      sequence.left.arguments[0].name === allowed.arguments[0].name && move?.type === 'CallExpression' &&
      ownProperty(move.callee, 'moveToBackground') && move.arguments.length === 0
  })
  if (!matched) reject()
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

/** 网页资源升级时同步原生容器版本，应用身份及其余字段保持原样。 */
export function updateAppVersion(config, version, bundleName) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('鸿蒙版本号无效')
  if (!bundleName || config?.app?.bundleName !== bundleName) throw new Error('鸿蒙生成工程的应用身份与源清单不一致')
  const [major, minor, patch] = version.split('.').map(Number)
  return { ...config, app: { ...config.app, versionName: version, versionCode: major * 10000 + minor * 100 + patch } }
}

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
  // 版本号读取根目录 package.json，避免每次升级手工改写本脚本。
  const desktopVersion = JSON.parse(await fs.readFile(path.join(mobile, '..', 'package.json'), 'utf8')).version
  if (info.platform !== 'harmony' || info.desktopVersion !== desktopVersion ||
      JSON.stringify(info) !== JSON.stringify(compiledInfo)) throw new Error(`请先生成并原生编译 ${desktopVersion} 鸿蒙专用资源`)
  const source = await fs.readFile(path.join(mobile, 'pages/workspace/workspace.uvue'), 'utf8')
  if (source.includes('backStartedAtHome') || !source.includes("messageBoolean(message, 'backToDesktop')")) {
    throw new Error('鸿蒙原生源码的返回键协议与已核对版本不一致')
  }
  const projectRoot = await fs.realpath(project)
  const outputRoot = await fs.realpath(generated)
  if (!outputRoot.startsWith(projectRoot + path.sep) || path.basename(outputRoot) !== 'www') {
    throw new Error('鸿蒙生成资源目标不在预期项目内')
  }
  const appConfigFile = path.join(projectRoot, 'AppScope/app.json5')
  const manifest = JSON.parse(await fs.readFile(path.join(mobile, 'manifest.json'), 'utf8'))
  const appConfig = updateAppVersion(JSON.parse(await fs.readFile(appConfigFile, 'utf8')), desktopVersion, manifest['app-harmony']?.distribute?.bundleName)
  const fresh = await listFiles(compiled)
  const existing = await listFiles(generated)
  const missing = fresh.filter(name => !existing.includes(name))
  const extra = existing.filter(name => !fresh.includes(name))
  assertGeneratedDiff(missing, extra)
  assertCompiledWorkspace(
    await fs.readFile(path.join(compiled, 'assets/pages/workspace/workspace.js'), 'utf8'),
    await fs.readFile(path.join(compiled, 'assets/native/workspace.js'), 'utf8'),
  )
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
  await fs.writeFile(appConfigFile, JSON.stringify(appConfig, null, 2) + '\n')
  console.log(`鸿蒙生成项目已同步本机原生编译结果：${fresh.length - missing.length} 个文件，网页资源 ${officeFiles.length} 个文件。`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  prepareGeneratedHarmony().catch(error => { console.error(error.message); process.exitCode = 1 })
}
