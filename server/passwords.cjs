const { randomBytes, scrypt, timingSafeEqual, createHmac } = require('node:crypto')
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
const OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
const validInput = value => typeof value === 'string' && Buffer.byteLength(value) <= 512 && Buffer.from(value).toString('utf8') === value

// Passwords authenticate the account; they never replace its independent recovery key.
function createPasswords({ db, clock, secret, verifyCode, issueSession, account, audit }) {
  let running = 0
  const dummy = { salt: Buffer.alloc(16).toString('hex'), digest: Buffer.alloc(64).toString('hex') }
  const derive = async (password, salt) => {
    if (running >= 2) fail(429, '登录服务繁忙，请稍后重试')
    running++
    try { return await new Promise((resolve, reject) => scrypt(password, Buffer.from(salt, 'hex'), 64, OPTIONS, (error, key) => error ? reject(error) : resolve(key))) }
    finally { running-- }
  }
  const throttle = (key, limit) => {
    const opaque = createHmac('sha256', secret).update(key).digest('hex'), window = Math.floor(clock() / 900000)
    db.transaction(() => {
      db.run('DELETE FROM password_attempts WHERE window<?', [window - 1])
      const entry = db.one('SELECT count FROM password_attempts WHERE key=? AND window=?', [opaque, window])
      if ((entry?.count || 0) >= limit) fail(429, '密码尝试过多，请稍后重试或使用短信登录')
      db.run('INSERT INTO password_attempts(key,window,count) VALUES(?,?,1) ON CONFLICT(key,window) DO UPDATE SET count=count+1', [opaque, window])
    })
  }
  const verify = async (password, credential) => {
    const key = await derive(validInput(password) ? password : '', (credential || dummy).salt)
    return Boolean(credential && validInput(password) && timingSafeEqual(key, Buffer.from(credential.digest, 'hex')))
  }
  async function handle({ route, method, json, reply, user, session, ip }) {
    if (method !== 'POST' || !['/v1/auth/password-login', '/v1/auth/password'].includes(route)) return false
    const input = await json(4096)
    if (route === '/v1/auth/password-login') {
      const phone = typeof input.phone === 'string' && /^1[3-9]\d{9}$/.test(input.phone) ? input.phone : ''
      throttle('login-ip:' + ip, 50); throttle('login-phone:' + phone, 10)
      const row = db.one('SELECT * FROM users WHERE phone=?', [phone])
      const credential = row && db.one('SELECT * FROM passwords WHERE user_id=?', [row.id])
      const verified = await verify(input.password, credential)
      // Recheck after the asynchronous KDF: deletion/reset may have revoked this credential.
      const current = row && db.one('SELECT * FROM users WHERE id=?', [row.id])
      if (!verified || !current || db.one('SELECT digest FROM passwords WHERE user_id=?', [row.id])?.digest !== credential.digest) fail(401, '手机号或密码不正确，请重试或使用短信登录')
      reply(issueSession(current, input, 'password-login')); return true
    }
    if (!user || !session || !db.one('SELECT hash FROM sessions WHERE hash=? AND expires>?', [session.hash, clock()])) fail(401, '请先登录')
    if (!validInput(input.password) || [...input.password].length < 15 || [...input.password].length > 128) fail(400, '新密码须为 15–128 个字符，可使用中文、空格和符号')
    throttle('change:' + user.id, 10)
    const previous = db.one('SELECT * FROM passwords WHERE user_id=?', [user.id])
    if (input.code) verifyCode(user.phone, 'password', input.code)
    else if (!previous || !await verify(input.currentPassword, previous)) fail(400, '请验证当前密码，或获取短信验证码')
    const salt = randomBytes(16).toString('hex'), digest = (await derive(input.password, salt)).toString('hex')
    db.transaction(() => {
      if (!db.one('SELECT hash FROM sessions WHERE hash=? AND expires>?', [session.hash, clock()])) fail(401, '设备会话已撤销或过期')
      if ((db.one('SELECT digest FROM passwords WHERE user_id=?', [user.id])?.digest || null) !== (previous?.digest || null)) fail(409, '密码已在其他设备修改，请重新验证')
      db.run('INSERT OR REPLACE INTO passwords(user_id,salt,digest,updated) VALUES(?,?,?,?)', [user.id, salt, digest, clock()])
      db.run('DELETE FROM sessions WHERE user_id=? AND hash!=?', [user.id, session.hash])
      db.run('DELETE FROM session_devices WHERE user_id=? AND session_hash!=?', [user.id, session.hash])
      db.run('DELETE FROM realtime_presence WHERE session_hash NOT IN (SELECT hash FROM sessions)')
      audit(user.id, 'password-change')
    })
    reply({ account: account(db.one('SELECT * FROM users WHERE id=?', [user.id])), otherSessionsRevoked: true }); return true
  }
  return { handle }
}
module.exports = { createPasswords }
