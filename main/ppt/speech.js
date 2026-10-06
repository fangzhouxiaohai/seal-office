// AI 语音合成：独立于文本模型的服务配置，支持声线列表、试听合成与按内容寻址的分页音频缓存。
// 未配置服务时不提供任何本机兜底语音，避免把系统语音冒充所选模型输出。
const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')

const 最大文本长度 = 5000
const 音频类型 = ['audio/', 'application/octet-stream']

const 是记录 = (值) => typeof 值 === 'object' && 值 !== null && !Array.isArray(值)

function 基地地址(地址) {
  return String(地址).replace(/\/+$/, '')
}

function 校验语音配置(配置) {
  if (!是记录(配置) || typeof 配置.地址 !== 'string' || !配置.地址.trim()) throw new Error('请先配置 AI 语音合成服务')
  if (typeof 配置.声线 !== 'string' || !配置.声线.trim()) throw new Error('请先选择语音合成声线')
  const 语速 = 配置.语速 ?? 1
  if (typeof 语速 !== 'number' || !Number.isFinite(语速) || 语速 < 0.5 || 语速 > 2) throw new Error('语速无效：允许 0.5 到 2 之间的数值')
  return { 地址: 基地地址(配置.地址), 模型: typeof 配置.模型 === 'string' ? 配置.模型 : '', 声线: 配置.声线.trim(), 语速, 密钥: typeof 配置.密钥 === 'string' ? 配置.密钥 : '' }
}

function 语音缓存键(配置, 文本) {
  const 规范 = 校验语音配置(配置)
  return createHash('sha256').update(`${规范.模型}|${规范.声线}|${规范.语速}|${文本}`).digest('hex')
}

/** 分页音频缓存：按内容寻址，重复内容不重复落盘。 */
function 创建语音缓存({ 目录, 存储 = fs.promises }) {
  if (typeof 目录 !== 'string' || !目录.trim()) throw new Error('语音缓存目录无效')
  const 音频路径 = (键) => path.join(目录, `${键}.bin`)
  const 元数据路径 = (键) => path.join(目录, `${键}.json`)
  const 读取 = async (键) => {
    if (typeof 键 !== 'string' || !/^[0-9a-f]{64}$/.test(键)) return null
    try {
      const 元数据 = JSON.parse(await 存储.readFile(元数据路径(键), 'utf8'))
      if (!是记录(元数据) || typeof 元数据.类型 !== 'string') return null
      const 音频 = await 存储.readFile(音频路径(键))
      if (!音频 || !音频.length) return null
      return { 音频, 类型: 元数据.类型, 字节数: 音频.length }
    } catch { return null }
  }
  const 写入 = async (键, 音频, 类型) => {
    if (typeof 键 !== 'string' || !/^[0-9a-f]{64}$/.test(键)) throw new Error('语音缓存键无效')
    if (!Buffer.isBuffer(音频) || !音频.length) throw new Error('语音缓存内容为空')
    if (typeof 存储.mkdir === 'function') await 存储.mkdir(目录, { recursive: true })
    await 存储.writeFile(音频路径(键), 音频)
    await 存储.writeFile(元数据路径(键), JSON.stringify({ 类型, 字节数: 音频.length }), 'utf8')
  }
  const 清除 = async () => {
    if (typeof 存储.rm === 'function') { await 存储.rm(目录, { recursive: true, force: true }); await 存储.mkdir(目录, { recursive: true }); return }
    const 列表 = await 存储.readdir(目录)
    for (const 名 of 列表) await 存储.unlink(path.join(目录, 名))
  }
  return { 读取, 写入, 清除, 目录 }
}

function 内容类型(响应) {
  const 值 = 响应?.headers?.get?.('content-type') ?? 响应?.headers?.['content-type'] ?? ''
  return String(值).split(';')[0].trim().toLowerCase()
}

