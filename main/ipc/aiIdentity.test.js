const fs = require('fs'), path = require('path'), os = require('os')
const { EventEmitter } = require('events')
const { 校验实名AI访问, 创建实名助手服务, 创建实名AI请求 } = require('../ai/identityGate')
const { 注册智能助手通道 } = require('./aiChannel')
const { 注册演示智能通道 } = require('./presentationAiChannel')
const { 注册演示生成通道 } = require('./presentationGenerationChannel')
const { 注册演示通道 } = require('./presentationChannel')
const { 注册云端通道 } = require('./cloudChannel')
const identity = { accountId: 'verified-account', verified: true, method: 'phone' }
const configuration = { 名称: '测试', 地址: 'https://model.example/v1', 模型: 'model', 已配置密钥: true }
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-ai-identity-'))
afterAll(() => {
  const absolute = path.resolve(directory)
  if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith('seal-ai-identity-')) throw new Error('身份测试清理路径越界')
  fs.rmSync(absolute, { recursive: true, force: true })
})
afterEach(() => vi.unstubAllGlobals())

function environment(requireAIIdentity) {
  const handlers = new Map(), ipc = { handle: (name, callback) => handlers.set(name, callback) }
  const assistant = { 对话: vi.fn(async () => ({ 内容: '{"提纲":[]}' })), 读取配置: vi.fn(async () => configuration), 保存配置: vi.fn(async value => value), 清除配置: vi.fn(async () => {}) }
  const services = { 读取: vi.fn(async () => ({ ...configuration, 声线: 'voice', 已配置密钥: true })), 读取内部密钥: () => 'model-key' }
  const cache = { 读取: vi.fn(async () => null), 写入: vi.fn(async () => {}), 清除: vi.fn(async () => {}) }
  const recognition = { 识别: vi.fn(async () => ({ 文本: '不可匿名调用' })), 读取状态: async () => ({ 可用: true }) }
  const cloud = { requireAIIdentity: requireAIIdentity || vi.fn(async () => { throw Object.assign(new Error('会话已失效，请重新登录'), { status: 401 }) }), status: () => ({ account: null }) }
  注册智能助手通道(ipc, { 助手服务: assistant, requireAIIdentity })
  注册演示智能通道(ipc, { 助手服务: assistant, 服务存储: services, 语音缓存: cache, 用户数据目录: directory, requireAIIdentity })
  注册演示生成通道(ipc, { 助手服务: assistant, 服务存储: services, 用户数据目录: directory, requireAIIdentity })
  注册演示通道(ipc, undefined, { 识别服务: recognition, requireAIIdentity })
  注册云端通道(ipc, { cloudService: cloud, 助手服务: assistant, requireAIIdentity })
  const sender = Object.assign(new EventEmitter(), { id: 19, isDestroyed: () => false, send: vi.fn() })
  return { assistant, cache, recognition, cloud, services, call: (name, ...args) => handlers.get(name)({ sender }, ...args) }
}

