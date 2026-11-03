const { createZoteroLocalApi, 状态提示, 单次上限 } = require('./localApi')

/**
 * 造一个只返回预设响应的假 fetch，并记录每次请求。
 * 匹配项以 / 结尾时按路径结尾精确匹配，避免探测用的 /api/ 把条目请求也吃掉。
 */
function 造假请求(表) {
  const 记录 = []
  const 请求 = async (url, 选项 = {}) => {
    记录.push({ url, 选项 })
    for (const [匹配, 响应] of 表) {
      const 命中 = 匹配.endsWith('/') ? url.endsWith(匹配) : url.includes(匹配)
      if (命中) {
        const 结果 = typeof 响应 === 'function' ? 响应(url) : 响应
        return {
          status: 结果.status ?? 200,
          headers: 结果.headers ?? {},
          text: async () => (typeof 结果.body === 'string' ? 结果.body : JSON.stringify(结果.body ?? '')),
        }
      }
    }
    return { status: 404, headers: {}, text: async () => '' }
  }
  return { 请求, 记录 }
}

const 会话头 = { 'Zotero-API-Version': '3', 'Zotero-Server-ID': 'sPMHtLD6HHBd' }

describe('Zotero Local API 探测', () => {
  it('读取版本与实例标识', async () => {
    const { 请求 } = 造假请求([['/api/', { headers: 会话头, body: { version: 3 } }]])
    const 客户端 = createZoteroLocalApi({ fetch: 请求 })
    expect(await 客户端.探测()).toEqual({ 版本: '3', 实例: 'sPMHtLD6HHBd', 信息: { version: 3 } })
  })

  it('未开启本机通信时提示具体开关位置', async () => {
    const { 请求 } = 造假请求([['/api/', { status: 403 }]])
    const 客户端 = createZoteroLocalApi({ fetch: 请求 })
    await expect(客户端.探测()).rejects.toThrow('请在 Zotero 设置 → 高级 中勾选')
  })

  it('Zotero 未启动时提示先启动程序', async () => {
    const 客户端 = createZoteroLocalApi({ fetch: async () => { throw new Error('ECONNREFUSED') } })
    await expect(客户端.探测()).rejects.toThrow('请先启动 Zotero 桌面程序')
  })

  it('请求头不带 Origin，且使用应用自己的 UA', async () => {
    const { 请求, 记录 } = 造假请求([['/api/', { headers: 会话头, body: {} }]])
    await createZoteroLocalApi({ fetch: 请求 }).探测()
    const 头 = 记录[0].选项.headers
    expect(头['User-Agent']).toContain('SealOffice/')
    expect(头['User-Agent'].startsWith('Mozilla/')).toBe(false)
    expect(Object.keys(头).some((键) => 键.toLowerCase() === 'origin')).toBe(false)
  })

  it('超时提示为中文', async () => {
    const 客户端 = createZoteroLocalApi({
      超时: 10,
      fetch: (_url, 选项) => new Promise((_完成, 拒绝) => {
        选项.signal.addEventListener('abort', () => 拒绝(new Error('aborted')))
      }),
    })
    await expect(客户端.探测()).rejects.toThrow('连接 Zotero 超时')
  })
})

