// Owned REA MCP session with a project-local Ghidra/JDK. Does not execute WPS.
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { createRequire } = require('module')
const root = path.resolve(__dirname, '..')
const toolchain = JSON.parse(fs.readFileSync(path.join(root, '.upgrade-private/analysis-tools/toolchain.json'), 'utf8').replace(/^\uFEFF/, ''))
const reaRoot = process.env.SEAL_REA_PACKAGE_ROOT || 'E:/DevCache/npm-global/node_modules/rea-agents'
const requireRea = createRequire(path.join(reaRoot, 'package.json'))
const { Client } = requireRea('@modelcontextprotocol/client')
const { StdioClientTransport } = requireRea('@modelcontextprotocol/client/stdio')
const target = path.resolve(process.argv[2])
const output = path.resolve(process.argv[3] || path.join(root, '.upgrade-private/wps-native-v2.0.0', path.basename(target)))
const startupTimeout = Number(process.env.SEAL_REA_STARTUP_TIMEOUT_MS || 3600000)
if (!Number.isInteger(startupTimeout) || startupTimeout < 1000 || startupTimeout > 7200000) throw new Error('Invalid project-local REA startup timeout')
fs.mkdirSync(output, { recursive: true })
const stderr = fs.createWriteStream(path.join(output, 'server-stderr.log'), { flags: 'a' })
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(reaRoot, 'scripts/rea.mjs'), 'mcp'], env: { ...process.env, GHIDRA_INSTALL_DIR: toolchain.ghidra, JAVA_HOME: toolchain.java, REA_ANALYSIS_PROVIDER: 'ghidra', REA_GHIDRA_STARTUP_TIMEOUT_MS: String(startupTimeout) }, stderr: 'pipe' })
transport.stderr?.pipe(stderr)
const client = new Client({ name: 'seal-office-local-native-analysis', version: '2.0.0' }, { capabilities: {} })
let serial = 0, closed = false
function decoded(result) {
  if (result.structuredContent) return result.structuredContent.result ?? result.structuredContent
  try { const value = JSON.parse(result.content.find(item => item.type === 'text').text); return value.result ?? value } catch { return result }
}
async function call(name, args = {}) {
  console.log(JSON.stringify({ started: name, at: new Date().toISOString() }))
  const result = await client.callTool({ name, arguments: args }, { timeout: startupTimeout + 300000 })
  const filename = `${String(++serial).padStart(3, '0')}-${name}.json`
  fs.writeFileSync(path.join(output, filename), JSON.stringify(result, null, 2) + '\n')
  const value = decoded(result)
  console.log(JSON.stringify({ saved: filename, isError: result.isError ?? false, keys: Object.keys(value ?? {}), summary: name === 'binary_session' ? { candidates: value.analysis_provider_candidates?.map(item => ({ provider: item.provider, availability: item.availability.status })) } : JSON.stringify(value).slice(0, 900) }))
  return result
}
async function close() {
  if (closed) return
  closed = true
  try { await call('close_binary') } finally {
    await client.close(); stderr.end()
    // A PTY's resumed stdin can keep an already-closed analysis helper alive.
    process.stdin.pause(); process.stdin.unref?.()
  }
}
async function main() {
  await client.connect(transport)
  const catalog = await client.listTools()
  fs.writeFileSync(path.join(output, 'tool-schemas.json'), JSON.stringify(catalog.tools, null, 2) + '\n')
  await call('binary_session')
  const opened = await call('open_binary', { path: target, provider_id: 'ghidra' })
  if (opened.isError) throw new Error('REA rejected the native target; inspect retained open result')
  await call('binary_overview')
  console.log('REA_READY_FOR_JSON_COMMANDS')
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of input) {
    if (!line.trim()) continue
    try {
      const request = JSON.parse(line)
      if (request.close) break
      if (!catalog.tools.some(tool => tool.name === request.tool)) throw new Error('Unknown REA tool')
      await call(request.tool, request.arguments || {})
    } catch (error) { console.error(error.message) }
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 }).finally(close)
process.on('SIGINT', () => { close().finally(() => process.exit(130)) })
