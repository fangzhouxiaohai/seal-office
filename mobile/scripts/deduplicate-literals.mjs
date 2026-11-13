// 合并本地编辑器中重复的完整二进制字符串，只共享字节相同的常量，不裁剪资源。
import { parse } from 'acorn'

const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const propertyNodes = new Set(['Property', 'MethodDefinition', 'PropertyDefinition'])
const moduleNodes = new Set(['ImportExpression', 'ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'])

function isBinaryLiteral(value) {
  if (value.length < 1024) return false
  if (value.startsWith('data:')) {
    const prefix = /^data:[^,\s]*;base64,/.exec(value)
    return Boolean(prefix && base64.test(value.slice(prefix[0].length)))
  }
  return base64.test(value)
}

function parseBundle(source) {
  try { return parse(source, { ecmaVersion: 'latest', sourceType: 'script' }) }
  catch { throw new Error('编辑器脚本解析失败，不能执行资源常量去重') }
}

export function deduplicateBinaryLiterals(source) {
  const ast = parseBundle(source)
  const statements = ast.body.filter(node => !node.directive)
  const expression = statements[0]?.expression
  const body = expression?.callee?.body
  if (statements.length !== 1 || expression?.type !== 'CallExpression' ||
      !['ArrowFunctionExpression', 'FunctionExpression'].includes(expression.callee?.type) || body?.type !== 'BlockStatement') {
    throw new Error('编辑器脚本必须是标准自执行闭包，不能改变全局脚本作用域')
  }

  const strings = new Map()
  const stack = [{ node: body, parent: null }]
  while (stack.length) {
    const { node, parent } = stack.pop()
    if (node.type === 'Literal' && typeof node.value === 'string' && isBinaryLiteral(node.value)) {
      const isDirective = parent?.type === 'ExpressionStatement' && typeof parent.directive === 'string'
      const isPropertyKey = propertyNodes.has(parent?.type) && parent.key === node
      if (!isDirective && !isPropertyKey && !moduleNodes.has(parent?.type)) {
        const positions = strings.get(node.value) ?? []
        positions.push([node.start, node.end])
        strings.set(node.value, positions)
      }
    }
    // 只遍历语法节点，字符串内容和注释均不参与再次解析。
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index--) if (typeof value[index]?.type === 'string') stack.push({ node: value[index], parent: node })
      } else if (typeof value?.type === 'string') stack.push({ node: value, parent: node })
    }
  }

  const selected = [...strings].filter(([, positions]) => positions.length > 1)
  const inputBytes = Buffer.byteLength(source)
  const unchanged = () => ({ code: source, literals: 0, references: 0, inputBytes, outputBytes: inputBytes, savedBytes: 0 })
  if (!selected.length) return unchanged()
  let name = '__sealBinaryLiterals', suffix = 0
  while (source.includes(name)) name = '__sealBinaryLiterals' + ++suffix
  let insertion = body.start + 1
  for (const statement of body.body) {
    if (!statement.directive) break
    insertion = statement.end
  }
  const changes = [{ start: insertion, end: insertion, text: 'const ' + name + '=' + JSON.stringify(selected.map(([value]) => value)) + ';' }]
  let references = 0
  selected.forEach(([, positions], index) => {
    for (const [start, end] of positions) {
      changes.push({ start, end, text: name + '[' + index + ']' })
      references++
    }
  })
  changes.sort((a, b) => a.start - b.start)
  const parts = []
  let position = 0
  for (const change of changes) {
    if (change.start < position) throw new Error('资源常量替换范围重叠，已停止构建')
    parts.push(source.slice(position, change.start), change.text)
    position = change.end
  }
  parts.push(source.slice(position))
  const code = parts.join(''), outputBytes = Buffer.byteLength(code)
  if (outputBytes >= inputBytes) return unchanged()
  // 再解析成品，避免任何替换意外破坏脚本语法。
  parseBundle(code)
  return { code, literals: selected.length, references, inputBytes, outputBytes, savedBytes: inputBytes - outputBytes }
}
