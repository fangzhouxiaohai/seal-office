const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { EventEmitter } = require('events')
const { 创建助手服务 } = require('./assistant')
const { 创建会话存储 } = require('./sessionMemory')
const { 注册智能助手通道 } = require('../ipc/aiChannel')

const 测试目录 = new Set()
const 新文件标识 = 'document:新增文字文档'
const 已存文件标识 = 'file:e:/文档/已保存.docx'
const 文件上下文 = '文件名称：未命名.docx\n文件类型：文字\n文件内容：\n' + JSON.stringify([{ 段落标识: '段落-1', 原文: '原始标题', 类型: 'p', 格式: {} }])
const 文件快照 = '<p>原始标题</p>'
const 初始计划 = [{ id: '检查原文', title: '检查原文', status: 'completed' }, { id: '调整标题', title: '调整标题', status: 'pending' }]
const 修改候选 = [{ 种类: '段落排版', 段落标识: '段落-1', 格式: { 标题级别: 1 } }]

function 工具回复(名称, 参数, 标识) {
  return { content: null, reasoning_content: '逐项核对真实文件。', tool_calls: [{ id: 标识, type: 'function', function: { name: 名称, arguments: JSON.stringify(参数) } }] }
}

function 创建安全存储() {
  const 密钥 = crypto.randomBytes(32)
  return {
    isEncryptionAvailable: () => true,
    encryptString: (文本) => {
      const 向量 = crypto.randomBytes(12)
      const 加密 = crypto.createCipheriv('aes-256-gcm', 密钥, 向量)
      return Buffer.concat([向量, 加密.update(文本, 'utf8'), 加密.final(), 加密.getAuthTag()])
    },
    decryptString: (内容) => {
      const 解密 = crypto.createDecipheriv('aes-256-gcm', 密钥, 内容.subarray(0, 12))
      解密.setAuthTag(内容.subarray(-16))
      return Buffer.concat([解密.update(内容.subarray(12, -16)), 解密.final()]).toString('utf8')
    },
  }
}

function 可控等待() {
  let 释放
  const 等待 = new Promise((完成) => { 释放 = 完成 })
  return { 等待, 释放 }
}

