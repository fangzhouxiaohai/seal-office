// Zotero 本机文献库只读接入（Local API）。
//
// 为什么必须在主进程发起，而不是渲染进程 fetch：
// Zotero 的 HTTP 服务会拦截浏览器来源的请求（见 zotero 源码
// chrome/content/zotero/xpcom/server.js：user-agent 以 Mozilla/ 开头或带 Origin
// 即判为浏览器请求并直接掐断响应），而 CORS 头只在 Origin 等于书签来源时才添加。
// 因此渲染进程直连 127.0.0.1:23119 必然失败，必须由主进程以非浏览器标识请求。
//
// 接口依据 Zotero 官方文档「Zotero Local API」：
//   基址 http://localhost:23119/api/
//   读请求无需鉴权；未在设置里允许本机应用通信时返回 403
//   用户 ID 传 0 表示本机登录用户
//   format=csljson 可直接导出 CSL-JSON，旧版本不支持时回退 format=json
//   响应头 Zotero-API-Version 与 Zotero-Server-ID 用于识别实例
const 默认基址 = 'http://127.0.0.1:23119'
const 请求超时毫秒 = 10000
const 缓存有效期毫秒 = 5 * 60 * 1000
/** 单次列举上限：避免超大文库把界面拖死，用户可继续搜索 */
const 单次上限 = 200

/** 统一的失败包装：所有对外错误都是中文，且带可用状态码 */
function 失败(状态, 消息) {
  return Object.assign(new Error(消息), { status: 状态 })
}

/** 按状态码给出可操作的中文提示，不把英文报错抛给用户 */
function 状态提示(状态) {
  if (状态 === 403) return 'Zotero 未允许本机应用访问：请在 Zotero 设置 → 高级 中勾选「允许本机其他应用与 Zotero 通信」'
  if (状态 === 400) return 'Zotero 拒绝了该请求参数，请确认 Zotero 版本是否支持该接口'
  if (状态 === 404) return 'Zotero 中没有找到对应数据'
  if (状态 === 501) return '当前 Zotero 版本不支持该导出格式'
  if (状态 === 429) return 'Zotero 请求过于频繁，请稍后再试'
  return `Zotero 返回了错误状态（HTTP ${状态}）`
}

/**
 * 创建 Zotero Local API 客户端。
 * @param 依赖.fetch 注入的请求函数，测试时可替换；默认使用全局 fetch
 * @param 依赖.基址 基址，默认 127.0.0.1:23119
 * @param 依赖.now 注入时钟，便于测试缓存过期
 * @param 依赖.超时 单次请求超时毫秒，默认 10 秒
 */
