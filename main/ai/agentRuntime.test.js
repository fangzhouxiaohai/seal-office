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
  it('工具逐行记录开始与结束，绑定步骤按真实读取和候选结果更新并持久保留', async () => {
    const 步骤 = [...计划, { id: 'future', title: '下一阶段另行处理', status: 'pending' }]
    const 修改 = [{ 种类: '文字替换', 查找: '原始标题', 替换为: '新标题' }]
    const e = 环境([
      调用('set_plan', { steps: 步骤 }, 'p'),
      调用('read_document', { offset: 0, limit: 10, step_id: 'read' }, 'r'),
      调用('propose_changes', { 回复: '候选', 修改, step_id: 'format' }, 'e'),
      调用('set_plan', { steps: [{ ...步骤[0], status: 'completed' }, { ...步骤[1], status: 'completed' }, 步骤[2]] }, 'p2'),
      { content: '候选已生成，请确认。' },
    ])
    await e.准备()
    const 推送 = vi.fn(), 执行工具 = vi.fn(async () => ({ 成功: true, 数据: { 候选已生成: true } }))
    const 结果 = await e.服务.对话({ 会话标识: '逐行', 消息: [{ 角色: 'user', 内容: '读取并修改标题，后续再做下一阶段' }], 文档上下文: 上下文 }, { 执行工具, 推送 })
    expect(e.请求列表[0].messages[0].content).toContain('复杂任务')
    expect(e.请求列表[0].tools.find((项) => 项.function.name === 'read_document').function.parameters.properties.step_id).toBeDefined()
    expect(结果.计划.map((项) => 项.status)).toEqual(['completed', 'awaiting_confirmation', 'pending'])
    expect(推送.mock.calls.filter(([项]) => 项.类型 === '工具' && 项.调用标识 === 'r').map(([项]) => 项.执行状态)).toEqual(['执行中', '完成'])
    expect(推送.mock.calls.filter(([项]) => 项.类型 === '计划').map(([项]) => JSON.parse(项.内容)[0].status)).toEqual(expect.arrayContaining(['in_progress', 'completed']))
    const 记录 = e.会话列表.get('逐行').显示消息.at(-1).执行记录
    expect(记录).toHaveLength(4)
    expect(记录.every((项) => 项.状态 === '完成')).toBe(true)
    expect(记录.find((项) => 项.id === 'e').详情).toContain('尚未写入或保存')
  })

  it('工具实际失败使绑定步骤和执行行失败，模型纠正后同一步骤更新为等待确认', async () => {
    const 修改 = [{ 种类: '文字替换', 查找: '原始标题', 替换为: '新标题' }]
    const e = 环境([调用('set_plan', { steps: 计划 }, 'p'), 调用('propose_changes', { 回复: '第一次', 修改, step_id: 'format' }, 'bad'), 调用('propose_changes', { 回复: '纠正', 修改, step_id: 'format' }, 'good'), { content: '已纠正，请确认。' }])
    await e.准备()
    const 推送 = vi.fn(), 执行工具 = vi.fn().mockResolvedValueOnce({ 成功: false, 错误: '原文不匹配' }).mockResolvedValueOnce({ 成功: true, 数据: { 候选已生成: true } })
    const 结果 = await e.服务.对话({ 会话标识: '纠正', 消息: [{ 角色: 'user', 内容: '修改标题' }], 文档上下文: 上下文 }, { 执行工具, 推送 })
    expect(结果.计划[1].status).toBe('awaiting_confirmation')
    expect(推送.mock.calls.filter(([项]) => 项.类型 === '计划').some(([项]) => JSON.parse(项.内容)[1].status === 'failed')).toBe(true)
    expect(e.会话列表.get('纠正').显示消息.at(-1).执行记录.find((项) => 项.id === 'bad')).toMatchObject({ 状态: '失败', 详情: '原文不匹配' })
    expect(e.会话列表.get('纠正').显示消息.at(-1).执行记录.find((项) => 项.id === 'good').状态).toBe('完成')
  })

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