describe('Zotero 条目列举', () => {
  it('优先使用 csljson，直接得到 CSL 条目', async () => {
    const { 请求, 记录 } = 造假请求([
      ['/api/', { headers: 会话头, body: {} }],
      ['format=csljson', { headers: 会话头, body: [{ id: 'A', type: 'book', title: '题名' }] }],
    ])
    const 结果 = await createZoteroLocalApi({ fetch: 请求 }).列条目({})
    expect(结果.格式).toBe('csljson')
    expect(结果.条目).toHaveLength(1)
    expect(记录.some((项) => 项.url.includes('format=csljson'))).toBe(true)
  })

  it('csljson 不可用时回退标准 JSON', async () => {
    const { 请求, 记录 } = 造假请求([
      ['/api/', { headers: 会话头, body: {} }],
      ['format=csljson', { status: 400 }],
      ['format=json', { headers: 会话头, body: [{ key: 'K1', data: { itemType: 'book', title: 'T' } }] }],
    ])
    const 结果 = await createZoteroLocalApi({ fetch: 请求 }).列条目({})
    expect(结果.格式).toBe('json')
    expect(结果.条目[0].key).toBe('K1')
    expect(记录.filter((项) => 项.url.includes('format=')).length).toBe(2)
  })

  it('关键词进入 q 参数并被编码', async () => {
    const { 请求, 记录 } = 造假请求([
      ['/api/', { headers: 会话头, body: {} }],
      ['format=csljson', { headers: 会话头, body: [] }],
    ])
    await createZoteroLocalApi({ fetch: 请求 }).列条目({ 关键词: '中文 文献' })
    // URLSearchParams 把空格编码为 +，解码后应还原为中文关键词
    expect(decodeURIComponent(记录[1].url).replace(/\+/g, ' ')).toContain('q=中文 文献')
  })

  it('指定分类时走分类条目接口', async () => {
    const { 请求, 记录 } = 造假请求([
      ['/api/', { headers: 会话头, body: {} }],
      ['/collections/COLL1/items/top', { headers: 会话头, body: [] }],
    ])
    await createZoteroLocalApi({ fetch: 请求 }).列条目({ 集合: 'COLL1' })
    expect(记录[1].url).toContain('/collections/COLL1/items/top')
  })

  it('上限被夹到安全范围', async () => {
    const { 请求, 记录 } = 造假请求([
      ['/api/', { headers: 会话头, body: {} }],
      ['format=csljson', { headers: 会话头, body: [] }],
    ])
    const 客户端 = createZoteroLocalApi({ fetch: 请求 })
    await 客户端.列条目({ 上限: 100000 })
    expect(记录[1].url).toContain(`limit=${单次上限}`)
    await 客户端.列条目({ 上限: -3 })
    expect(记录[记录.length - 1].url).toContain(`limit=${单次上限}`)
  })

  it('返回非法 JSON 时提示格式已变化', async () => {
    const { 请求 } = 造假请求([
      ['/api/', { headers: 会话头, body: {} }],
      ['format=csljson', { headers: 会话头, body: '这不是 JSON' }],
    ])
    await expect(createZoteroLocalApi({ fetch: 请求 }).列条目({})).rejects.toThrow('无法解析')
  })

  it('返回对象而非数组时提示格式已变化', async () => {
    const { 请求 } = 造假请求([
      ['/api/', { headers: 会话头, body: {} }],
      ['format=csljson', { headers: 会话头, body: { 错误: 1 } }],
    ])
    await expect(createZoteroLocalApi({ fetch: 请求 }).列条目({})).rejects.toThrow('格式已变化')
  })
})

describe('连接会话与缓存', () => {
  it('同一实例在有效期内复用探测结果', async () => {
    const { 请求, 记录 } = 造假请求([
      ['/api/', { headers: 会话头, body: {} }],
      ['format=csljson', { headers: 会话头, body: [] }],
    ])
    let 时间 = 0
    const 客户端 = createZoteroLocalApi({ fetch: 请求, now: () => 时间 })
    await 客户端.列条目({})
    await 客户端.列条目({})
    expect(记录.filter((项) => 项.url.endsWith('/api/')).length).toBe(1)
    时间 = 6 * 60 * 1000
    await 客户端.列条目({})
    expect(记录.filter((项) => 项.url.endsWith('/api/')).length).toBe(2)
  })

  it('实例标识变化时清掉缓存重新探测', async () => {
    let 实例 = 'A'
    const { 请求 } = 造假请求([
      ['/api/', () => ({ headers: { 'Zotero-API-Version': '3', 'Zotero-Server-ID': 实例 }, body: {} })],
      ['format=csljson', { headers: {}, body: [] }],
    ])
    const 客户端 = createZoteroLocalApi({ fetch: 请求 })
    const 首个 = await 客户端.列条目({})
    expect(首个.会话.实例).toBe('A')
    实例 = 'B'
    // 过期后重新探测应拿到新实例，调用方据此丢弃旧的条目缓存
    const 第二个 = await createZoteroLocalApi({ fetch: 请求, now: () => Date.now() + 10 * 60 * 1000 }).列条目({})
    expect(第二个.会话.实例).toBe('B')
  })
})

describe('分类列举', () => {
  it('返回合集列表', async () => {
    const { 请求 } = 造假请求([
      ['/api/', { headers: 会话头, body: {} }],
      ['/collections?', { headers: 会话头, body: [{ key: 'C1', data: { name: '分类一' } }] }],
    ])
    const 结果 = await createZoteroLocalApi({ fetch: 请求 }).列集合()
    expect(结果.集合).toHaveLength(1)
  })
})

describe('状态码提示', () => {
  it('所有常见状态都有中文提示', () => {
    for (const 状态 of [400, 403, 404, 429, 500, 501]) {
      expect(状态提示(状态)).toMatch(/[\u4e00-\u9fa5]/)
    }
  })
})
