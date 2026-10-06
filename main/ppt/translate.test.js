const { 翻译条目, 校验译文可应用 } = require('./translate')

const 条目 = (标识, 原文) => ({ 对象标识: 标识, 原文, 来源: `第 1 页/${标识}` })
const 模型返回 = (映射) => async () => JSON.stringify({ 译文: Object.entries(映射).map(([对象标识, 译文]) => ({ 对象标识, 译文 })) })

describe('演示翻译编排', () => {
  it('按对象标识发送原文并返回结构化译文', async () => {
    const 调用模型 = vi.fn(模型返回({ 甲: 'Hello', 乙: 'World' }))
    const 结果 = await 翻译条目({ 条目: [条目('甲', '你好'), 条目('乙', '世界')], 目标语言: 'en', 调用模型 })
    expect(结果.译文).toEqual([
      { 对象标识: '甲', 原文: '你好', 译文: 'Hello' },
      { 对象标识: '乙', 原文: '世界', 译文: 'World' },
    ])
    expect(结果.批次).toBe(1)
    expect(调用模型).toHaveBeenCalledTimes(1)
    const 请求 = 调用模型.mock.calls[0][0]
    expect(请求.系统提示).toContain('JSON')
    expect(请求.用户内容).toContain('en')
    expect(请求.用户内容).toContain('甲')
    expect(请求.用户内容).toContain('你好')
  })

  it('按条数分批，每批只包含本批对象标识，术语表随请求发送', async () => {
    const 调用模型 = vi.fn(async ({ 用户内容 }) => {
      const 数据 = JSON.parse(用户内容.slice(用户内容.indexOf('{')))
      return JSON.stringify({ 译文: 数据.条目.map((项) => ({ 对象标识: 项.对象标识, 译文: 'T-' + 项.对象标识 })) })
    })
    const 清单 = ['a', 'b', 'c', 'd', 'e'].map((标识) => 条目(标识, `原文-${标识}`))
    const 结果 = await 翻译条目({ 条目: 清单, 目标语言: 'ja', 每批条数: 2, 术语表: [{ 原文: '海豹', 译文: 'アザラシ' }], 调用模型 })
    expect(结果.批次).toBe(3)
    expect(调用模型).toHaveBeenCalledTimes(3)
    expect(结果.译文.map((项) => 项.对象标识)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(结果.译文[4].译文).toBe('T-e')
    expect(调用模型.mock.calls[0][0].用户内容).toContain('アザラシ')
  })

  it('模型漏掉对象、返回重复或无关标识时拒绝，不产生部分结果', async () => {
    await expect(翻译条目({ 条目: [条目('甲', '一'), 条目('乙', '二')], 目标语言: 'en', 调用模型: 模型返回({ 甲: 'One' }) }))
      .rejects.toThrow('缺少对象标识：乙')
    await expect(翻译条目({ 条目: [条目('甲', '一'), 条目('乙', '二')], 目标语言: 'en', 调用模型: 模型返回({ 甲: 'One', 乙: 'Two' }) }))
      .resolves.toBeTruthy()
    const 重复 = async () => JSON.stringify({ 译文: [{ 对象标识: '甲', 译文: 'A' }, { 对象标识: '甲', 译文: 'B' }] })
    await expect(翻译条目({ 条目: [条目('甲', '一')], 目标语言: 'en', 调用模型: 重复 })).rejects.toThrow('重复对象标识：甲')
    const 越界 = async () => JSON.stringify({ 译文: [{ 对象标识: '甲', 译文: 'A' }, { 对象标识: '丙', 译文: 'C' }] })
    await expect(翻译条目({ 条目: [条目('甲', '一')], 目标语言: 'en', 调用模型: 越界 })).rejects.toThrow('不属于请求批次')
  })

  it('模型被截断或返回非 JSON 时报真实原因且不覆盖原文', async () => {
    await expect(翻译条目({ 条目: [条目('甲', '一')], 目标语言: 'en', 调用模型: async () => '{"译文":[{"对象标识":"甲","译' }))
      .rejects.toThrow('译文格式无效')
    await expect(翻译条目({ 条目: [条目('甲', '一')], 目标语言: 'en', 调用模型: async () => '抱歉，我无法完成。' }))
      .rejects.toThrow('译文格式无效')
  })

  it('译文为空但原文非空时拒绝写入', async () => {
    await expect(翻译条目({ 条目: [条目('甲', '一')], 目标语言: 'en', 调用模型: 模型返回({ 甲: '' }) })).rejects.toThrow('译文为空')
    await expect(翻译条目({ 条目: [条目('甲', '一')], 目标语言: 'en', 调用模型: 模型返回({ 甲: '   ' }) })).rejects.toThrow('译文为空')
  })

  it('停止后抛出停止原因且保留已完成批次可追溯', async () => {
    const 控制器 = new AbortController()
    const 调用模型 = vi.fn(async () => { 控制器.abort(); return JSON.stringify({ 译文: [{ 对象标识: 'a', 译文: 'A' }] }) })
    await expect(翻译条目({ 条目: [条目('a', '甲')], 目标语言: 'en', 调用模型, 信号: 控制器.signal })).rejects.toThrow('已停止生成')
  })

  it('没有模型调用入口时明确拒绝，绝不用固定词库代替', async () => {
    await expect(翻译条目({ 条目: [条目('甲', '一')], 目标语言: 'en' })).rejects.toThrow('必须调用 AI 模型服务')
    await expect(翻译条目({ 条目: [], 目标语言: 'en', 调用模型: async () => '{}' })).rejects.toThrow('没有需要翻译的内容')
    await expect(翻译条目({ 条目: [条目('甲', '一')], 目标语言: '', 调用模型: async () => '{}' })).rejects.toThrow('目标语言')
    await expect(翻译条目({ 条目: [条目('', '一')], 目标语言: 'en', 调用模型: async () => '{}' })).rejects.toThrow('对象标识')
    await expect(翻译条目({ 条目: [条目('甲', ''), 条目('甲', '二')], 目标语言: 'en', 调用模型: async () => '{}' })).rejects.toThrow('重复')
  })
})

describe('译文应用前的原内容核对', () => {
  it('原文发生变化时阻止覆盖', () => {
    const 候选 = [{ 对象标识: '甲', 原文: '旧文本', 译文: 'Old' }]
    expect(() => 校验译文可应用(候选, [{ 对象标识: '甲', 原文: '新文本' }])).toThrow('原文已变化')
    expect(() => 校验译文可应用(候选, [{ 对象标识: '乙', 原文: '旧文本' }])).toThrow('对象已不存在')
    expect(校验译文可应用(候选, [{ 对象标识: '甲', 原文: '旧文本' }])).toEqual([{ 对象标识: '甲', 原文: '旧文本', 译文: 'Old' }])
  })
})