async function 创建环境() {
  const 目录 = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'seal-session-lifecycle-'))
  测试目录.add(目录)
  const 安全存储 = 创建安全存储()
  const 基础存储 = 创建会话存储({ 目录: path.join(目录, 'sessions'), 安全存储 })
  const 会话存储 = {
    读取: vi.fn((标识) => 基础存储.读取(标识)),
    保存: vi.fn((标识, 内容) => 基础存储.保存(标识, 内容)),
    清除: vi.fn((标识) => 基础存储.清除(标识)),
  }
  const 请求列表 = []
  const 回复列表 = []
  const 请求 = vi.fn(async (_地址, 选项) => {
    const 请求体 = JSON.parse(选项.body)
    请求列表.push(请求体)
    const 回复 = 回复列表.shift() ?? { content: '已延续当前真实任务。' }
    const 实际回复 = typeof 回复 === 'function' ? await 回复(请求体, 选项.signal) : 回复
    return new Response(JSON.stringify({ choices: [{ message: 实际回复, finish_reason: 实际回复.tool_calls ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
  })
  const 创建服务 = () => 创建助手服务({ 配置路径: path.join(目录, 'config.secure'), 安全存储, 会话存储, 请求 })
  const 服务 = 创建服务()
  await 服务.保存配置({ 名称: '生命周期测试', 地址: 'https://example.com/chat/completions', 模型: 'test', 服务商: 'custom', 参数模式: 'none', 上下文令牌: 131072 })
  const 处理器 = new Map()
  注册智能助手通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) }, { 助手服务: 服务 })
  const 窗口 = new Map()
  let 请求计数 = 0
  const 获取窗口 = (标识) => {
    if (!窗口.has(标识)) {
      const 发送者 = Object.assign(new EventEmitter(), { id: 标识, isDestroyed: () => false })
      发送者.send = vi.fn((频道, 数据) => {
        if (频道 === 'ai.toolCall') 处理器.get('ai.submitToolResult')({ sender: 发送者 }, { 请求标识: 数据.请求标识, 调用标识: 数据.调用标识, 成功: true, 数据: { 候选已生成: true, 修改数量: 数据.参数.修改.length } })
      })
      窗口.set(标识, 发送者)
    }
    return 窗口.get(标识)
  }
  const 调用 = (名称, 窗口号, ...参数) => 处理器.get(名称)({ sender: 获取窗口(窗口号) }, ...参数)
  const 对话 = (标识, 内容 = '请继续', 窗口号 = 1, 额外 = {}) => 调用('ai.chat', 窗口号, { 请求标识: `request-${++请求计数}`, 会话标识: 标识, 消息: [{ 角色: 'user', 内容 }], 文档上下文: 文件上下文, 文件快照, ...额外 })
  const 生成候选 = async (标识 = 新文件标识) => {
    回复列表.push(工具回复('set_plan', { steps: 初始计划 }, `plan-${请求计数 + 1}`), 工具回复('propose_changes', { 回复: '建议将原始标题作为一级标题。', 修改: 修改候选 }, `edit-${请求计数 + 1}`), { content: '已经生成标题候选，请确认后应用。' })
    const 结果 = await 对话(标识, '请检查并调整标题。')
    expect(结果.成功).toBe(true)
    return await 基础存储.读取(标识)
  }
  const 阻塞存储 = (方法, 标识) => {
    const 已进入 = 可控等待()
    const 放行 = 可控等待()
    const 原方法 = 会话存储[方法].getMockImplementation()
    let 首次 = true
    会话存储[方法].mockImplementation(async (...参数) => {
      if (参数[0] === 标识 && 首次) {
        首次 = false
        const 已读内容 = 方法 === '读取' ? await 原方法(...参数) : undefined
        已进入.释放()
        await 放行.等待
        return 方法 === '读取' ? 已读内容 : 原方法(...参数)
      }
      return 原方法(...参数)
    })
    return { 已进入: 已进入.等待, 放行: 放行.释放 }
  }
  return { 服务, 创建服务, 会话存储, 基础存储, 请求, 请求列表, 回复列表, 调用, 对话, 生成候选, 阻塞存储, 获取窗口 }
}

afterEach(async () => {
  for (const 目录 of 测试目录) {
    if (path.basename(目录).startsWith('seal-session-lifecycle-')) await fs.promises.rm(目录, { recursive: true, force: true })
  }
  测试目录.clear()
})

describe('真实助手服务的文件会话生命周期', () => {
  it('未保存文档绑定实际路径后，新服务恢复完整消息、工具和待确认候选', async () => {
    const 环境 = await 创建环境()
    const 原会话 = await 环境.生成候选()
    expect(await 环境.调用('ai.bindSession', 1, 新文件标识, 已存文件标识)).toEqual({ 成功: true })
    const 重开服务 = 环境.创建服务()
    const 恢复会话 = await 重开服务.读取会话(已存文件标识)
    expect(恢复会话).toMatchObject(原会话)
    expect(恢复会话.待确认候选.文件快照).toBe(文件快照)
    expect(恢复会话.模型消息.find((项) => 项.tool_calls).reasoning_content).toBe('逐项核对真实文件。')
    const 可见会话 = await 环境.调用('ai.getSession', 2, 已存文件标识)
    expect(可见会话.数据).toMatchObject({ 显示消息: 原会话.显示消息, 计划: 原会话.计划, 待确认候选: 原会话.待确认候选 })
    await expect(重开服务.对话({ 会话标识: 已存文件标识, 消息: [{ 角色: 'user', 内容: '我上次要求修改什么？' }], 文档上下文: 文件上下文 })).rejects.toThrow('先确认或放弃')
    await 重开服务.放弃会话候选(已存文件标识)
    await 重开服务.对话({ 会话标识: 已存文件标识, 消息: [{ 角色: 'user', 内容: '我上次要求修改什么？' }], 文档上下文: 文件上下文 })
    expect(环境.请求列表.at(-1).messages).toEqual(expect.arrayContaining(原会话.模型消息))
  })

  it('目标已有历史时同时保留两方消息、摘要和压缩次数', async () => {
    const 环境 = await 创建环境()
    await 环境.对话(已存文件标识, '以前文件的约束是保留数据。')
    await 环境.对话(新文件标识, '新文件要求统一标题。')
    const 目标 = await 环境.基础存储.读取(已存文件标识)
    const 来源 = await 环境.基础存储.读取(新文件标识)
    目标.摘要 = '旧文件数据约束。'; 目标.压缩次数 = 2
    来源.摘要 = '新文件标题目标。'; 来源.压缩次数 = 3
    await 环境.基础存储.保存(已存文件标识, 目标)
    await 环境.基础存储.保存(新文件标识, 来源)
    expect((await 环境.调用('ai.bindSession', 1, 新文件标识, 已存文件标识)).成功).toBe(true)
    const 合并 = await 环境.基础存储.读取(已存文件标识)
    expect(合并.模型消息).toEqual([...目标.模型消息, ...来源.模型消息])
    expect(合并.显示消息).toEqual([...目标.显示消息, ...来源.显示消息])
    expect(合并.摘要).toContain(目标.摘要)
    expect(合并.摘要).toContain(来源.摘要)
    expect(合并.压缩次数).toBe(5)
  })

  it('相同来源内容绑定重试幂等，不能重复整个历史和摘要', async () => {
    const 环境 = await 创建环境()
    await 环境.生成候选()
    const 来源 = await 环境.基础存储.读取(新文件标识)
    来源.摘要 = '完整真实标题任务。'; 来源.压缩次数 = 2
    await 环境.基础存储.保存(新文件标识, 来源)
    expect((await 环境.调用('ai.bindSession', 1, 新文件标识, 已存文件标识)).成功).toBe(true)
    const 首次绑定 = await 环境.基础存储.读取(已存文件标识)
    const 重开服务 = 环境.创建服务()
    await 重开服务.绑定会话(新文件标识, 已存文件标识)
    const 重试绑定 = await 重开服务.读取会话(已存文件标识)
    expect(重试绑定.模型消息).toEqual(首次绑定.模型消息)
    expect(重试绑定.显示消息).toEqual(首次绑定.显示消息)
    expect(重试绑定.摘要).toBe(首次绑定.摘要)
    expect(重试绑定.压缩次数).toBe(首次绑定.压缩次数)
  })

  it('目标既有候选和计划作为历史任务保留，当前文件任务沿用来源', async () => {
    const 环境 = await 创建环境()
    const 旧任务 = await 环境.生成候选(已存文件标识)
    await 环境.对话(新文件标识, '新文件只需概括正文。')
    expect((await 环境.调用('ai.bindSession', 1, 新文件标识, 已存文件标识)).成功).toBe(true)
    const 绑定后 = await 环境.基础存储.读取(已存文件标识)
    expect(绑定后.历史任务).toEqual(expect.arrayContaining([expect.objectContaining({ 计划: 旧任务.计划, 待确认候选: 旧任务.待确认候选 })]))
    expect(绑定后.计划).toEqual([])
    expect(绑定后.待确认候选 ?? null).toBeNull()
    expect(绑定后.模型消息).toEqual(expect.arrayContaining(旧任务.模型消息))
  })

  it('普通会话没有候选时空计划确认是幂等空操作，不能新增已应用的虚假事实', async () => {
    const 环境 = await 创建环境()
    await 环境.对话(新文件标识, '只解释正文，不修改文件。')
    const 原会话 = await 环境.基础存储.读取(新文件标识)
    expect(原会话.计划).toEqual([])
    expect(原会话.待确认候选 ?? null).toBeNull()
    expect(await 环境.调用('ai.updateSessionPlan', 1, 新文件标识, [])).toEqual({ 成功: true })
    expect(await 环境.调用('ai.updateSessionPlan', 2, 新文件标识, [])).toEqual({ 成功: true })
    expect(await 环境.创建服务().读取会话(新文件标识)).toEqual(原会话)
  })

  it('另存后回迁原路径时共同历史只保留一次，双方独立后续消息全部保留', async () => {
    const 环境 = await 创建环境()
    const 另存标识 = 'file:e:/文档/另存版本.docx'
    await 环境.对话(新文件标识, '第一轮共同目标')
    expect((await 环境.调用('ai.bindSession', 1, 新文件标识, 已存文件标识)).成功).toBe(true)
    await 环境.对话(已存文件标识, '第二轮共同要求')
    const 共同历史 = await 环境.基础存储.读取(已存文件标识)
    expect((await 环境.调用('ai.bindSession', 1, 已存文件标识, 另存标识)).成功).toBe(true)
    await 环境.对话(已存文件标识, '原路径的独立后续要求', 1)
    await 环境.对话(另存标识, '另存路径的独立后续要求', 2)
    const 原路径 = await 环境.基础存储.读取(已存文件标识)
    const 另存路径 = await 环境.基础存储.读取(另存标识)
    expect((await 环境.调用('ai.bindSession', 2, 另存标识, 已存文件标识)).成功).toBe(true)
    const 回迁后 = await 环境.创建服务().读取会话(已存文件标识)
    expect(回迁后.模型消息).toEqual([
      ...共同历史.模型消息,
      ...原路径.模型消息.slice(共同历史.模型消息.length),
      ...另存路径.模型消息.slice(共同历史.模型消息.length),
    ])
    expect(回迁后.显示消息).toEqual([
      ...共同历史.显示消息,
      ...原路径.显示消息.slice(共同历史.显示消息.length),
      ...另存路径.显示消息.slice(共同历史.显示消息.length),
    ])
    const 回迁重试前 = structuredClone(回迁后)
    expect((await 环境.调用('ai.bindSession', 2, 另存标识, 已存文件标识)).成功).toBe(true)
    const 回迁重试后 = await 环境.基础存储.读取(已存文件标识)
    expect(回迁重试后.模型消息).toEqual(回迁重试前.模型消息)
    expect(回迁重试后.显示消息).toEqual(回迁重试前.显示消息)
  })

  it('用户确认应用后持久清空候选，只记录进入编辑区的真实事实', async () => {
    const 环境 = await 创建环境()
    const 原会话 = await 环境.生成候选()
    const 确认计划 = 原会话.计划.map((项) => 项.status === 'awaiting_confirmation' ? { ...项, status: 'completed' } : 项)
    expect(await 环境.调用('ai.updateSessionPlan', 1, 新文件标识, 确认计划)).toEqual({ 成功: true })
    const 恢复 = await 环境.创建服务().读取会话(新文件标识)
    expect(恢复.待确认候选).toBeNull()
    expect(恢复.计划.at(-1).status).toBe('completed')
    expect(恢复.模型消息.at(-1)).toMatchObject({ role: 'user', content: expect.stringContaining('确认并应用') })
    expect(恢复.模型消息.at(-1).content).toContain('编辑区')
    expect(恢复.模型消息.at(-1).content).not.toContain('已保存到磁盘')
    expect(恢复.显示消息).toEqual(原会话.显示消息)
  })

  it('放弃候选后持久清空，计划记为失败且明确没有应用修改', async () => {
    const 环境 = await 创建环境()
    await 环境.生成候选()
    expect(await 环境.调用('ai.discardSessionProposal', 1, 新文件标识)).toEqual({ 成功: true })
    const 恢复 = await 环境.创建服务().读取会话(新文件标识)
    expect(恢复.待确认候选).toBeNull()
    expect(恢复.计划.at(-1).status).toBe('failed')
    expect(恢复.模型消息.at(-1)).toMatchObject({ role: 'user', content: expect.stringContaining('未应用') })
    expect(恢复.模型消息.at(-1).content).toContain('放弃')
    expect(恢复.模型消息.at(-1).content).not.toContain('已完成修改')
  })

  it('确认或放弃保存失败时返回实际失败，重开仍保留原候选', async () => {
    const 环境 = await 创建环境()
    const 原会话 = await 环境.生成候选()
    const 确认计划 = 原会话.计划.map((项) => 项.status === 'awaiting_confirmation' ? { ...项, status: 'completed' } : 项)
    环境.会话存储.保存.mockRejectedValueOnce(new Error('对话记忆保存失败，磁盘空间不足。'))
    expect(await 环境.调用('ai.updateSessionPlan', 1, 新文件标识, 确认计划)).toEqual({ 成功: false, 错误: '对话记忆保存失败，磁盘空间不足。' })
    expect(await 环境.基础存储.读取(新文件标识)).toEqual(原会话)
    环境.会话存储.保存.mockRejectedValueOnce(new Error('对话记忆保存失败，磁盘空间不足。'))
    expect((await 环境.调用('ai.discardSessionProposal', 1, 新文件标识)).成功).toBe(false)
    expect(await 环境.基础存储.读取(新文件标识)).toEqual(原会话)
    expect((await 环境.对话(新文件标识, '保存失败后继续核对原文。', 2)).成功).toBe(false)
    expect(await 环境.基础存储.读取(新文件标识)).toEqual(原会话)
    expect((await 环境.调用('ai.discardSessionProposal', 2, 新文件标识)).成功).toBe(true)
    expect((await 环境.对话(新文件标识, '放弃旧候选后继续核对原文。', 2)).成功).toBe(true)
  })

  it('绑定保存失败保留来源与目标，重试解除占用并只合并一次', async () => {
    const 环境 = await 创建环境()
    await 环境.对话(新文件标识, '来源的真实要求')
    await 环境.对话(已存文件标识, '目标的既有要求')
    const 来源 = await 环境.基础存储.读取(新文件标识)
    const 目标 = await 环境.基础存储.读取(已存文件标识)
    环境.会话存储.保存.mockRejectedValueOnce(new Error('对话记忆保存失败，磁盘拒绝写入。'))
    expect(await 环境.调用('ai.bindSession', 1, 新文件标识, 已存文件标识)).toEqual({ 成功: false, 错误: '对话记忆保存失败，磁盘拒绝写入。' })
    expect(await 环境.基础存储.读取(新文件标识)).toEqual(来源)
    expect(await 环境.基础存储.读取(已存文件标识)).toEqual(目标)
    expect((await 环境.调用('ai.bindSession', 2, 新文件标识, 已存文件标识)).成功).toBe(true)
    expect((await 环境.调用('ai.bindSession', 2, 新文件标识, 已存文件标识)).成功).toBe(true)
    const 绑定后 = await 环境.基础存储.读取(已存文件标识)
    expect(绑定后.模型消息).toEqual([...目标.模型消息, ...来源.模型消息])
    expect(绑定后.显示消息).toEqual([...目标.显示消息, ...来源.显示消息])
  })

  it('不同窗口生成同一会话时阻止第二项任务并在结束后释放锁', async () => {
    const 环境 = await 创建环境()
    const 已连接 = 可控等待()
    const 完成回复 = 可控等待()
    环境.回复列表.push(async () => { 已连接.释放(); await 完成回复.等待; return { content: '第一项真实任务已完成。' } })
    const 第一任务 = 环境.对话(新文件标识, '第一项任务', 1)
    await 已连接.等待
    try {
      const 第二结果 = await 环境.对话(新文件标识, '第二项竞争任务', 2)
      expect(第二结果.成功).toBe(false)
      expect(第二结果.错误).toContain('窗口')
      expect(环境.请求列表).toHaveLength(1)
    } finally { 完成回复.释放(); await 第一任务 }
    expect((await 环境.对话(新文件标识, '完成后重新处理', 2)).成功).toBe(true)
    expect((await 环境.基础存储.读取(新文件标识)).显示消息.map((项) => 项.内容)).not.toContain('第二项竞争任务')
    expect(环境.获取窗口(1).listenerCount('destroyed')).toBe(0)
    expect(环境.获取窗口(2).listenerCount('destroyed')).toBe(0)
  })

  it('不同窗口的不同会话可在第一项任务等待响应时完成', async () => {
    const 环境 = await 创建环境()
    const 已连接 = 可控等待()
    const 完成回复 = 可控等待()
    环境.回复列表.push(async () => { 已连接.释放(); await 完成回复.等待; return { content: '第一窗口任务完成。' } })
    const 第一任务 = 环境.对话(新文件标识, '第一文件任务', 1)
    await 已连接.等待
    try {
      const 第二结果 = await 环境.对话(已存文件标识, '第二文件任务', 2)
      expect(第二结果.成功).toBe(true)
      expect(环境.请求列表).toHaveLength(2)
      expect((await 环境.基础存储.读取(已存文件标识)).显示消息[0].内容).toBe('第二文件任务')
    } finally { 完成回复.释放(); await 第一任务 }
  })

  it('生成任务占用期间其他窗口不能绑定、确认、放弃或清除同一会话', async () => {
    const 环境 = await 创建环境()
    await 环境.对话(新文件标识, '历史需求：保留预算。')
    const 原会话 = await 环境.生成候选()
    const 已连接 = 可控等待()
    const 完成回复 = 可控等待()
    环境.回复列表.push(async () => { 已连接.释放(); await 完成回复.等待; return { content: '继续处理完成。' } })
    const 任务 = 环境.对话(新文件标识, '/compact', 1, { 手动压缩: true })
    await 已连接.等待
    try {
      for (const [频道, 参数] of [
        ['ai.bindSession', [新文件标识, 已存文件标识]],
        ['ai.updateSessionPlan', [新文件标识, 原会话.计划]],
        ['ai.discardSessionProposal', [新文件标识]],
        ['ai.clearSession', [新文件标识]],
      ]) expect((await 环境.调用(频道, 2, ...参数)).成功).toBe(false)
    } finally { 完成回复.释放(); await 任务 }
    expect((await 环境.基础存储.读取(新文件标识)).待确认候选).toEqual(原会话.待确认候选)
    expect(await 环境.基础存储.读取(已存文件标识)).toBeNull()
  })

  it.each([
    ['确认候选', '读取', 'ai.updateSessionPlan'],
    ['确认候选', '保存', 'ai.updateSessionPlan'],
    ['放弃候选', '读取', 'ai.discardSessionProposal'],
    ['放弃候选', '保存', 'ai.discardSessionProposal'],
    ['清除会话', '清除', 'ai.clearSession'],
  ])('%s的%s阶段占用会话，生成不能进入并覆盖该操作', async (_名称, 方法, 频道) => {
    const 环境 = await 创建环境()
    const 原会话 = await 环境.生成候选()
    const 确认计划 = 原会话.计划.map((项) => 项.status === 'awaiting_confirmation' ? { ...项, status: 'completed' } : 项)
    const 阻塞 = 环境.阻塞存储(方法, 新文件标识)
    const 操作中 = 环境.调用(频道, 1, 新文件标识, ...(频道 === 'ai.updateSessionPlan' ? [确认计划] : []))
    await 阻塞.已进入
    const 请求数量 = 环境.请求列表.length
    try {
      const 竞争结果 = await 环境.对话(新文件标识, '不应覆盖的竞争输入', 2)
      expect(竞争结果.成功).toBe(false)
      expect(环境.请求列表).toHaveLength(请求数量)
    } finally { 阻塞.放行(); await 操作中 }
    const 保存后 = await 环境.基础存储.读取(新文件标识)
    if (频道 === 'ai.clearSession') expect(保存后).toBeNull()
    else {
      expect(保存后.待确认候选).toBeNull()
      expect(保存后.显示消息).toEqual(原会话.显示消息)
    }
  })

  it.each([
    ['读取来源', '读取', 新文件标识],
    ['读取目标', '读取', 已存文件标识],
    ['保存目标', '保存', 已存文件标识],
  ])('绑定会话在%s阶段同时占用来源与目标，生成不能进入', async (_名称, 方法, 阻塞标识) => {
    const 环境 = await 创建环境()
    await 环境.对话(新文件标识, '绑定来源的真实要求')
    await 环境.对话(已存文件标识, '绑定目标的既有要求')
    const 来源 = await 环境.基础存储.读取(新文件标识)
    const 目标 = await 环境.基础存储.读取(已存文件标识)
    const 阻塞 = 环境.阻塞存储(方法, 阻塞标识)
    const 绑定中 = 环境.调用('ai.bindSession', 1, 新文件标识, 已存文件标识)
    await 阻塞.已进入
    const 请求数量 = 环境.请求列表.length
    try {
      for (const 竞争标识 of [新文件标识, 已存文件标识]) {
        const 竞争结果 = await 环境.对话(竞争标识, '不应插入的绑定竞争消息', 2)
        expect(竞争结果.成功).toBe(false)
      }
      expect(环境.请求列表).toHaveLength(请求数量)
    } finally { 阻塞.放行(); await 绑定中 }
    const 绑定后 = await 环境.基础存储.读取(已存文件标识)
    expect(绑定后.显示消息).toEqual([...目标.显示消息, ...来源.显示消息])
  })

  it('绑定读写期间仅占用相关会话，其他文件仍可生成', async () => {
    const 环境 = await 创建环境()
    await 环境.对话(新文件标识, '准备保存文档')
    const 阻塞 = 环境.阻塞存储('保存', 已存文件标识)
    const 绑定中 = 环境.调用('ai.bindSession', 1, 新文件标识, 已存文件标识)
    await 阻塞.已进入
    try {
      expect((await 环境.对话('file:e:/文档/其他文件.docx', '处理独立文档', 2)).成功).toBe(true)
      expect((await 环境.基础存储.读取('file:e:/文档/其他文件.docx')).显示消息[0].内容).toBe('处理独立文档')
    } finally { 阻塞.放行(); await 绑定中 }
  })
})