function createZoteroLocalApi({ fetch: 注入请求, 基址 = 默认基址, now = Date.now, 超时 = 请求超时毫秒 } = {}) {
  const 请求 = 注入请求 ?? ((...参数) => fetch(...参数))
  let 缓存 = null

  /** 发起一次请求并返回 { 状态, 头, 文本 }，不在此处抛业务错误 */
  async function 发送(路径) {
    const 控制器 = new AbortController()
    const 计时器 = setTimeout(() => 控制器.abort(), 超时)
    let 响应
    try {
      响应 = await 请求(`${基址}${路径}`, {
        signal: 控制器.signal,
        // 关键：不能带 Origin，user-agent 也必须是应用自己的标识，否则会被 Zotero 判为浏览器
        headers: { 'User-Agent': 'SealOffice/2.6 (zotero-local-api)', Accept: 'application/json, text/plain' },
      })
    } catch (错误) {
      if (控制器.signal.aborted) throw 失败(504, '连接 Zotero 超时，请确认 Zotero 正在运行')
      throw 失败(502, '无法连接 Zotero，请先启动 Zotero 桌面程序')
    } finally {
      clearTimeout(计时器)
    }
    const 文本 = typeof 响应.text === 'function' ? await 响应.text() : ''
    return { 状态: 响应.status, 头: 响应.headers ?? {}, 文本 }
  }

  function 取头(头, 名称) {
    if (!头) return ''
    if (typeof 头.get === 'function') return 头.get(名称) ?? ''
    const 键 = Object.keys(头).find((项) => 项.toLowerCase() === 名称.toLowerCase())
    return 键 ? String(头[键]) : ''
  }

  /** 探测连接状态：读 /api/ 拿版本与实例标识 */
  async function 探测() {
    const { 状态, 头, 文本 } = await 发送('/api/')
    if (状态 === 403) throw 失败(403, 状态提示(403))
    if (状态 !== 200) throw 失败(状态, 状态提示(状态))
    const 版本 = 取头(头, 'Zotero-API-Version') || '3'
    const 实例 = 取头(头, 'Zotero-Server-ID') || ''
    let 结果 = null
    if (文本.trim()) {
      try { 结果 = JSON.parse(文本) } catch { 结果 = null }
    }
    const 会话 = { 版本, 实例, 时间: now() }
    缓存 = { ...(缓存 ?? {}), 会话 }
    return { 版本, 实例, ...(结果 ? { 信息: 结果 } : {}) }
  }

  /** 取缓存中的会话；实例变化视为换了文库，直接作废 */
  async function 取会话() {
    if (缓存?.会话 && now() - 缓存.会话.时间 < 缓存有效期毫秒) return 缓存.会话
    return 探测()
  }

  /** 列举条目；format=csljson 不可用时回退 format=json 由渲染层映射 */
  async function 列条目({ 关键词 = '', 集合, 上限 = 单次上限 } = {}) {
    const 会话 = await 取会话()
    const 数量 = Number.isSafeInteger(上限) && 上限 > 0 ? Math.min(上限, 单次上限) : 单次上限
    const 路径 = 集合
      ? `/api/users/0/collections/${encodeURIComponent(集合)}/items/top`
      : '/api/users/0/items/top'
    const 查询 = new URLSearchParams({ limit: String(数量) })
    if (关键词.trim()) 查询.set('q', 关键词.trim())
    查询.set('format', 'csljson')

    const 一次 = await 发送(`${路径}?${查询.toString()}`)
    if (一次.状态 === 200) {
      return { 格式: 'csljson', 会话, 条目: 解析数组(一次.文本, 'csljson') }
    }
    if (一次.状态 === 400 || 一次.状态 === 501) {
      // 旧版 Zotero 的 Local API 不支持 csljson，退回标准 JSON 由渲染层本地映射
      查询.set('format', 'json')
      const 二次 = await 发送(`${路径}?${查询.toString()}`)
      if (二次.状态 !== 200) throw 失败(二次.状态, 状态提示(二次.状态))
      return { 格式: 'json', 会话, 条目: 解析数组(二次.文本, 'json') }
    }
    if (一次.状态 === 403) throw 失败(403, 状态提示(403))
    throw 失败(一次.状态, 状态提示(一次.状态))
  }

  function 解析数组(文本, 格式) {
    let 数据
    try { 数据 = JSON.parse(文本) } catch { throw 失败(502, `Zotero 返回的 ${格式} 数据无法解析`) }
    if (!Array.isArray(数据)) throw 失败(502, `Zotero 返回的 ${格式} 数据格式已变化，请更新客户端`)
    return 数据
  }

  /** 列举分类（合集），用于按分类筛选 */
  async function 列集合() {
    const 会话 = await 取会话()
    const { 状态, 文本 } = await 发送('/api/users/0/collections?limit=' + 单次上限)
    if (状态 === 403) throw 失败(403, 状态提示(403))
    if (状态 !== 200) throw 失败(状态, 状态提示(状态))
    return { 会话, 集合: 解析数组(文本, 'json') }
  }

  return { 探测, 列条目, 列集合 }
}

module.exports = { createZoteroLocalApi, 状态提示, 默认基址, 单次上限 }
