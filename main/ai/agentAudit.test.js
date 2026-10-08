const { EventEmitter } = require('events')
const { 创建助手服务 } = require('./assistant')
const { 创建文件资料 } = require('./agentRuntime')
const { 估算令牌 } = require('./sessionMemory')
const { 注册智能助手通道 } = require('../ipc/aiChannel')

const 会话标识 = 'audit:当前文件'
const 计划 = [{ id: 'read', title: '读取当前文件', status: 'pending' }, { id: 'format', title: '核对并生成排版候选', status: 'pending' }]
const 原始条目 = [{ 段落标识: '段落-1', 原文: '原始标题', 类型: 'p', 格式: {} }, { 段落标识: '段落-2', 原文: '原始正文', 类型: 'p', 格式: {} }]
const 文件上下文 = (条目 = 原始条目) => '文件名称：审计.docx\n文件类型：文字\n文件内容：\n' + JSON.stringify(条目)
const 文件快照 = '<section data-audit-snapshot="仅本地完整编辑快照"><p>原始标题</p><p>原始正文</p></section>'
const 输入 = (内容 = '帮我总结并重新排版', 额外 = {}) => ({ 会话标识, 消息: [{ 角色: 'user', 内容 }], 文档上下文: 文件上下文(), 文件快照, ...额外 })
const 工具 = (名称, 参数, id) => ({ id, type: 'function', function: { name: 名称, arguments: JSON.stringify(参数) } })
const 工具回复 = (...工具调用) => ({ content: null, reasoning_content: '正在核对当前任务的工具参数。', tool_calls: 工具调用 })
const 调用 = (名称, 参数, id) => 工具回复(工具(名称, 参数, id))
const 标题修改 = { 种类: '段落排版', 段落标识: '段落-1', 格式: { 标题级别: 1 } }
const 正文修改 = { 种类: '段落排版', 段落标识: '段落-2', 格式: { 行距: 1.5 } }
const 补齐原文 = (修改) => 修改.map((项) => ({ ...项, 原文: 原始条目.find((段) => 段.段落标识 === 项.段落标识).原文 }))

