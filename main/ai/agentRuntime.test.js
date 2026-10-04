const { 创建助手服务 } = require('./assistant')

function 环境(回复列表) {
  const 文件 = new Map(), 会话列表 = new Map(), 请求列表 = []
  const 服务 = 创建助手服务({
    配置路径: '配置', 存储: { readFile: async (路径) => { if (!文件.has(路径)) throw Object.assign(new Error('不存在'), { code: 'ENOENT' }); return 文件.get(路径) }, writeFile: async (路径, 内容) => 文件.set(路径, 内容), rename: async (旧, 新) => { 文件.set(新, 文件.get(旧)); 文件.delete(旧) }, unlink: async (路径) => 文件.delete(路径) },
    安全存储: { isEncryptionAvailable: () => true, encryptString: (值) => Buffer.from(值), decryptString: (值) => 值.toString() },
    会话存储: { 读取: async (标识) => 会话列表.get(标识) ?? null, 保存: async (标识, 内容) => 会话列表.set(标识, structuredClone(内容)), 清除: async (标识) => 会话列表.delete(标识) },
    请求: async (_地址, 选项) => { 请求列表.push(JSON.parse(选项.body)); const 消息 = 回复列表.shift(); if (!消息) throw new Error('意外额外请求'); return new Response(JSON.stringify({ choices: [{ message: 消息, finish_reason: 消息.tool_calls ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } }) },
  })
  return { 服务, 会话列表, 请求列表, 准备: () => 服务.保存配置({ 名称: '测试服务', 地址: 'https://example.com/chat/completions', 模型: 'test', 服务商: 'custom' }) }
}
const 调用 = (名称, 参数, id) => ({ role: 'assistant', content: null, reasoning_content: '核对工具参数。', tool_calls: [{ id, type: 'function', function: { name: 名称, arguments: JSON.stringify(参数) } }] })
const 计划 = [{ id: 'read', title: '读取当前文件', status: 'pending' }, { id: 'format', title: '总结并重新排版', status: 'pending' }]
const 上下文 = '文件名称：示例.docx\n文件类型：文字\n文件内容：\n' + JSON.stringify([{ 段落标识: '段落-1', 原文: '原始标题', 类型: 'p', 格式: {} }])

describe('助手原生计划和工具执行', () => {
  it('规划、读取、验证候选和最终回复完成原生工具往返并保存记忆', async () => {
    const 修改 = [{ 种类: '段落排版', 段落标识: '段落-1', 格式: { 标题级别: 1, 对齐: 'center' } }]
    const { 服务, 准备, 请求列表, 会话列表 } = 环境([调用('set_plan', { steps: 计划 }, 'plan-1'), 调用('read_document', { offset: 0, limit: 10 }, 'read-1'), 调用('propose_changes', { 回复: '建议居中排版。', 修改 }, 'edit-1'), { content: '已生成总结和排版候选，请确认。' }])
    await 准备()
    const 执行工具 = vi.fn(async () => ({ 成功: true, 数据: { 候选已生成: true, 修改数量: 1 } }))
    const 推送 = vi.fn()
    const 结果 = await 服务.对话({ 会话标识: 'file:示例.docx', 消息: [{ 角色: 'user', 内容: '帮我总结并重新排版。' }], 文档上下文: 上下文 }, { 执行工具, 推送 })
    expect(请求列表).toHaveLength(4)
    expect(请求列表[0].tools.map((项) => 项.function.name)).toEqual(expect.arrayContaining(['set_plan', 'read_document', 'propose_changes']))
    expect(请求列表[1].messages.find((项) => 项.tool_call_id === 'plan-1').role).toBe('tool')
    expect(请求列表[1].messages.find((项) => 项.tool_calls).reasoning_content).toBe('核对工具参数。')
    expect(执行工具.mock.calls[0][0].参数.修改[0].原文).toBe('原始标题')
    expect(结果.内容).toContain('排版候选')
    expect(结果.计划.at(-1).status).toBe('awaiting_confirmation')
    expect(会话列表.get('file:示例.docx').显示消息.at(-1).内容).toContain('排版候选')
    expect(推送.mock.calls.some(([项]) => 项.类型 === '计划')).toBe(true)
  })

  it('工具失败结果送回模型，纠正后才生成候选', async () => {
    const { 服务, 准备, 请求列表 } = 环境([调用('set_plan', { steps: 计划 }, 'p'), 调用('propose_changes', { 回复: '第一次', 修改: [{ 种类: '文字替换', 查找: '错误原文', 替换为: '新标题' }] }, 'e1'), 调用('propose_changes', { 回复: '纠正原文', 修改: [{ 种类: '文字替换', 查找: '原始标题', 替换为: '新标题' }] }, 'e2'), { content: '纠正后已生成候选。' }])
    await 准备()
    const 执行工具 = vi.fn().mockResolvedValueOnce({ 成功: false, 错误: '未找到需要修改的原文' }).mockResolvedValueOnce({ 成功: true, 数据: { 候选已生成: true } })
    await 服务.对话({ 会话标识: 'test', 消息: [{ 角色: 'user', 内容: '改标题' }], 文档上下文: 上下文 }, { 执行工具 })
    expect(请求列表[2].messages.find((项) => 项.tool_call_id === 'e1').content).toContain('未找到')
    expect(执行工具.mock.calls[1][0].参数.修改).toHaveLength(1)
  })

  it('仅规划模式不能执行修改工具，新对话可清除而后续能恢复历史', async () => {
    const { 服务, 准备, 请求列表 } = 环境([调用('set_plan', { steps: 计划 }, 'p'), { content: '计划已生成。' }, { content: '已记住上轮计划。' }])
    await 准备()
    const 执行工具 = vi.fn()
    await 服务.对话({ 会话标识: 'test', 自动执行: false, 消息: [{ 角色: 'user', 内容: '先规划' }], 文档上下文: 上下文 }, { 执行工具 })
    expect(请求列表[0].tools.map((项) => 项.function.name)).toEqual(['set_plan'])
    expect(执行工具).not.toHaveBeenCalled()
    const 记忆 = await 服务.读取会话('test')
    expect(记忆.显示消息).toHaveLength(2)
    await 服务.对话({ 会话标识: 'test', 消息: [{ 角色: 'user', 内容: '我刚才说了什么？' }], 文档上下文: 上下文 })
    expect(请求列表.at(-1).messages.some((项) => 项.content === '先规划')).toBe(true)
    await 服务.清除会话('test')
    expect(await 服务.读取会话('test')).toBeNull()
  })
})
