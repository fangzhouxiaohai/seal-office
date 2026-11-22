// 海豹办公云端契约验收：对任意后端实例（--base）执行只读与自检型请求，
// 验证 docs/后端重构-接口契约.md 的关键行为。默认不改动业务数据。
// 用法：node seal-server/contract-test.mjs --base http://127.0.0.1:8097 [--admin-user admin --admin-pass ***]
const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => value.startsWith('--') ? [value.slice(2), all[index + 1] && !all[index + 1].startsWith('--') ? all[index + 1] : true] : null).filter(Boolean))
const base = (args.base || 'http://127.0.0.1:8097').replace(/\/$/, '')
const results = []
const check = (name, condition, extra = '') => { results.push({ name, passed: Boolean(condition), extra: String(extra).slice(0, 200) }); return condition }

async function request(path, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined })
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { }
  return { status: response.status, json, text, contentType: response.headers.get('content-type') || '' }
}

const capabilities = await request('/v1/capabilities')
check('能力集 200', capabilities.status === 200)
for (const key of ['version', 'collaboration', 'realtime', 'diagramRealtime', 'accountConversion', 'passwordAuth', 'accountDeletion', 'aiIdentity', 'shareLink', 'methodOverride', 'keyRecovery', 'quota', 'chunkSize', 'sms', 'encryption', 'agreementVersion'])
  check(`能力集字段 ${key}`, capabilities.json && key in capabilities.json, JSON.stringify(capabilities.json).slice(0, 120))
check('能力集配额', capabilities.json?.quota === 300000000 && capabilities.json?.chunkSize === 1048576)
check('能力集加密标识', capabilities.json?.encryption === 'AES-256-GCM')

const noAuth = await request('/v1/me')
check('未登录 401', noAuth.status === 401 && typeof noAuth.json?.error === 'string', noAuth.text.slice(0, 120))

const badLogin = await request('/v1/auth/login', { method: 'POST', body: { phone: '13800000000', code: '000000' } })
check('错误验证码 400', badLogin.status === 400 && /验证码/.test(badLogin.json?.error || ''), badLogin.text.slice(0, 120))

const badPhone = await request('/v1/auth/code', { method: 'POST', body: { phone: '123', purpose: 'login' } })
check('无效手机号 400', badPhone.status === 400)

const unknown = await request('/v1/no-such-endpoint', { token: 'x'.repeat(43) })
check('未知路径 JSON 错误', [401, 404].includes(unknown.status) && typeof unknown.json?.error === 'string', unknown.text.slice(0, 120))

const update = await request('/v1/updates/latest?platform=windows&version=0.0.1&channel=stable')
check('更新查询', update.status === 200 && typeof update.json?.hasUpdate === 'boolean', update.text.slice(0, 120))
check('更新查询非法平台', (await request('/v1/updates/latest?platform=ios&version=1.0.0')).status === 400)

const publicList = await request('/v1/public/')
check('公开内容列表', publicList.status === 200 && Array.isArray(publicList.json?.items))

const shareMissing = await request('/v1/share-links/00000000-0000-4000-8000-000000000000')
check('分享链接不存在 404', shareMissing.status === 404)

if (args['admin-user'] && args['admin-pass']) {
  const login = await request('/v1/admin/login', { method: 'POST', body: { username: args['admin-user'], password: args['admin-pass'] } })
  check('管理员登录', login.status === 200 && typeof login.json?.token === 'string')
  const token = login.json?.token
  if (token) {
    const session = await request('/v1/admin/session', { token })
    check('管理员资料', session.status === 200 && session.json?.user?.username, session.text.slice(0, 120))
    check('管理员菜单 11 项', Array.isArray(session.json?.menus) && session.json.menus.length === 11, String(session.json?.menus?.length))
    const overview = await request('/v1/admin/overview', { token })
    check('运行概览', overview.status === 200)
    const releases = await request('/v1/admin/releases', { token })
    check('发布列表', releases.status === 200 && Array.isArray(releases.json?.items) && releases.json?.statistics)
    const badVersion = await request('/v1/admin/releases/delete-version', { method: 'POST', token, body: { version: '9.9', channel: 'stable' } })
    check('整版本删除参数校验', badVersion.status === 400, badVersion.text.slice(0, 120))
    const noVersion = await request('/v1/admin/releases/delete-version', { method: 'POST', token, body: { version: '0.0.0-contract-check', channel: 'stable' } })
    check('整版本删除不存在 404', noVersion.status === 404, noVersion.text.slice(0, 120))
    const logout = await request('/v1/admin/logout', { method: 'POST', token })
    check('管理员登出', logout.status === 200)
  }
}

const failed = results.filter(item => !item.passed)
for (const item of results) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.passed ? '' : ' | ' + item.extra}`)
console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length} 项，失败 ${failed.length} 项`)
process.exitCode = failed.length ? 1 : 0
