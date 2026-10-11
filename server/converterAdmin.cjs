const fs = require('node:fs')
const path = require('node:path')
const { randomBytes, randomUUID, createHash } = require('node:crypto')

function createConverterAdmin({ directory, env = process.env, request = fetch } = {}) {
  const filename = path.join(directory, 'converter-settings.json')
  const controlToken = env.SEAL_CONVERTER_CONTROL_TOKEN || ''
  const base = env.SEAL_CONVERTER_INTERNAL_URL || 'http://127.0.0.1:8298'
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/.test(base)) throw new Error('转换管理通道必须使用回环地址')
  let settings = { enabled: false, concurrency: 1, tokenHash: '', revision: randomUUID(), updatedAt: Date.now() }
  if (fs.existsSync(filename)) {
    const saved = JSON.parse(fs.readFileSync(filename, 'utf8'))
    if (typeof saved.enabled !== 'boolean' || ![1, 2].includes(saved.concurrency) || !/^(?:[a-f0-9]{64})?$/.test(saved.tokenHash || '') || typeof saved.revision !== 'string') throw new Error('转换配置文件无效')
    settings = saved
  }
  const endpoint = (env.SEAL_PUBLIC_ORIGIN || 'https://seal.xingmasoft.com').replace(/\/$/, '') + '/api/office-converter'
  const publicConfig = () => ({ enabled: settings.enabled, concurrency: settings.concurrency, tokenConfigured: Boolean(settings.tokenHash), tokenFingerprint: settings.tokenHash ? settings.tokenHash.slice(0, 12) : '', updatedAt: settings.updatedAt, endpoint, maximumBytes: 20 * 1024 * 1024, timeoutSeconds: 90 })
  async function worker(route, method = 'GET', body, timeout = 10000) {
    if (!controlToken) throw Object.assign(new Error('转换管理通道尚未配置'), { status: 503 })
    let response
    try { response = await request(base + '/internal/' + route, { method, headers: { Authorization: 'Bearer ' + controlToken, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeout) }) }
    catch { throw Object.assign(new Error('转换引擎服务未连接，请检查运行状态'), { status: 503 }) }
    const value = await response.json()
    if (!response.ok) throw Object.assign(new Error(value.error || '转换管理请求失败'), { status: response.status })
    return value
  }
  let synchronization, operation = Promise.resolve()
  const exclusive = task => { const result = operation.then(task, task); operation = result.catch(() => {}); return result }
  async function sync() {
    if (synchronization) return synchronization
    synchronization = exclusive(async () => { const state = await worker('status'); if (state.settings.revision !== settings.revision) await worker('config', 'POST', settings); return state })
    try { return await synchronization } finally { synchronization = null }
  }
  async function status() {
    try { await sync(); return { connected: true, config: publicConfig(), ...await worker('status') } }
    catch (error) { return { connected: false, config: publicConfig(), error: error.message, statistics: { active: 0, recent: [] }, engine: { ready: false } } }
  }
  async function apply(input, rotate = false) {
    if (!input || typeof input !== 'object' || (!rotate && (typeof input.enabled !== 'boolean' || ![1, 2].includes(input.concurrency)))) throw Object.assign(new Error('启停或并发配置无效'), { status: 400 })
    const token = rotate ? randomBytes(32).toString('base64url') : ''
    const next = { ...settings, ...(rotate ? { tokenHash: createHash('sha256').update(token).digest('hex') } : { enabled: input.enabled, concurrency: input.concurrency }), updatedAt: Date.now(), revision: randomUUID() }
    await worker('config', 'POST', next)
    try {
      const temporary = filename + '.tmp'
      const fd = fs.openSync(temporary, 'w', 0o600)
      try { fs.writeFileSync(fd, JSON.stringify(next)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
      fs.renameSync(temporary, filename); settings = next
    } catch { await worker('config', 'POST', settings).catch(() => {}); throw Object.assign(new Error('转换配置未保存，请重试'), { status: 500 }) }
    return { config: publicConfig(), ...(rotate ? { token } : {}) }
  }
  const update = (input, rotate = false) => exclusive(() => apply(input, rotate))
  const timer = setInterval(() => { if (controlToken) void sync().catch(() => {}) }, 15000)
  timer.unref()
  return { status, update, test: () => worker('test', 'POST', {}, 190000), publicConfig, close: () => clearInterval(timer) }
}
module.exports = { createConverterAdmin }
