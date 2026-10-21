import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { buildCore } from '../scripts/core-build.mjs'

test('实际browser核心必须在线核验当前手机号会话；本机实名缓存、会话撤销和离线均不能绕过生成入口', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-browser-identity-')), file = path.join(directory, 'core.mjs')
  const keys = ['window', 'document', 'fetch', 'Image'], saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  try {
    await buildCore(file)
    globalThis.window = globalThis
    globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ({ drawImage() {} }) }) }
    globalThis.Image = class { naturalWidth = 1; naturalHeight = 1; set src(_value) { queueMicrotask(() => this.onload()) } }
    const modelRequests = []
    globalThis.fetch = async (url, options) => {
      modelRequests.push({ url, options })
      return new Response(new Uint8Array([73, 68, 51, 1, 2]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
    }
    const { default: core } = await import(pathToFileURL(file).href)
    let verified = false, expired = false, offline = false
    const identityRequests = []
    const cloud = core.cloudService.createService({
      directory: '/seal/private/ai-identity',
      safeStorage: { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => Buffer.from(bytes).toString() },
      transport: async (url, options) => {
        if (url.endsWith('/v1/auth/login')) return { token: 'test-cloud-token', account: { id: 'account-1', identityVerified: true, identityMethod: 'phone', enabled: false } }
        if (url.endsWith('/v1/ai/identity')) {
          identityRequests.push({ url, options })
          if (offline) throw new Error('网络离线，无法核验身份')
          if (expired) throw Object.assign(new Error('登录会话失效'), { status: 401 })
          return { accountId: 'account-1', verified, method: 'phone', phone: 'must-not-escape' }
        }
        throw new Error('未预期的云请求：' + url)
      },
    })
    const requireAIIdentity = () => cloud.requireAIIdentity()
    const calls = [], raw = { 对话: async (...args) => { calls.push(args); return { 内容: '{"提纲":[{"页标识":"p1","标题":"标题","版式":"标题幻灯片","要点":[]}]}' } }, 读取配置: async () => ({ 名称: '测试', 地址: 'https://model.test/v1', 模型: 'test', 已配置密钥: true }) }
    const handlers = new Map(), ipc = { handle: (name, callback) => handlers.set(name, callback) }
    const assistant = core.ai.注册智能助手通道(ipc, { 助手服务: raw, requireAIIdentity })
    const services = { 读取: async () => ({ 名称: '测试', 地址: 'https://model.test/v1', 模型: 'voice', 声线: 'voice', 已配置密钥: true }), 读取内部密钥: () => 'test-model-key' }
    const cache = { 读取: async () => null, 写入: async () => {}, 清除: async () => {} }
    core.presentationAi.注册演示智能通道(ipc, { 助手服务: assistant, 服务存储: services, 语音缓存: cache, requireAIIdentity })
    core.generation.注册演示生成通道(ipc, { 助手服务: assistant, 服务存储: services, 用户数据目录: '/seal/private', requireAIIdentity })
    core.cloud.注册云端通道(ipc, { cloudService: cloud, 助手服务: assistant, requireAIIdentity })
    const sender = { id: 1, once: () => {}, removeListener: () => {}, isDestroyed: () => false, send: () => {} }
    const call = (name, ...args) => handlers.get(name)({ sender }, ...args)
    assert.equal((await call('ai.chat', { 请求标识: 'anonymous' })).code, 'AI_IDENTITY_REQUIRED')
    assert.equal(identityRequests.length, 0)
    await cloud.login('13800000000', '000000')
    assert.equal(cloud.status().account.identityVerified, true)
    assert.equal((await call('ai.chat', { 请求标识: 'cached-local-identity' })).code, 'AI_IDENTITY_REQUIRED')
    assert.equal((await call('presentation.ai.speak', { 文本: '语音生成' })).code, 'AI_IDENTITY_REQUIRED')
    const png = (await fs.readFile(new URL('../../renderer/src/editor/__fixtures__/office-image.png', import.meta.url))).toString('base64')
    await core.platform.prepareImage(Buffer.from(png, 'base64'))
    for (const action of ['ocrImage', 'imagePresentation']) {
      const blocked = await call('cloud.invoke', action, { data: png, mime: 'image/png', consent: true })
      assert.equal(blocked.code, 'AI_IDENTITY_REQUIRED', action + ': ' + JSON.stringify(blocked))
    }
    assert.equal(calls.length, 0); assert.equal(modelRequests.length, 0)
    verified = true
    assert.deepEqual((await call('cloud.invoke', 'requireAIIdentity')).数据, { accountId: 'account-1', verified: true, method: 'phone' })
    assert.equal((await call('presentation.generate.outline', { 请求标识: 'outline', 主题: '季度汇报', 页数: 1 })).成功, true)
    assert.equal(calls.length, 1)
    assert.equal((await call('presentation.ai.speak', { 文本: '验证后才生成语音' })).成功, true)
    assert.equal(modelRequests.length, 1)
    assert.doesNotMatch(JSON.stringify(calls) + JSON.stringify(modelRequests), /13800000000|must-not-escape|account-1|test-cloud-token/)
    offline = true
    const denied = await call('ai.chat', { 请求标识: 'offline', verified: true })
    assert.equal(denied.成功, false); assert.match(denied.错误, /网络离线/)
    assert.equal(calls.length, 1)
    offline = false; expired = true
    assert.equal((await call('ai.chat', { 请求标识: 'expired' })).状态码, 401)
    assert.equal(cloud.status().account, null)
    assert.equal((await call('presentation.ai.speak', { 文本: '失效不能生成' })).code, 'AI_IDENTITY_REQUIRED')
    assert.equal(modelRequests.length, 1)
  } finally {
    for (const key of keys) { const descriptor = saved.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
    await fs.unlink(file); await fs.rmdir(directory)
  }
})
