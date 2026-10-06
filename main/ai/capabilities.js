// 演示智能服务能力检测：文本、语音合成、图像识别、图像生成分别判定。
// 关键约束：文本模型不代表具备语音或图像能力；能力不足时给出配置引导，不伪装可用。
const { 服务种类列表 } = require('./services')

const 能力列表 = Object.freeze(['文本', '语音合成', '图像识别', '图像生成'])
const 本机主机 = ['localhost', '127.0.0.1', '[::1]']

function 是本机服务(地址) {
  try { return 本机主机.includes(new URL(String(地址)).hostname) } catch { return false }
}

function 需要密钥(配置) {
  return Boolean(配置) && !是本机服务(配置.地址)
}

function 检测文本(文本配置) {
  if (!文本配置?.地址) return { 状态: '缺少配置', 原因: '请先在设置中心配置模型服务' }
  if (!文本配置?.模型) return { 状态: '缺少配置', 原因: '请在设置中心填写模型名称' }
  if (需要密钥(文本配置) && !文本配置.已配置密钥) return { 状态: '缺少配置', 原因: '请先填写所选服务商的 API 密钥' }
  return { 状态: '可用', 模型: 文本配置.模型, 名称: 文本配置.名称 ?? '' }
}

function 检测语音(服务配置) {
  const 配置 = 服务配置?.语音
  if (!配置?.地址) return { 状态: '缺少配置', 原因: '请先配置 AI 语音合成服务；文本模型不能代替语音合成' }
  if (!配置.声线) return { 状态: '缺少配置', 原因: '请先选择语音合成声线；文本模型不能代替语音合成' }
  if (需要密钥(配置) && !配置.已配置密钥) return { 状态: '缺少配置', 原因: '请先填写语音合成服务的密钥' }
  return { 状态: '可用', 模型: 配置.模型 ?? '', 声线: 配置.声线, 名称: 配置.名称 ?? '' }
}

function 检测识别(服务配置) {
  const 配置 = 服务配置?.识别
  if (!配置?.地址) return { 状态: '缺少配置', 原因: '请先配置具备图像理解或文字识别能力的模型服务' }
  if (!配置.模型) return { 状态: '缺少配置', 原因: '请在图像识别服务中填写模型名称' }
  if (需要密钥(配置) && !配置.已配置密钥) return { 状态: '缺少配置', 原因: '请先填写图像识别服务的密钥' }
  return { 状态: '可用', 模型: 配置.模型, 名称: 配置.名称 ?? '' }
}

function 检测图像生成(服务配置) {
  const 配置 = 服务配置?.图像生成
  if (!配置?.地址) return { 状态: '缺少配置', 原因: '本阶段不提供图像生成入口；如已有兼容的图像生成服务可在设置中登记' }
  if (需要密钥(配置) && !配置.已配置密钥) return { 状态: '缺少配置', 原因: '请先填写图像生成服务的密钥' }
  return { 状态: '可用', 模型: 配置.模型 ?? '', 名称: 配置.名称 ?? '' }
}

/** 汇总四类能力状态；只依据真实配置判定，不做能力假设。 */
function 检测能力({ 文本配置 = null, 服务配置 = {} } = {}) {
  if (!服务配置 || typeof 服务配置 !== 'object') throw new Error('演示智能服务设置无效')
  return {
    文本: 检测文本(文本配置),
    语音合成: 检测语音(服务配置),
    图像识别: 检测识别(服务配置),
    图像生成: 检测图像生成(服务配置),
  }
}

/** 真实探测服务：GET 模型列表接口，按实际响应与错误如实报告。 */
async function 探测服务(配置, { 请求 = globalThis.fetch, 超时毫秒 = 15000 } = {}) {
  if (!配置?.地址) return { 可用: false, 原因: '请先填写服务接口地址' }
  const 控制器 = new AbortController()
  const 计时 = setTimeout(() => 控制器.abort(), Math.max(1000, Number(超时毫秒) || 15000))
  try {
    const 地址 = String(配置.地址).replace(/\/+$/, '') + '/models'
    const 响应 = await 请求(地址, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...(配置.密钥 ? { Authorization: `Bearer ${配置.密钥}` } : {}) },
      redirect: 'error',
      signal: 控制器.signal,
    })
    if (响应.status === 401 || 响应.status === 403) return { 可用: false, 原因: '服务鉴权失败，请检查密钥和访问权限' }
    if (响应.status === 429) return { 可用: false, 原因: '服务请求过于频繁，请稍后再试' }
    if (响应.status === 404) return { 可用: false, 原因: '服务未提供模型列表接口，无法自动核验；请确认接口地址与模型名称' }
    if (!响应.ok) return { 可用: false, 原因: `服务返回错误状态 ${响应.status ?? '未知'}` }
    let 数据
    try { 数据 = await 响应.json() } catch { return { 可用: false, 原因: '服务返回内容不是有效 JSON，无法确认能力' } }
    const 模型列表 = Array.isArray(数据?.data) ? 数据.data.map((项) => String(项?.id ?? '')).filter(Boolean) : []
    return { 可用: true, 模型列表, ...(配置.模型 && 模型列表.length && !模型列表.includes(配置.模型) ? { 警告: `模型列表中未包含已填写的 ${配置.模型}` } : {}) }
  } catch (错误) {
    if (错误?.name === 'AbortError') return { 可用: false, 原因: '服务响应超时，请检查网络或服务状态' }
    if (错误?.name === 'TypeError' || 错误?.name === 'FetchError') return { 可用: false, 原因: '无法连接服务，请检查接口地址、网络和服务状态' }
    return { 可用: false, 原因: 错误 instanceof Error ? 错误.message : '服务探测失败' }
  } finally { clearTimeout(计时) }
}

module.exports = { 检测能力, 探测服务, 能力列表, 是本机服务, 服务种类列表 }