describe('AI 实际调用层的可信身份验证', () => {
  it.each([undefined, null, false, {}, { verified: true, method: 'phone' }, { accountId: 'u', verified: false, method: 'phone' }, { accountId: 'u', verified: true, method: 'local' }, { accountId: ' ', verified: true, method: 'phone' }])('无回调或缺失权威字段 %j 均拒绝', async result => {
    await expect(校验实名AI访问(result === undefined ? undefined : async () => result)).rejects.toMatchObject({ code: 'AI_IDENTITY_REQUIRED' })
  })

  it('只接受服务器核验形状且剔除手机号；每次新对话重新校验而非信任缓存的本机账号', async () => {
    const check = vi.fn(async () => ({ ...identity, phone: '13800000000', token: 'must-not-leak' }))
    expect(await 校验实名AI访问(check)).toEqual(identity)
    const raw = { 对话: vi.fn(async () => ({ 内容: '已生成' })) }, guarded = 创建实名助手服务(raw, check)
    const input = { 消息: [{ 角色: 'user', 内容: '生成内容' }] }, options = { 推送: () => {} }
    expect(await guarded.对话(input, options)).toEqual({ 内容: '已生成' })
    expect(raw.对话).toHaveBeenCalledWith(input, options)
    expect(JSON.stringify(raw.对话.mock.calls)).not.toMatch(/13800000000|must-not-leak|verified-account/)
    check.mockRejectedValueOnce(Object.assign(new Error('登录会话失效'), { status: 401 }))
    await expect(guarded.对话(input, options)).rejects.toMatchObject({ code: 'AI_IDENTITY_REQUIRED' })
    expect(raw.对话).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, async () => ({ accountId: 'anonymous', verified: false, method: 'phone' }), async () => { throw Object.assign(new Error('会话过期'), { code: 'AI_IDENTITY_REQUIRED', status: 401 }) }])('匿名、未实名或失效会话不能从任何文字/语音/识别入口发生成请求', async callback => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const { call, assistant, cache, recognition } = environment(callback)
    const requests = [
      ['ai.chat', { 请求标识: 'chat', 消息: [{ 角色: 'user', 内容: '生成文档' }] }],
      ['presentation.ai.translate', { 请求标识: 'translate', 条目: [{ 对象标识: 'x', 原文: '你好' }], 目标语言: 'en' }],
      ['presentation.ai.proofread', { 请求标识: 'proofread', 条目: [{ 对象标识: 'x', 原文: '原文' }] }],
      ['presentation.generate.outline', { 请求标识: 'outline', 主题: '季度汇报', 页数: 1 }],
      ['presentation.ai.speak', { 文本: '朗读文字' }],
      ['presentation.ai.narrate', { 请求标识: 'narrate', 讲稿: [] }],
      ['presentation.recognition.recognize', 'AAAA', 'image/png'],
      ['cloud.invoke', 'question', { consent: true, question: '知识问答', sources: [{ name: '资料', text: '原文' }] }],
    ]
    for (const [channel, ...args] of requests) expect(await call(channel, ...args), channel).toMatchObject({ 成功: false, code: 'AI_IDENTITY_REQUIRED', 需要登录: true })
    expect(assistant.对话).not.toHaveBeenCalled()
    expect(recognition.识别).not.toHaveBeenCalled()
    expect(cache.读取).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('离线权威校验失败也不放行模型，不能使用已有本机登录标志代替', async () => {
    const { call, assistant } = environment(async () => { throw new Error('网络离线，无法核验身份') })
    expect(await call('ai.chat', { 请求标识: 'offline', 已登录: true, verified: true })).toMatchObject({ 成功: false, 错误: '网络离线，无法核验身份' })
    expect(assistant.对话).not.toHaveBeenCalled()
  })

  it('多页讲解合成在第一请求后撤销身份时不再发送下一页语音请求', async () => {
    let verified = true
    const check = vi.fn(async () => ({ ...identity, verified }))
    const fetch = vi.fn(async () => { verified = false; return new Response(new Uint8Array([73, 68, 51, 1, 2]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }) })
    vi.stubGlobal('fetch', fetch)
    const { call } = environment(check)
    const result = await call('presentation.ai.narrate', { 请求标识: 'narration', 讲稿: [{ 页标识: 'p1', 讲稿: '第一页' }, { 页标识: 'p2', 讲稿: '第二页' }] })
    expect(result.成功).toBe(true)
    expect(result.数据.音频).toHaveLength(1)
    expect(result.数据.失败).toEqual([{ 页标识: 'p2', 原因: expect.stringContaining('手机号') }])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(check).toHaveBeenCalledTimes(3)
  })

  it('生成HTTP每次重验身份，校验等待中取消也不发送第三方请求', async () => {
    const model = vi.fn(async () => 'response'), check = vi.fn(async () => identity)
    const request = 创建实名AI请求(check, model)
    expect(await request('https://model.example', { method: 'POST', body: 'document' })).toBe('response')
    check.mockResolvedValueOnce({ ...identity, verified: false })
    await expect(request('https://model.example', { method: 'POST', body: 'second-round' })).rejects.toMatchObject({ code: 'AI_IDENTITY_REQUIRED', status: 403 })
    expect(model).toHaveBeenCalledTimes(1)
    const controller = new AbortController(); let authorize
    const pending = 创建实名AI请求(() => new Promise(resolve => { authorize = resolve }), model)('https://model.example', { signal: controller.signal })
    controller.abort(); authorize(identity)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(model).toHaveBeenCalledTimes(1)
  })

  it('云通道暴露同一权威验证入口，配置、能力与纯GET模型探测无需生成权限', async () => {
    const verify = vi.fn(async () => { throw Object.assign(new Error('请登录'), { status: 401 }) })
    const { call, assistant } = environment(verify)
    expect(await call('cloud.invoke', 'requireAIIdentity')).toMatchObject({ 成功: false, code: 'AI_IDENTITY_REQUIRED', 需要登录: true })
    verify.mockClear()
    expect(await call('ai.getConfig')).toMatchObject({ 成功: true })
    expect(await call('ai.saveConfig', { 名称: '配置仍可修改' })).toMatchObject({ 成功: true })
    expect(await call('presentation.ai.capabilities')).toMatchObject({ 成功: true })
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'model' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await call('presentation.ai.probeService', '语音', configuration)).toMatchObject({ 成功: true })
    expect(fetch.mock.calls[0][1].method).toBe('GET')
    expect(verify).not.toHaveBeenCalled()
    expect(assistant.对话).not.toHaveBeenCalled()
  })
})
