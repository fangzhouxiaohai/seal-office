// 不带 node: 前缀，才能被移动端打包的别名（fs / path / crypto → shim）接管。
const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')

// Zotero 中文社区（zotero-chinese.com）资料代理。
//
// 为什么必须由主进程/原生层发起：站点没有返回 Access-Control-Allow-Origin，
// 浏览器直连会被跨域策略拦下；各端 WebView 的 file:// 页面更拿不到原文。
//
// 安全边界：只访问这一个域名，只允许 GET，只放行 llms.txt 与 .md 原文，
// 因此这不是通用反向代理，不能被用来转发任意地址。
const HOST = 'zotero-chinese.com'
const MAX_BYTES = 2 * 1024 * 1024
const CACHE_TTL = 24 * 60 * 60 * 1000
const MARKDOWN = /^\/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\.md$/

const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }

/** 文档路由 → 原文地址。站点把 /a/b 的 Markdown 放在 /ab.md。 */
function markdownPath(route) {
  if (typeof route !== 'string') fail(400, '资料路径无效')
  const clean = route.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!clean || clean.length > 200) fail(400, '资料路径无效')
  if (!/^[A-Za-z0-9/_-]+$/.test(clean)) fail(400, '资料路径只能包含字母、数字与连字符')
  const pathname = '/' + clean.replace(/\//g, '') + '.md'
  if (!MARKDOWN.test(pathname)) fail(400, '资料路径无效')
  return pathname
}

/**
 * @param fetchText 注入的纯文本获取函数 (url) => Promise<string>。
 *   桌面由主进程提供，移动端由原生桥接提供，因此本模块不依赖 node:https，
 *   也就不会把 Node 内置模块打进移动端产物。
 */
function createZoteroDocs({ cacheDirectory, fetchText } = {}) {
  if (typeof fetchText !== 'function') throw new Error('缺少资料获取通道，无法启用 Zotero 百科')
  const cacheDir = cacheDirectory || null
  const memory = new Map()
  const cacheFile = key => path.join(cacheDir, createHash('sha256').update(key).digest('hex') + '.json')

  function cached(key) {
    const hit = memory.get(key)
    if (hit && hit.expires > Date.now()) return hit.value
    if (!cacheDir) return null
    try {
      const record = JSON.parse(fs.readFileSync(cacheFile(key), 'utf8'))
      if (record.expires > Date.now()) { memory.set(key, record); return record.value }
    } catch { /* 缓存缺失或损坏都不影响在线获取 */ }
    return null
  }
  function store(key, value) {
    const record = { expires: Date.now() + CACHE_TTL, value }
    memory.set(key, record)
    if (!cacheDir) return
    try {
      fs.mkdirSync(cacheDir, { recursive: true })
      fs.writeFileSync(cacheFile(key), JSON.stringify(record))
    } catch { /* 缓存写入失败只是少了加速，不向用户报错 */ }
  }

  async function fetchOnce(pathname) {
    const hit = cached(pathname)
    if (hit !== null) return hit
    const url = `https://${HOST}${pathname}`
    let text
    try { text = await fetchText(url) }
    catch (error) {
      const status = error && error.status
      if (status === 404) fail(404, '资料条目不存在')
      if (status === 504) fail(504, '资料站点响应超时，请稍后重试')
      fail(502, '无法连接资料站点，请检查网络后重试')
    }
    if (typeof text !== 'string' || !text.length) fail(502, '资料站点返回了空内容')
    if (Buffer.byteLength(text) > MAX_BYTES) fail(413, '资料条目过大')
    store(pathname, text)
    return text
  }

  return {
    /** 目录：llms.txt 由站点官方维护，条目顺序即推荐阅读顺序。 */
    async index() {
      const text = await fetchOnce('/llms.txt')
      const items = []
      for (const line of text.split(/\r?\n/)) {
        const match = /^-\s+\[([^\]]+)\]\((\/[^)]+?\.md)\)(?::\s*(.+))?$/.exec(line.trim())
        if (!match) continue
        const route = match[2].replace(/^\//, '').replace(/\.md$/, '').replace(/\//g, '')
        if (!MARKDOWN.test('/' + route + '.md')) continue
        items.push({ title: match[1].trim(), route, summary: (match[3] || '').trim() })
      }
      if (!items.length) fail(502, '资料目录格式已变化，请更新客户端')
      return { items, source: `https://${HOST}`, updated: new Date().toISOString() }
    },
    /** 正文：去掉 VitePress 的 front-matter，保留 Markdown 原文。 */
    async read({ route } = {}) {
      const pathname = markdownPath(route)
      const text = await fetchOnce(pathname)
      const markdown = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()
      if (!markdown) fail(502, '资料条目内容为空')
      return { route, markdown, source: `https://${HOST}${pathname}` }
    },
  }
}

module.exports = { createZoteroDocs, markdownPath, HOST }
