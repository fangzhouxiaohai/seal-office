const { markdownPath, createZoteroDocs } = require('./zoteroDocs')

describe('Zotero 资料路径白名单', () => {
  it('把文档路由映射为站点的 Markdown 原文地址', () => {
    expect(markdownPath('user-guide/plugins/jasminum')).toBe('/user-guidepluginsjasminum.md')
    expect(markdownPath('/user-guide/faqs/caj2pdf/')).toBe('/user-guidefaqscaj2pdf.md')
    expect(markdownPath('about')).toBe('/about.md')
  })

  it('拒绝越权路径，避免被当作通用反向代理', () => {
    for (const bad of ['../secret', 'a/b?x=1', 'a/b#frag', 'a b', 'a/b\\c', '', '/', 'x'.repeat(201), 'a:b', 'a/b/c/../../../etc/passwd']) {
      expect(() => markdownPath(bad)).toThrow()
    }
    for (const bad of [null, undefined, 42, {}, []]) expect(() => markdownPath(bad)).toThrow()
  })
})

describe('Zotero 资料读取', () => {
  const indexText = [
    '# Zotero 中文社区',
    '- [茉莉花](/user-guidepluginsjasminum.md)',
    '- [关于 Zotero 插件](/user-guidepluginsabout-plugin.md): 插件说明',
    '- [越权条目](/..%2fetc%2fpasswd.md)',
  ].join('\n')

  function fakeFetch(pages) {
    return async url => {
      const pathname = new URL(url).pathname
      if (!(pathname in pages)) throw Object.assign(new Error('not found'), { status: 404 })
      return pages[pathname]
    }
  }

  it('解析目录时带出标题与摘要，并过滤不合规路径', async () => {
    const docs = createZoteroDocs({ fetchText: fakeFetch({ '/llms.txt': indexText }) })
    const { items, source } = await docs.index()
    expect(source).toBe('https://zotero-chinese.com')
    expect(items.map(item => item.title)).toEqual(['茉莉花', '关于 Zotero 插件'])
    expect(items[1].summary).toBe('插件说明')
    expect(items[0].route).toBe('user-guidepluginsjasminum')
  })

  it('读取正文时去掉 front-matter 并保留 Markdown', async () => {
    const docs = createZoteroDocs({
      fetchText: fakeFetch({ '/user-guidepluginsjasminum.md': '---\nurl: /x.md\n---\n\n# 茉莉花\n\n正文内容' }),
    })
    const result = await docs.read({ route: 'user-guide/plugins/jasminum' })
    expect(result.markdown).toBe('# 茉莉花\n\n正文内容')
    expect(result.source).toBe('https://zotero-chinese.com/user-guidepluginsjasminum.md')
  })

  it('条目不存在与目录格式异常都给出明确中文错误', async () => {
    const missing = createZoteroDocs({ fetchText: fakeFetch({}) })
    await expect(missing.read({ route: 'about' })).rejects.toMatchObject({ status: 404, message: '资料条目不存在' })
    const broken = createZoteroDocs({ fetchText: fakeFetch({ '/llms.txt': '没有任何条目的文本' }) })
    await expect(broken.index()).rejects.toMatchObject({ status: 502 })
  })

  it('缺少获取通道时直接拒绝构造，避免运行时静默失败', () => {
    expect(() => createZoteroDocs({})).toThrow('缺少资料获取通道')
  })
})
