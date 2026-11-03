const { randomBytes, createHash } = require('crypto')
const { seal } = require('./crypto')

const b64url = buffer => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const digest = value => createHash('sha256').update(value).digest('hex')

const RAW_KEY_BYTES = 32
const SEALED_KEY_BYTES = 60
const EXPIRY_DAYS = [1, 3, 7, 30]

/**
 * 分享链接。与「文档共享」是两条独立通道：文档共享要求接收人注册登录，
 * 分享链接面向任何拿到链接的人，浏览器打开即可下载，无需登录。
 *
 * 零知识：文件密钥、文件名都只放在 URL 的 # 片段里。浏览器不会把片段发给
 * 服务器，所以服务器即使整库泄露也无法解密文件内容、也看不到文件名。
 *
 * 访问码有两道独立防线：
 *   1) 服务端用 scrypt 摘要校验访问码，并按 IP 限次，挡住在线枚举；
 *   2) 客户端用 PBKDF2(访问码) 派生密钥包裹文件密钥，没有访问码就解不开。
 */
function createShareLinkService(service) {
  const { request, status, list, keyFor } = service
  const origin = () => {
    const base = String(status().url || '').replace(/\/+$/, '')
    return /^(https?:\/\/[^/]+)/.exec(base)?.[1] || ''
  }

  /**
   * # 片段：{v,n,k,i}。
   *   v 片段版本，n 文件名，k 文件密钥或包裹后的文件密钥，
   *   i 节点标识（密文的 AAD 上下文需要它，放在片段里才不会泄露给服务器）。
   */
  const fragment = payload => b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const linkUrl = (id, access, payload) => `${origin()}/share/#/s/${id}?a=${access}&k=${fragment(payload)}`

  async function shareLinkCreate(input) {
    if (!input || typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/.test(input.id)) throw new Error('分享链接标识无效')
    const node = (await list()).find(item => item.id === input.nodeId && !item.deleted)
    if (!node) throw new Error('云文件不存在或已删除')
    if (!node.version) throw new Error('请等待此文件同步完成后再生成分享链接')
    const expiryDays = input.expiryDays === undefined || input.expiryDays === null ? null : Number(input.expiryDays)
    if (expiryDays !== null && !EXPIRY_DAYS.includes(expiryDays)) throw new Error('有效期只能选择 1、3、7、30 天或永久')
    const code = typeof input.code === 'string' && input.code.length ? input.code : null
    if (code !== null && !/^\d{4,8}$/.test(code)) throw new Error('访问码须为 4–8 位数字')

    // keyFor 接收节点对象（需要 meta.key），不是节点标识；它本身是同步解封。
    const access = b64url(randomBytes(32)), fileKey = keyFor(node)
    // 有访问码时用「包裹密钥 = PBKDF2(访问码, 链接标识)」加密文件密钥，落地页配对解开。
    const key = code ? seal(clientWrapKey(code, input.id), fileKey, `seal-share-link:${input.id}`) : fileKey
    if (key.length !== (code ? SEALED_KEY_BYTES : RAW_KEY_BYTES)) throw new Error('分享密钥长度异常，已中止')
    const name = node.meta.filename || node.meta.name
    const info = await request('/v1/share-links', {
      method: 'POST',
      data: { id: input.id, nodeId: node.id, accessHash: digest(access), expiryDays, code },
    })
    return { ...info, url: linkUrl(input.id, access, { v: 1, n: name, k: b64url(key), i: node.id }), name, hasCode: Boolean(code) }
  }

  async function shareLinkList() {
    // list() 在未登录或未解锁时会给出中文提示，这里复用同一套前置校验。
    await list()
    return request('/v1/share-links')
  }

  async function shareLinkRevoke(input) {
    if (!input || typeof input.id !== 'string') throw new Error('分享链接标识无效')
    return request(`/v1/share-links/${input.id}`, { method: 'DELETE' })
  }

  return { shareLinkCreate, shareLinkList, shareLinkRevoke }
}

/**
 * 客户端包裹密钥：PBKDF2-SHA256(访问码, 'seal-share-link:' + 链接标识, 100000, 32)。
 * 落地页在浏览器里用 WebCrypto 做完全相同的派生；两端必须保持同步。
 */
function clientWrapKey(code, linkId) {
  return require('crypto').pbkdf2Sync(code, 'seal-share-link:' + linkId, 100000, 32, 'sha256')
}

module.exports = { createShareLinkService, clientWrapKey, RAW_KEY_BYTES, SEALED_KEY_BYTES, EXPIRY_DAYS }
