const guarded = new WeakMap()
const message = '请先登录已验证手机号的海豹办公账号后使用 AI 生成功能'

function identityError(text = message, status = 401) {
  return Object.assign(new Error(text), { code: 'AI_IDENTITY_REQUIRED', status })
}

/** The callback belongs to the process bootstrap, never to renderer input.
 * Its server-verified result contains no phone number or model credentials. */
async function 校验实名AI访问(requireAIIdentity) {
  if (typeof requireAIIdentity !== 'function') throw identityError()
  let identity
  try { identity = await requireAIIdentity() }
  catch (error) {
    if (error?.code === 'AI_IDENTITY_REQUIRED' || [401, 403].includes(error?.status)) throw identityError(error.message || message, error.status || 401)
    throw error
  }
  if (!identity || typeof identity.accountId !== 'string' || !identity.accountId.trim() || identity.verified !== true || identity.method !== 'phone') throw identityError(message, 403)
  return { accountId: identity.accountId, verified: true, method: 'phone' }
}

/** One protected assistant instance is shared by chat, OCR, knowledge Q&A and
 * presentation generation. Account details never become model arguments. */
function 创建实名助手服务(service, requireAIIdentity) {
  const current = guarded.get(service)
  if (current && current.requireAIIdentity === requireAIIdentity) return service
  const protectedService = Object.create(service)
  Object.defineProperty(protectedService, '对话', { enumerable: true, value: async (input, options) => {
    await 校验实名AI访问(requireAIIdentity)
    if (options?.信号?.aborted) return { 内容: '', 已停止: true }
    return service.对话(input, options)
  } })
  guarded.set(protectedService, { requireAIIdentity })
  return protectedService
}

function AI失败结果(error, fallback) {
  return { 成功: false, 错误: error instanceof Error ? error.message : fallback,
    ...(Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? { 状态码: error.status } : {}),
    ...(error?.code === 'AI_IDENTITY_REQUIRED' ? { code: error.code, 需要登录: true } : {}) }
}

/** Recheck immediately before each generation HTTP request, including later
 * automatic-task rounds and later narration pages after account revocation. */
function 创建实名AI请求(requireAIIdentity, request = globalThis.fetch) {
  return async (...args) => {
    await 校验实名AI访问(requireAIIdentity)
    if (args[1]?.signal?.aborted) throw Object.assign(new Error('已停止生成'), { name: 'AbortError' })
    return request(...args)
  }
}

module.exports = { 校验实名AI访问, 创建实名助手服务, 创建实名AI请求, AI失败结果 }