/** 合成一段语音；命中缓存时不重复请求服务。 */
async function 合成语音(文本, { 配置, 请求 = globalThis.fetch, 缓存, 信号, 超时毫秒 = 60000 } = {}) {
  const 规范 = 校验语音配置(配置)
  if (typeof 文本 !== 'string' || !文本.trim()) throw new Error('没有需要合成的文本')
  if (文本.length > 最大文本长度) throw new Error(`文本过长：一次最多合成 ${最大文本长度} 个字符，请按页拆分`)
  const 键 = 语音缓存键(配置, 文本)
  if (缓存) {
    const 命中 = await 缓存.读取(键)
    if (命中) return { 音频: 命中.音频.toString('base64'), 类型: 命中.类型, 字节数: 命中.字节数, 命中缓存: true, 缓存键: 键 }
  }
  const 控制器 = new AbortController()
  const 计时 = setTimeout(() => 控制器.abort(), Math.max(1000, Number(超时毫秒) || 60000))
  const 外部中止 = () => 控制器.abort()
  信号?.addEventListener('abort', 外部中止, { once: true })
  if (信号?.aborted) 控制器.abort()
  try {
    const 响应 = await 请求(`${规范.地址}/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(规范.密钥 ? { Authorization: `Bearer ${规范.密钥}` } : {}) },
      body: JSON.stringify({ model: 规范.模型, voice: 规范.声线, speed: 规范.语速, input: 文本 }),
      redirect: 'error',
      signal: 控制器.signal,
    })
    if (响应.status === 401 || 响应.status === 403) throw new Error('语音合成服务鉴权失败，请检查密钥和访问权限')
    if (响应.status === 429) throw new Error('语音合成服务请求过于频繁，请稍后再试')
    if (响应.status === 404 || 响应.status === 400 || 响应.status === 422) throw new Error('服务未提供语音合成接口或当前模型不支持该参数，请核对接口地址、模型与声线')
    if (!响应.ok) throw new Error(`语音合成服务返回错误状态 ${响应.status ?? '未知'}`)
    const 类型 = 内容类型(响应)
    if (!音频类型.some((前缀) => 类型.startsWith(前缀))) throw new Error('服务返回的内容不是音频，请核对模型是否支持语音合成')
    const 缓冲 = Buffer.from(await 响应.arrayBuffer())
    if (!缓冲.length) throw new Error('语音合成返回的音频为空，已拒绝写入')
    if (缓存) await 缓存.写入(键, 缓冲, 类型)
    return { 音频: 缓冲.toString('base64'), 类型, 字节数: 缓冲.length, 命中缓存: false, 缓存键: 键 }
  } catch (错误) {
    if (错误?.name === 'AbortError') {
      if (信号?.aborted) throw new Error('已停止语音合成')
      throw new Error('语音合成服务响应超时，请检查网络或服务状态')
    }
    if (错误?.name === 'TypeError' || 错误?.name === 'FetchError') throw new Error('无法连接语音合成服务，请检查接口地址、网络和服务状态')
    throw 错误
  } finally { clearTimeout(计时); 信号?.removeEventListener('abort', 外部中止) }
}

/** 读取可用声线；服务未提供该接口时如实说明，不编造声线。 */
async function 列出声线({ 配置, 请求 = globalThis.fetch, 超时毫秒 = 15000 } = {}) {
  let 规范
  try { 规范 = 校验语音配置({ ...配置, 声线: 配置?.声线 || '占位' }) }
  catch (错误) { return { 成功: false, 原因: 错误 instanceof Error ? 错误.message : '请先配置 AI 语音合成服务' } }
  const 控制器 = new AbortController()
  const 计时 = setTimeout(() => 控制器.abort(), Math.max(1000, Number(超时毫秒) || 15000))
  try {
    const 响应 = await 请求(`${规范.地址}/voices`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...(规范.密钥 ? { Authorization: `Bearer ${规范.密钥}` } : {}) },
      redirect: 'error',
      signal: 控制器.signal,
    })
    if (响应.status === 401 || 响应.status === 403) return { 成功: false, 原因: '语音合成服务鉴权失败，请检查密钥和访问权限' }
    if (响应.status === 429) return { 成功: false, 原因: '语音合成服务请求过于频繁，请稍后再试' }
    if (响应.status === 404 || 响应.status === 400) return { 成功: false, 原因: '语音服务未提供声线列表接口，请手动填写声线标识' }
    if (!响应.ok) return { 成功: false, 原因: `语音合成服务返回错误状态 ${响应.status ?? '未知'}` }
    let 数据
    try { 数据 = await 响应.json() } catch { return { 成功: false, 原因: '语音服务返回的声线列表不是有效 JSON' } }
    const 列表 = Array.isArray(数据?.data) ? 数据.data : Array.isArray(数据?.voices) ? 数据.voices : null
    if (!列表) return { 成功: false, 原因: '语音服务未返回声线列表结构，请手动填写声线标识' }
    const 声线 = 列表.map((项) => ({ 标识: String(项?.id ?? 项?.voice ?? ''), 名称: String(项?.name ?? 项?.id ?? '') })).filter((项) => 项.标识)
    if (!声线.length) return { 成功: false, 原因: '语音服务没有返回任何可用声线' }
    return { 成功: true, 声线 }
  } catch (错误) {
    if (错误?.name === 'AbortError') return { 成功: false, 原因: '语音合成服务响应超时，请检查网络或服务状态' }
    if (错误?.name === 'TypeError' || 错误?.name === 'FetchError') return { 成功: false, 原因: '无法连接语音合成服务，请检查接口地址、网络和服务状态' }
    return { 成功: false, 原因: 错误 instanceof Error ? 错误.message : '声线列表读取失败' }
  } finally { clearTimeout(计时) }
}

module.exports = { 合成语音, 列出声线, 创建语音缓存, 语音缓存键, 最大文本长度 }