function 创建环境(回复来源) {
  const 配置文件 = new Map(), 会话列表 = new Map(), 请求列表 = [], 保存记录 = []
  const 存储 = {
    readFile: async (路径) => { if (!配置文件.has(路径)) throw Object.assign(new Error('不存在'), { code: 'ENOENT' }); return 配置文件.get(路径) },
    writeFile: async (路径, 内容) => 配置文件.set(路径, 内容),
    rename: async (旧, 新) => { 配置文件.set(新, 配置文件.get(旧)); 配置文件.delete(旧) },
    unlink: async (路径) => 配置文件.delete(路径),
  }
  const 会话存储 = {
    读取: async (标识) => 会话列表.has(标识) ? structuredClone(会话列表.get(标识)) : null,
    保存: async (标识, 会话) => { const 快照 = structuredClone(会话); 保存记录.push(快照); 会话列表.set(标识, 快照) },
    清除: async (标识) => 会话列表.delete(标识),
  }
  const 队列 = Array.isArray(回复来源) ? [...回复来源] : null
  const 新服务 = () => 创建助手服务({
    配置路径: '审计配置', 存储, 会话存储,
    安全存储: { isEncryptionAvailable: () => true, encryptString: (值) => Buffer.from(值), decryptString: (值) => 值.toString() },
    请求: async (_地址, 选项) => {
      const 请求 = JSON.parse(选项.body)
      请求列表.push(请求)
      const 消息 = 队列 ? 队列.shift() : await 回复来源(请求, 选项)
      if (!消息) throw new Error('审计模型收到了意外额外请求')
      return new Response(JSON.stringify({ choices: [{ message: 消息, finish_reason: 消息.tool_calls?.length ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
    },
  })
  const 服务 = 新服务()
  const 准备 = (上下文令牌 = 131072) => 服务.保存配置({ 名称: '审计服务', 地址: 'https://example.com/chat/completions', 模型: 'audit-model', 服务商: 'custom', 上下文令牌 })
  return { 服务, 新服务, 准备, 请求列表, 会话列表, 保存记录 }
}

function 创建通道(服务, 接收 = () => {}) {
  const 处理器 = new Map()
  注册智能助手通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) }, { 助手服务: 服务 })
  const 发送者 = Object.assign(new EventEmitter(), { id: 901, isDestroyed: () => false, send: vi.fn(接收) })
  return { 处理器, 事件: { sender: 发送者 }, 发送者 }
}

function 断言调用配对(消息) {
  for (let 索引 = 0; 索引 < 消息.length; 索引 += 1) {
    const 当前 = 消息[索引]
    expect(当前.role).not.toBe('tool')
    if (当前.role !== 'assistant' || !当前.tool_calls?.length) continue
    const 返回 = []
    while (消息[索引 + 1]?.role === 'tool') 返回.push(消息[++索引])
    expect(返回.map((项) => 项.tool_call_id)).toEqual(当前.tool_calls.map((项) => 项.id))
  }
}

describe('助手完整任务链路独立审计', () => {
  it('多批成功候选累积，失败批次不替换前一批已验证结果', async () => {
    const 无效修改 = { ...正文修改, 段落标识: '不存在的段落', 原文: '错误原文' }
    const 环境 = 创建环境([
      调用('set_plan', { steps: 计划 }, 'plan'),
      调用('propose_changes', { 回复: '标题候选', 修改: [标题修改] }, 'first'),
      调用('propose_changes', { 回复: '错误候选', 修改: [无效修改] }, 'invalid'),
      调用('propose_changes', { 回复: '正文候选', 修改: [正文修改] }, 'second'),
      { content: '两批候选已完成验证，等待确认。' },
    ])
    await 环境.准备()
    const 执行工具 = vi.fn().mockResolvedValueOnce({ 成功: true, 数据: { 候选已生成: true } }).mockResolvedValueOnce({ 成功: false, 错误: '原始段落不匹配' }).mockResolvedValueOnce({ 成功: true, 数据: { 候选已生成: true } })
    const 结果 = await 环境.服务.对话(输入(), { 执行工具 })
    expect(执行工具.mock.calls.map(([项]) => 项.参数.修改.length)).toEqual([1, 2, 2])
    expect(执行工具.mock.calls.at(-1)[0].参数.修改).toEqual(补齐原文([标题修改, 正文修改]))
    expect(JSON.parse(结果.内容).修改).toEqual(补齐原文([标题修改, 正文修改]))
    expect(环境.请求列表[3].messages.find((项) => 项.tool_call_id === 'invalid').content).toContain('原始段落不匹配')
    expect(结果.计划.at(-1).status).toBe('awaiting_confirmation')
    断言调用配对(环境.会话列表.get(会话标识).模型消息)
  })

  it('仅规划时服务商违规发出修改调用也不能执行文件工具', async () => {
    const 环境 = 创建环境([
      调用('set_plan', { steps: 计划 }, 'plan'),
      工具回复(工具('read_document', { offset: 0, limit: 10 }, 'read'), 工具('propose_changes', { 回复: '违规修改', 修改: [标题修改] }, 'edit')),
      { content: '只生成计划，等待执行。' },
    ])
    await 环境.准备()
    const 执行工具 = vi.fn()
    const 结果 = await 环境.服务.对话(输入('先做计划', { 自动执行: false }), { 执行工具 })
    expect(执行工具).not.toHaveBeenCalled()
    expect(环境.请求列表.every((请求) => 请求.tools.map((项) => 项.function.name).join(',') === 'set_plan')).toBe(true)
    const 返回 = 环境.请求列表.at(-1).messages.filter((项) => ['read', 'edit'].includes(项.tool_call_id)).map((项) => JSON.parse(项.content))
    expect(返回).toHaveLength(2)
    expect(返回.every((项) => 项.成功 === false && 项.错误.includes('不允许'))).toBe(true)
    expect(结果.内容).toBe('只生成计划，等待执行。')
    expect(环境.会话列表.get(会话标识).待确认候选 ?? null).toBeNull()
  })

  it('窗口取消待验证工具时补齐整批返回，重开会话可继续且无孤立调用', async () => {
    const 环境 = 创建环境([
      调用('set_plan', { steps: 计划 }, 'plan'),
      工具回复(工具('propose_changes', { 回复: '第一候选', 修改: [标题修改] }, 'edit-one'), 工具('propose_changes', { 回复: '第二候选', 修改: [正文修改] }, 'edit-two')),
      { content: '已恢复上轮取消记录，等待新指令。' },
    ])
    await 环境.准备()
    let 通知开始
    const 已开始 = new Promise((完成) => { 通知开始 = 完成 })
    const 通道 = 创建通道(环境.服务, (名称) => { if (名称 === 'ai.toolCall') 通知开始() })
    const 任务 = 通道.处理器.get('ai.chat')(通道.事件, 输入('开始排版', { 请求标识: 'audit-cancel' }))
    await 已开始
    expect(通道.处理器.get('ai.cancel')(通道.事件, 'audit-cancel')).toEqual({ 成功: true })
    expect(await 任务).toMatchObject({ 成功: true, 数据: { 已停止: true } })
    const 记忆 = await 环境.新服务().读取会话(会话标识)
    断言调用配对(记忆.模型消息)
    const 取消返回 = 记忆.模型消息.filter((项) => ['edit-one', 'edit-two'].includes(项.tool_call_id))
    expect(取消返回).toHaveLength(2)
    expect(取消返回.every((项) => JSON.parse(项.content).成功 === false)).toBe(true)
    expect(记忆.显示消息.at(-1).状态).toBe('已停止')
    expect(通道.发送者.listenerCount('destroyed')).toBe(0)
    expect(通道.发送者.listenerCount('render-process-gone')).toBe(0)
    const 恢复 = await 通道.处理器.get('ai.chat')(通道.事件, 输入('继续上轮任务', { 请求标识: 'audit-resume' }))
    expect(恢复).toMatchObject({ 成功: true, 数据: { 内容: '已恢复上轮取消记录，等待新指令。' } })
    断言调用配对(环境.请求列表.at(-1).messages)
    expect(通道.发送者.send.mock.calls.filter(([名称]) => 名称 === 'ai.toolCall')).toHaveLength(1)
  })

  it('成功候选立即持久保存，下一批取消后重开仍可恢复原始快照', async () => {
    const 环境 = 创建环境([
      调用('set_plan', { steps: 计划 }, 'plan'),
      调用('propose_changes', { 回复: '已验证标题候选', 修改: [标题修改] }, 'edit-one'),
      调用('propose_changes', { 回复: '待验证正文候选', 修改: [正文修改] }, 'edit-two'),
      { content: '上轮标题候选仍在等待确认。' },
    ])
    await 环境.准备()
    const 控制器 = new AbortController()
    const 候选 = { 回复: '已验证标题候选', 修改: 补齐原文([标题修改]), 文档上下文: 文件上下文(), 文件快照 }
    const 执行工具 = vi.fn(async () => {
      if (执行工具.mock.calls.length === 1) return { 成功: true, 数据: { 候选已生成: true } }
      控制器.abort()
      throw new Error('已停止生成')
    })
    expect(await 环境.服务.对话(输入(), { 执行工具, 信号: 控制器.signal })).toMatchObject({ 已停止: true })
    expect(环境.保存记录.some((项) => JSON.stringify(项.待确认候选) === JSON.stringify(候选))).toBe(true)
    const 新服务 = 环境.新服务()
    expect((await 新服务.读取会话(会话标识)).待确认候选).toEqual(候选)
    const 通道 = 创建通道(新服务)
    expect((await 通道.处理器.get('ai.getSession')(通道.事件, 会话标识)).数据.待确认候选).toEqual(候选)
    await expect(新服务.对话(输入('先保留候选，等我确认'))).rejects.toThrow('先确认或放弃')
    expect((await 新服务.读取会话(会话标识)).待确认候选).toEqual(候选)
    expect(环境.请求列表.every((请求) => !JSON.stringify(请求).includes('仅本地完整编辑快照'))).toBe(true)
  })

  it('同一批第一项成功后立即保存候选，不等待下一项验证返回', async () => {
    const 环境 = 创建环境([
      调用('set_plan', { steps: 计划 }, 'plan'),
      工具回复(工具('propose_changes', { 回复: '第一项已验证', 修改: [标题修改] }, 'edit-one'), 工具('propose_changes', { 回复: '第二项等待验证', 修改: [正文修改] }, 'edit-two')),
    ])
    await 环境.准备()
    const 控制器 = new AbortController()
    let 通知开始
    const 已开始 = new Promise((完成) => { 通知开始 = 完成 })
    const 执行工具 = vi.fn(async () => {
      if (执行工具.mock.calls.length === 1) return { 成功: true, 数据: { 候选已生成: true } }
      通知开始()
      return new Promise((_完成, 拒绝) => 控制器.signal.addEventListener('abort', () => 拒绝(new Error('已停止生成')), { once: true }))
    })
    const 任务 = 环境.服务.对话(输入(), { 执行工具, 信号: 控制器.signal })
    await 已开始
    try {
      const 记忆 = await 环境.新服务().读取会话(会话标识)
      expect(记忆.待确认候选).toEqual({ 回复: '第一项已验证', 修改: 补齐原文([标题修改]), 文档上下文: 文件上下文(), 文件快照 })
    } finally {
      控制器.abort()
      expect(await 任务).toMatchObject({ 已停止: true })
    }
    断言调用配对(环境.会话列表.get(会话标识).模型消息)
  })

  it('程序中途重启后补齐未返回工具的真实中断结果，再向模型发送完整配对', async () => {
    const 环境 = 创建环境([{ content: '已恢复中断记忆，尚未确认的修改保持待确认。' }])
    await 环境.准备()
    const 已读取结果 = { 成功: true, 数据: { 条目: [原始条目[0]], 总数: 2, 下一位置: 1, 下一原文位置: 0, 已读完: false } }
    const 候选 = { 回复: '上一批已验证', 修改: 补齐原文([标题修改]), 文档上下文: 文件上下文(), 文件快照 }
    环境.会话列表.set(会话标识, {
      模型消息: [
        { role: 'user', content: '继续读取并排版' },
        { role: 'assistant', content: null, reasoning_content: '上轮正在读取并生成候选。', tool_calls: [工具('read_document', { offset: 0, limit: 1 }, 'completed-read'), 工具('propose_changes', { 回复: '尚未返回的候选', 修改: [正文修改] }, 'interrupted-edit')] },
        { role: 'tool', tool_call_id: 'completed-read', content: JSON.stringify(已读取结果) },
      ],
      显示消息: [{ 角色: 'user', 内容: '继续读取并排版' }], 摘要: '', 计划, 压缩次数: 0, 待确认候选: 候选,
    })
    const 执行工具 = vi.fn()
    const 新服务 = 环境.新服务()
    await expect(新服务.对话(输入('恢复之前的任务'), { 执行工具 })).rejects.toThrow('先确认或放弃')
    await 新服务.放弃会话候选(会话标识)
    await 新服务.对话(输入('恢复之前的任务'), { 执行工具 })
    expect(环境.请求列表).toHaveLength(1)
    const 发给模型 = 环境.请求列表[0].messages
    断言调用配对(发给模型)
    expect(发给模型.find((项) => 项.tool_call_id === 'completed-read').content).toBe(JSON.stringify(已读取结果))
    const 中断返回 = 发给模型.filter((项) => 项.tool_call_id === 'interrupted-edit')
    expect(中断返回).toHaveLength(1)
    expect(JSON.parse(中断返回[0].content)).toMatchObject({ 成功: false, 错误: expect.stringContaining('上次任务中断') })
    expect(JSON.parse(中断返回[0].content).错误).toContain('结果未确认')
    expect(发给模型.find((项) => 项.tool_calls).reasoning_content).toBe('上轮正在读取并生成候选。')
    expect(执行工具).not.toHaveBeenCalled()
    const 恢复记忆 = await 新服务.读取会话(会话标识)
    expect(恢复记忆.待确认候选).toBeNull()
    断言调用配对(恢复记忆.模型消息)
  })

  it('候选确认应用或明确放弃后清空恢复记录并保存真实事实', async () => {
    const 环境 = 创建环境([
      调用('set_plan', { steps: 计划 }, 'plan-one'),
      调用('propose_changes', { 回复: '已生成候选', 修改: [标题修改] }, 'edit-one'),
      { content: '请确认候选。' },
      调用('set_plan', { steps: 计划 }, 'plan-two'),
      调用('propose_changes', { 回复: '重新生成候选', 修改: [正文修改] }, 'edit-two'),
      { content: '请再次确认候选。' },
    ])
    await 环境.准备()
    const 执行工具 = async () => ({ 成功: true, 数据: { 候选已生成: true } })
    const 结果 = await 环境.服务.对话(输入(), { 执行工具 })
    await 环境.服务.更新会话计划(会话标识, 结果.计划.map((项) => ({ ...项, status: 项.status === 'awaiting_confirmation' ? 'completed' : 项.status })))
    expect((await 环境.服务.读取会话(会话标识)).待确认候选 ?? null).toBeNull()
    await 环境.服务.对话(输入('重新生成下一批候选'), { 执行工具 })
    expect((await 环境.服务.读取会话(会话标识)).待确认候选).toBeTruthy()
    const 通道 = 创建通道(环境.服务)
    const 放弃处理 = 通道.处理器.get('ai.discardSessionProposal')
    expect(放弃处理).toBeTypeOf('function')
    expect(await 放弃处理(通道.事件, 会话标识)).toMatchObject({ 成功: true })
    const 记忆 = await 环境.服务.读取会话(会话标识)
    expect(记忆.待确认候选).toBeNull()
    expect(记忆.模型消息.at(-1).content).toContain('放弃')
    expect(记忆.模型消息.at(-1).content).toContain('未应用')
  })

  it('上下文超预算时通过实际服务请求分批摘要，继续请求携带合并记忆', async () => {
    const 摘要 = '保留原文且待确认，旧背景已完整整理。'
    const 环境 = 创建环境(async (请求) => ({ content: 请求.tools ? '已根据真实摘要继续当前任务。' : 摘要 }))
    await 环境.准备(8192)
    const 旧背景 = '背景事实'.repeat(3000) + '中部必须保留约束' + '后续事实'.repeat(3000) + '末尾实际未完成工作'
    环境.会话列表.set(会话标识, { 模型消息: [{ role: 'user', content: '旧目标' }, { role: 'assistant', content: 旧背景 }, { role: 'user', content: '上一轮要求保留原文' }, { role: 'assistant', content: '上一轮仅生成候选，尚未确认。' }], 显示消息: [], 摘要: '更早的确认事实', 计划: [], 压缩次数: 0 })
    const 推送 = vi.fn()
    const 结果 = await 环境.服务.对话(输入('按照刚才的约束继续'), { 推送 })
    const 摘要请求 = 环境.请求列表.filter((请求) => !请求.tools)
    expect(摘要请求.length).toBeGreaterThan(2)
    expect(摘要请求.every((请求) => 请求.stream === true && 请求.messages[0].content.includes('准确压缩'))).toBe(true)
    const 摘要内容 = 摘要请求.map((请求) => 请求.messages[1].content).join('')
    expect(摘要内容).toContain('更早的确认事实')
    expect(摘要内容).toContain('中部必须保留约束')
    expect(摘要内容).toContain('末尾实际未完成工作')
    const 继续请求 = 环境.请求列表.at(-1)
    expect(继续请求.tools).toBeTruthy()
    expect(继续请求.messages.some((项) => 项.role === 'system' && 项.content.includes(摘要))).toBe(true)
    expect(继续请求.messages.some((项) => 项.content === '按照刚才的约束继续')).toBe(true)
    expect(估算令牌(继续请求.messages)).toBeLessThan(8192)
    expect(结果).toMatchObject({ 摘要, 压缩次数: 1 })
    expect(推送.mock.calls.some(([项]) => 项.类型 === '压缩')).toBe(true)
    expect((await 环境.新服务().读取会话(会话标识)).摘要).toBe(摘要)
  })

  it('长段落沿真实工具返回游标连续分页，不漏正文和后续段落', async () => {
    const 原文 = '逐项核对'.repeat(2800) + '末尾不得遗漏'
    const 条目 = [{ 段落标识: '段落-首', 原文: '开头说明' }, { 段落标识: '段落-长', 原文 }, { 段落标识: '段落-尾', 原文: '结束说明' }]
    const 片段 = [], 读取参数 = []
    let 编号 = 0
    const 环境 = 创建环境(async (请求) => {
      expect(请求.tools).toBeTruthy()
      const 最后 = 请求.messages.at(-1)
      if (最后.role === 'user') return 调用('set_plan', { steps: 计划 }, 'plan')
      const 返回 = JSON.parse(最后.content)
      expect(返回.成功).toBe(true)
      if (返回.数据.条目) {
        片段.push(...返回.数据.条目)
        if (返回.数据.已读完) return { content: '全部段落已连续读取完成。' }
      }
      const 参数 = { offset: 返回.数据.下一位置 ?? 0, limit: 100, text_offset: 返回.数据.下一原文位置 ?? 0, text_limit: 257 }
      读取参数.push(参数)
      return 调用('read_document', 参数, `read-${++编号}`)
    })
    await 环境.准备(65536)
    const 结果 = await 环境.服务.对话(输入('完整读取再核对', { 文档上下文: 文件上下文(条目) }))
    expect(结果.内容).toBe('全部段落已连续读取完成。')
    expect(读取参数.length).toBeGreaterThan(40)
    for (const 原始 of 条目) {
      const 同段 = 片段.filter((项) => 项.段落标识 === 原始.段落标识)
      let 已读字符 = 0
      for (const 项 of 同段) { expect(项.原文起点 ?? 0).toBe(已读字符); 已读字符 += 项.原文.length }
      expect(同段.map((项) => 项.原文).join('')).toBe(原始.原文)
    }
    expect(片段.filter((项) => 项.段落标识 === '段落-首')).toHaveLength(1)
    expect(片段.filter((项) => 项.段落标识 === '段落-尾')).toHaveLength(1)
    断言调用配对(环境.会话列表.get(会话标识).模型消息)
  })

  it('交替重复相同读取范围仍应停止，不因调用标识变化持续请求', async () => {
    const 回复 = Array.from({ length: 16 }, (_, 序号) => 调用('read_document', { offset: 序号 % 2, limit: 1 }, `repeat-${序号}`))
    const 环境 = 创建环境([...回复, { content: '模型仍在重复读取，未触发停止。' }])
    await 环境.准备()
    await expect(环境.服务.对话(输入('读取这两段'))).rejects.toThrow('重复')
    expect(环境.请求列表.length).toBeLessThan(17)
    断言调用配对(环境.会话列表.get(会话标识).模型消息)
  })

  it('相同计划持续汇报真实读取进度时不误停六批不同范围', async () => {
    const 进行中计划 = [{ id: 'read', title: '分批核对六段原文', status: 'in_progress' }]
    const 完成计划 = [{ ...进行中计划[0], status: 'completed' }]
    const 条目 = Array.from({ length: 6 }, (_, 索引) => ({ 段落标识: `段落-${索引 + 1}`, 原文: `第${索引 + 1}段实际新数据` }))
    const 回复 = 条目.flatMap((_项, 索引) => [调用('set_plan', { steps: 进行中计划 }, `progress-${索引}`), 调用('read_document', { offset: 索引, limit: 1 }, `range-${索引}`)])
    const 环境 = 创建环境([...回复, 调用('set_plan', { steps: 完成计划 }, 'progress-complete'), { content: '六段均已读取，原文已完整核对。' }])
    await 环境.准备()
    const 结果 = await 环境.服务.对话(输入('逐批读取六段并报告实际进度', { 文档上下文: 文件上下文(条目) }))
    expect(结果.内容).toBe('六段均已读取，原文已完整核对。')
    expect(结果.计划).toEqual(完成计划)
    const 记忆 = await 环境.服务.读取会话(会话标识)
    const 读取结果 = 记忆.模型消息.filter((项) => 项.role === 'tool' && 项.tool_call_id.startsWith('range-')).map((项) => JSON.parse(项.content))
    expect(读取结果).toHaveLength(6)
    expect(读取结果.every((项) => 项.成功 === true)).toBe(true)
    expect(读取结果.flatMap((项) => 项.数据.条目).map((项) => 项.原文)).toEqual(条目.map((项) => 项.原文))
    expect(记忆.模型消息.filter((项) => 项.tool_call_id?.startsWith('progress-')).every((项) => JSON.parse(项.content).成功 === true)).toBe(true)
    断言调用配对(记忆.模型消息)
  })

  it('服务商反复复用同一调用标识立即停止，保留有效配对和失败原因', async () => {
    const 回复 = Array.from({ length: 8 }, () => 调用('read_document', { offset: 0, limit: 1 }, 'same-id'))
    const 环境 = 创建环境([...回复, { content: '模型仍在重复使用标识，未触发停止。' }])
    await 环境.准备()
    await expect(环境.服务.对话(输入('读取第一段'))).rejects.toThrow('重复')
    expect(环境.请求列表.length).toBeLessThan(9)
    const 记忆 = 环境.会话列表.get(会话标识)
    expect(记忆.模型消息.filter((项) => 项.role === 'tool' && 项.tool_call_id === 'same-id')).toHaveLength(1)
    expect(记忆.显示消息.at(-1).状态).toBe('失败')
    expect(JSON.stringify(记忆.显示消息.at(-1))).toContain('重复使用工具调用标识')
    断言调用配对(记忆.模型消息)
  })

  it('普通富文本段落不重复发送嵌套片段正文并遵守读取预算', () => {
    const 原文 = '这是完整的样式段落。'.repeat(20)
    const 片段 = Array.from({ length: 6 }, (_, 索引) => ({ 文本: 原文, 类型: 索引 % 2 ? 'strong' : 'span', 样式: 'font-weight: bold' }))
    const 资料 = 创建文件资料(文件上下文([{ 段落标识: '段落-样式', 原文, 类型: 'p', 格式: { 对齐: 'left' }, 片段 }]), 512)
    const 结果 = 资料.读取({ offset: 0, limit: 1 })
    expect(结果.成功).toBe(true)
    expect(结果.数据.条目).toHaveLength(1)
    expect(结果.数据.条目[0].原文).toBe(原文)
    const 数据文本 = JSON.stringify(结果.数据.条目)
    expect(数据文本.length).toBeLessThanOrEqual(512)
    expect(数据文本.split(原文)).toHaveLength(2)
    expect(结果.数据).toMatchObject({ 下一位置: 1, 下一原文位置: 0, 已读完: true })
  })

  it('显式文本页长小于读取预算时仍按页长返回并连续读取短段落', () => {
    const 原文 = '连续原文。'.repeat(40)
    const 资料 = 创建文件资料(文件上下文([{ 段落标识: '段落-短', 原文 }]), 1024)
    let offset = 0, text_offset = 0, 已读完 = false
    const 片段 = []
    for (let 次数 = 0; 次数 < 20 && !已读完; 次数 += 1) {
      const 结果 = 资料.读取({ offset, limit: 1, text_offset, text_limit: 37 })
      expect(结果.成功).toBe(true)
      const 当前 = 结果.数据.条目[0]
      expect(当前.原文.length).toBeLessThanOrEqual(37)
      expect(当前.原文).toBe(原文.slice(text_offset, text_offset + 37))
      if (!结果.数据.已读完) {
        expect(当前.原文未完整).toBe(true)
        expect(结果.数据.下一位置).toBe(0)
        expect(结果.数据.下一原文位置).toBe(text_offset + 37)
      }
      片段.push(当前.原文)
      offset = 结果.数据.下一位置
      text_offset = 结果.数据.下一原文位置
      已读完 = 结果.数据.已读完
    }
    expect(已读完).toBe(true)
    expect(片段.join('')).toBe(原文)
    expect(offset).toBe(1)
  })

  it('旧格式修改回复也经过真实工具校验并持久保存，不能伪造缺失计划', async () => {
    const 协议 = { 回复: '建议调整当前标题，等待确认。', 修改: [{ 种类: '文字替换', 段落标识: '段落-1', 查找: '原始标题', 替换为: '新标题' }] }
    const 环境 = 创建环境([{ content: JSON.stringify(协议) }])
    await 环境.准备()
    const 执行工具 = vi.fn(async () => ({ 成功: true, 数据: { 候选已生成: true } }))
    const 推送 = vi.fn()
    const 结果 = await 环境.服务.对话(输入('请调整当前标题'), { 执行工具, 推送 })
    expect(执行工具).toHaveBeenCalledTimes(1)
    expect(执行工具.mock.calls[0][0]).toMatchObject({ 工具: 'propose_changes', 调用标识: expect.any(String), 参数: 协议 })
    expect(执行工具.mock.calls[0][0].调用标识.trim()).not.toBe('')
    expect(JSON.parse(结果.内容)).toEqual(协议)
    expect(结果.计划).toEqual([])
    const 候选 = { ...协议, 文档上下文: 文件上下文(), 文件快照 }
    const 新服务 = 环境.新服务()
    const 记忆 = await 新服务.读取会话(会话标识)
    expect(记忆.待确认候选).toEqual(候选)
    expect(记忆.计划).toEqual([])
    expect(环境.保存记录.some((项) => JSON.stringify(项.待确认候选) === JSON.stringify(候选))).toBe(true)
    const 通道 = 创建通道(新服务)
    expect((await 通道.处理器.get('ai.getSession')(通道.事件, 会话标识)).数据.待确认候选).toEqual(候选)
    expect(推送.mock.calls.some(([项]) => 项.类型 === '计划')).toBe(false)
    expect(环境.请求列表).toHaveLength(1)
  })

  it.each([
    ['工具拒绝', { 成功: false, 错误: '原始段落已经改变，请重新读取当前快照' }, '原始段落已经改变，请重新读取当前快照'],
    ['工具异常', new Error('当前文件已关闭，无法验证候选'), '当前文件已关闭，无法验证候选'],
    ['未生成有效候选', { 成功: true }, '未生成有效候选'],
  ])('旧格式修改回复在%s时保留真实原因且不持久记录成功候选', async (_场景, 工具结果, 原因) => {
    const 协议 = { 回复: '建议调整标题。', 修改: [{ 种类: '文字替换', 段落标识: '段落-1', 查找: '原始标题', 替换为: '新标题' }] }
    const 环境 = 创建环境([{ content: JSON.stringify(协议) }])
    await 环境.准备()
    const 执行工具 = vi.fn(async () => { if (工具结果 instanceof Error) throw 工具结果; return 工具结果 })
    await expect(环境.服务.对话(输入('调整标题'), { 执行工具 })).rejects.toThrow(原因)
    expect(执行工具).toHaveBeenCalledTimes(1)
    const 记忆 = await 环境.新服务().读取会话(会话标识)
    expect(记忆.待确认候选 ?? null).toBeNull()
    expect(记忆.计划).toEqual([])
    expect(记忆.最近任务错误).toContain(原因)
    expect(环境.保存记录.every((项) => !项.待确认候选)).toBe(true)
  })
})
