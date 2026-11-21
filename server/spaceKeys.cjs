const { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } = require('node:crypto')

const agreementVersion = '2026-11-21'
const legacyAgreementVersion = '2026-10-08'

function derive(seed, salt, purpose) {
  return Buffer.from(hkdfSync('sha256', seed, Buffer.from(salt), Buffer.from(purpose), 32))
}

function unwrap(key, encoded, context) {
  const data = Buffer.from(encoded, 'base64')
  const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12))
  cipher.setAAD(Buffer.from(context))
  cipher.setAuthTag(data.subarray(12, 28))
  return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()])
}

function createSpaceKeys(db, secret, fail) {
  const wrappingKey = derive(secret, 'seal-cloud', 'server-space-key-v1')
  const context = (id, revision) => `seal-space-key:${id}:${revision}`
  const envelopeFor = (id, revision, root) => {
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', wrappingKey, nonce)
    cipher.setAAD(Buffer.from(context(id, revision)))
    const data = Buffer.concat([cipher.update(root), cipher.final()])
    return Buffer.concat([nonce, cipher.getAuthTag(), data]).toString('base64')
  }
  const rootFor = user => unwrap(wrappingKey, user.vault_key, context(user.id, user.vault_revision))

  function recoverLegacy(user, input) {
    if (!user.envelope || input.envelope !== user.envelope) fail(409, '云空间设置已变化，请重新同步后重试')
    if (typeof input.key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(input.key)) fail(400, '云空间密钥格式无效')
    const key = Buffer.from(input.key, 'base64')
    if (key.length !== 32 || key.toString('base64') !== input.key) fail(400, '云空间密钥格式无效')
    const recovery = typeof input.recovery === 'string' ? input.recovery.replace(/[-\s]/g, '') : ''
    if (recovery) {
      let original
      try {
        const raw = /^[a-f0-9]{64}$/i.test(recovery) ? Buffer.from(recovery, 'hex') : Buffer.alloc(0)
        original = unwrap(derive(raw, user.id, 'seal-recovery-v1'), user.envelope, `seal-root:${user.id}`)
      } catch { fail(400, '旧版恢复密钥验证失败') }
      if (original.length !== 32 || !timingSafeEqual(original, key)) fail(400, '旧版恢复密钥验证失败')
      return key
    }
    // An unlocked legacy device may have saved only the root key. Check it against existing ciphertext.
    const samples = [
      ...db.query('SELECT id, meta FROM nodes WHERE user_id=? LIMIT 5', [user.id]).map(row => [row.meta, `seal-meta:${row.id}`]),
      ...db.query('SELECT id, meta FROM tags WHERE user_id=? LIMIT 5', [user.id]).map(row => [row.meta, `seal-tag:${row.id}`]),
      ...db.query('SELECT team_id, envelope FROM team_members WHERE user_id=? LIMIT 5', [user.id]).map(row => [row.envelope, `seal-team-key:${row.team_id}:${user.id}`]),
    ]
    if (samples.length && !samples.some(([encoded, aad]) => {
      try { unwrap(key, encoded, aad); return true } catch { return false }
    })) fail(400, '本机密钥无法验证历史文件，请用旧版恢复密钥解锁')
    return key
  }

  return { envelopeFor, rootFor, recoverLegacy }
}

module.exports = { createSpaceKeys, agreementVersion, legacyAgreementVersion }