describe('创建、引导和有界执行', () => {
  it('引导修订用完整新候选替换旧候选，同名新文件只创建一次', async () => {
    const 初稿 = [{ 种类: '创建文件', 类型: 'word', 名称: '计划.docx', 内容: '原始计划' }]
    const 定稿 = [{ ...初稿[0], 内容: '计划包含追加交付日期' }]
    const { 服务, 准备, 会话列表 } = 环境([调用('set_plan', { steps: 计划 }, 'p'), 调用('propose_changes', { 回复: '初稿', 修改: 初稿 }, 'e1'), { content: '等待确认' }, 调用('propose_changes', { 回复: '按引导更新', 替换候选: true, 修改: 定稿 }, 'e2'), { content: '更新完成，请确认' }])
    await 准备()
    let 已用 = false
    const 执行工具 = vi.fn(async () => ({ 成功: true, 数据: { 候选已生成: true } }))
    const 结果 = await 服务.对话({ 会话标识: 'revision', 消息: [{ 角色: 'user', 内容: '创建计划' }] }, { 执行工具, 读取引导: end => end && !已用 ? (已用 = true, ['增加交付日期']) : [] })
    expect(执行工具.mock.calls[1][0].参数.修改).toEqual(定稿)
    expect(JSON.parse(结果.内容).修改).toEqual(定稿)
    expect(会话列表.get('revision').待确认候选.修改).toEqual(定稿)
  })
  it('无文件新建完整候选持久保存，需要确认后才能开始下一任务', async () => {
    const 修改 = [{ 种类: '创建文件', 类型: 'word', 名称: '计划.docx', 内容: '实际计划正文' }]
    const { 服务, 准备, 会话列表 } = 环境([调用('set_plan', { steps: 计划 }, 'p'), 调用('propose_changes', { 回复: '新建候选', 修改 }, 'e'), { content: '请确认新文件候选' }])
    await 准备()
    await 服务.对话({ 会话标识: 'general', 消息: [{ 角色: 'user', 内容: '新建计划' }] }, { 执行工具: async () => ({ 成功: true, 数据: { 候选已生成: true } }) })
    expect(会话列表.get('general').待确认候选).toMatchObject({ 修改, 文件快照: null })
    await expect(服务.对话({ 会话标识: 'general', 消息: [{ 角色: 'user', 内容: '重新生成' }] })).rejects.toThrow('确认或放弃')
  })
  it('终端回复前收到的引导继续同一任务，保留累计候选而不重发第一批', async () => {
    const 修改 = [{ 种类: '文字替换', 查找: '原始标题', 替换为: '正式标题' }]
    const { 服务, 准备, 请求列表, 会话列表 } = 环境([调用('set_plan', { steps: 计划 }, 'p'), 调用('propose_changes', { 回复: '候选', 修改 }, 'e1'), { content: '完成第一部分' }, 调用('propose_changes', { 回复: '追加候选', 修改: [{ 种类: '文字插入', 位置: '末尾', 内容: '预算100元' }] }, 'e2'), { content: '已结合预算，请确认' }])
    await 准备()
    let used = false
    const 执行工具 = vi.fn(async () => ({ 成功: true, 数据: { 候选已生成: true } }))
    const result = await 服务.对话({ 会话标识: 'test', 消息: [{ 角色: 'user', 内容: '改标题' }], 文档上下文: 上下文 }, { 执行工具, 读取引导: (end) => end && !used ? (used = true, ['追加预算100元']) : [] })
    expect(请求列表).toHaveLength(5)
    expect(请求列表[3].messages.at(-1).content).toContain('追加预算100元')
    expect(执行工具.mock.calls[1][0].参数.修改).toHaveLength(2)
    expect(JSON.parse(result.内容).修改).toHaveLength(2)
    expect(会话列表.get('test').显示消息.some(m => m.内容.includes('补充引导：追加预算'))).toBe(true)
  })
  it('不断变换工具参数的循环也在48轮停止并保留错误', async () => {
    const 回复 = Array.from({ length: 60 }, (_, i) => 调用('set_plan', { steps: [{ id: `step-${i}`, title: `步骤${i}`, status: 'pending' }] }, `call-${i}`))
    const { 服务, 准备, 请求列表, 会话列表 } = 环境(回复)
    await 准备()
    await expect(服务.对话({ 会话标识: 'loop', 消息: [{ 角色: 'user', 内容: '连续处理' }] })).rejects.toThrow('48轮')
    expect(请求列表).toHaveLength(48)
    expect(会话列表.get('loop').最近任务错误).toContain('48轮')
  })
  it('手动压缩保持候选和计划，并保留完整显示记录', async () => {
    const { 服务, 准备, 会话列表 } = 环境([{ content: '历史摘要：原目标写预算；未确认候选保留。' }])
    await 准备()
    const 模型消息 = Array.from({ length: 4 }, (_, i) => [{ role: 'user', content: `需求${i}` }, { role: 'assistant', content: `回复${i}` }]).flat()
    const 候选 = { 回复: '候选', 修改: [{ 种类: '文字插入', 位置: '末尾', 内容: '预算' }], 文件快照: '原快照' }
    会话列表.set('compact', { 模型消息, 显示消息: [{ 角色: 'user', 内容: '完整对话保留' }], 计划, 摘要: '', 压缩次数: 0, 待确认候选: 候选 })
    const result = await 服务.对话({ 会话标识: 'compact', 手动压缩: true, 消息: [{ 角色: 'user', 内容: '/compact' }] })
    expect(result.压缩次数).toBe(1)
    expect(会话列表.get('compact').待确认候选).toEqual(候选)
    expect(会话列表.get('compact').计划).toEqual(计划)
    expect(会话列表.get('compact').显示消息[0].内容).toBe('完整对话保留')
  })
})
