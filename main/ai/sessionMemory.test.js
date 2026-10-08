const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const { 创建会话存储, 估算令牌, 压缩上下文 } = require('./sessionMemory')

function 创建安全存储() {
  const 密钥 = crypto.randomBytes(32)
  return {
    isEncryptionAvailable: () => true,
    encryptString: (文本) => {
      const 初始向量 = crypto.randomBytes(12)
      const 加密 = crypto.createCipheriv('aes-256-gcm', 密钥, 初始向量)
      const 密文 = Buffer.concat([加密.update(文本, 'utf8'), 加密.final()])
      return Buffer.concat([初始向量, 加密.getAuthTag(), 密文])
    },
    decryptString: (密文) => {
      const 解密 = crypto.createDecipheriv('aes-256-gcm', 密钥, 密文.subarray(0, 12))
      解密.setAuthTag(密文.subarray(12, 28))
      return Buffer.concat([解密.update(密文.subarray(28)), 解密.final()]).toString('utf8')
    },
  }
}

function 创建会话(内容 = '请继续排版。') {
  return {
    模型消息: [{ role: 'user', content: 内容 }, { role: 'assistant', content: '已整理段落。' }],
    显示消息: [{ 角色: 'user', 内容 }, { 角色: 'assistant', 内容: '已整理段落。', 思考: '先核对原文。' }],
    摘要: '保留原文数据。',
    计划: [{ id: '第一步', title: '检查文档', status: 'completed' }],
    压缩次数: 2,
    文件版本: { 修改时间: 1688, 完整性: '原版本' },
  }
}

describe('加密对话记忆', () => {
  let 目录
  let 安全存储
  let 存储

  beforeEach(async () => {
    目录 = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'seal-session-memory-'))
    安全存储 = 创建安全存储()
    存储 = 创建会话存储({ 目录, 安全存储 })
  })

  afterEach(async () => {
    if (目录 && path.basename(目录).startsWith('seal-session-memory-')) await fs.promises.rm(目录, { recursive: true, force: true })
  })

  it('提供完整的会话存储接口', () => {
    expect(创建会话存储).toBeTypeOf('function')
    expect(存储.读取).toBeTypeOf('function')
    expect(存储.保存).toBeTypeOf('function')
    expect(存储.清除).toBeTypeOf('function')
  })

  it('恢复完整加密会话并隔离不同文件的消息', async () => {
    const 第一份 = 创建会话('第一份文件的私人正文')
    const 第二份 = 创建会话('第二份文件的内容')
    expect(await 存储.读取('从未打开')).toBeNull()
    await 存储.保存('E:\\文档\\甲.docx', 第一份)
    await 存储.保存('E:\\文档\\乙.docx', 第二份)
    const 新实例 = 创建会话存储({ 目录, 安全存储 })
    expect(await 新实例.读取('E:\\文档\\甲.docx')).toEqual(第一份)
    expect(await 新实例.读取('E:\\文档\\乙.docx')).toEqual(第二份)
    for (const 文件 of await fs.promises.readdir(目录)) {
      expect((await fs.promises.readFile(path.join(目录, 文件))).toString('utf8')).not.toContain('私人正文')
    }
  })

  it('会话标识只产生目录内的摘要文件名', async () => {
    const 标识 = '..\\..\\外部.docx'
    await 存储.保存(标识, 创建会话())
    const 文件 = await fs.promises.readdir(目录)
    expect(文件).toHaveLength(1)
    expect(文件[0]).toContain(crypto.createHash('sha256').update(标识).digest('hex'))
    expect(文件[0]).not.toContain('外部')
    expect(await 存储.读取(标识)).toEqual(创建会话())
  })

  it('保存时快照完整数据，不受调用方后续修改影响', async () => {
    const 会话 = 创建会话()
    const 保存中 = 存储.保存('当前文档', 会话)
    会话.显示消息[0].内容 = '随后修改'
    await 保存中
    expect((await 存储.读取('当前文档')).显示消息[0].内容).toBe('请继续排版。')
  })

  it('并发保存按提交顺序完成且不留下临时文件', async () => {
    await Promise.all([存储.保存('并发文档', 创建会话('第一轮')), 存储.保存('并发文档', 创建会话('第二轮'))])
    expect((await 存储.读取('并发文档')).模型消息[0].content).toBe('第二轮')
    expect(await fs.promises.readdir(目录)).toHaveLength(1)
  })

  it('同一目录的不同存储实例也按保存和读取顺序完成', async () => {
    const 新实例 = 创建会话存储({ 目录, 安全存储 })
    const 保存一 = 存储.保存('共享文档', 创建会话('第一轮'))
    const 保存二 = 新实例.保存('共享文档', 创建会话('第二轮'))
    const 读取中 = 存储.读取('共享文档')
    await Promise.all([保存一, 保存二])
    expect((await 读取中).模型消息[0].content).toBe('第二轮')
  })

  it('清除排在尚未完成的保存之后并真正删除文件', async () => {
    let 写入开始
    let 允许写完
    const 已开始 = new Promise((完成) => { 写入开始 = 完成 })
    const 等待 = new Promise((完成) => { 允许写完 = 完成 })
    const 慢存储 = 创建会话存储({
      目录, 安全存储,
      存储: { ...fs.promises, writeFile: async (...参数) => { 写入开始(); await 等待; return fs.promises.writeFile(...参数) } },
    })
    const 保存中 = 慢存储.保存('待清除', 创建会话())
    await 已开始
    const 清除中 = 慢存储.清除('待清除')
    允许写完()
    await Promise.all([保存中, 清除中])
    expect(await 慢存储.读取('待清除')).toBeNull()
    await expect(慢存储.清除('待清除')).resolves.toBeUndefined()
  })

  it('写入失败保留原会话并报告实际失败', async () => {
    await 存储.保存('原文档', 创建会话('原始内容'))
    const 失败存储 = 创建会话存储({
      目录, 安全存储,
      存储: { ...fs.promises, rename: async () => { const 错误 = new Error('磁盘权限拒绝'); 错误.code = 'EACCES'; throw 错误 } },
    })
    await expect(失败存储.保存('原文档', 创建会话('新内容'))).rejects.toThrow('保存')
    expect((await 存储.读取('原文档')).模型消息[0].content).toBe('原始内容')
    expect(await fs.promises.readdir(目录)).toHaveLength(1)
  })

  it('读取权限错误不能伪装为不存在', async () => {
    const 失败存储 = 创建会话存储({ 目录, 安全存储, 存储: { readFile: async () => { const 错误 = new Error('拒绝访问'); 错误.code = 'EACCES'; throw 错误 } } })
    await expect(失败存储.读取('任意文档')).rejects.toThrow('读取')
  })

  it('无法解密时报告错误并保留损坏原件', async () => {
    await 存储.保存('损坏文档', 创建会话())
    const 文件 = path.join(目录, (await fs.promises.readdir(目录))[0])
    await fs.promises.writeFile(文件, Buffer.from('损坏数据'))
    await expect(存储.读取('损坏文档')).rejects.toThrow('解密')
    expect(await fs.promises.readFile(文件, 'utf8')).toBe('损坏数据')
  })

  it('解密成功但数据损坏时不能恢复默认会话', async () => {
    await 存储.保存('损坏文档', 创建会话())
    const 文件 = path.join(目录, (await fs.promises.readdir(目录))[0])
    await fs.promises.writeFile(文件, 安全存储.encryptString('{无效内容'))
    await expect(存储.读取('损坏文档')).rejects.toThrow('损坏')
    await fs.promises.writeFile(文件, 安全存储.encryptString('{"模型消息":[]}'))
    await expect(存储.读取('损坏文档')).rejects.toThrow('损坏')
  })

  it('系统加密不可用时不以明文替代', async () => {
    const 无加密存储 = 创建会话存储({ 目录, 安全存储: { ...安全存储, isEncryptionAvailable: () => false } })
    await expect(无加密存储.保存('私人文档', 创建会话())).rejects.toThrow('加密')
    expect(await fs.promises.readdir(目录)).toHaveLength(0)
    await 存储.保存('已有文档', 创建会话())
    await expect(无加密存储.读取('已有文档')).rejects.toThrow('加密')
  })

  it('系统加密状态查询异常时展示中文错误并保留实际原因', async () => {
    const 故障 = new Error('系统安全存储查询失败')
    const 无加密存储 = 创建会话存储({ 目录, 安全存储: { ...安全存储, isEncryptionAvailable: () => { throw 故障 } } })
    await expect(无加密存储.保存('私人文档', 创建会话())).rejects.toMatchObject({ message: expect.stringContaining('加密'), cause: 故障 })
    expect(await fs.promises.readdir(目录)).toHaveLength(0)
  })
})

describe('完整上下文摘要压缩', () => {
  it('按照真实字节估算中英文并计入工具字段及消息开销', () => {
    expect(估算令牌).toBeTypeOf('function')
    expect(估算令牌('中文')).toBe(3)
    expect(估算令牌('abcd')).toBe(2)
    expect(估算令牌([{ role: 'user', content: 'abcd' }])).toBeGreaterThan(2)
    expect(估算令牌([{ role: 'assistant', content: null, tool_calls: [{ id: '调用', type: 'function', function: { name: 'read_document', arguments: '正文'.repeat(100) } }] }])).toBeGreaterThan(300)
  })

  it('未到触发预算时保留原消息和摘要且不调用模型', async () => {
    const 消息 = [{ role: 'user', content: '请继续' }]
    const 生成摘要 = vi.fn()
    const 结果 = await 压缩上下文({ 消息, 摘要: '已有摘要', 上下文令牌: 2000, 生成摘要 })
    expect(结果).toMatchObject({ 消息, 摘要: '已有摘要', 已压缩: false, 压缩次数: 0 })
    expect(生成摘要).not.toHaveBeenCalled()
  })

  it('达到八成预算时真实摘要旧历史并保留最近完整用户轮次', async () => {
    const 消息 = [{ role: 'user', content: '旧要求'.repeat(250) }, { role: 'assistant', content: '旧回答'.repeat(250) }, { role: 'user', content: '当前要求' }, { role: 'assistant', content: '当前回答' }]
    const 原值 = JSON.stringify(消息)
    const 推送 = vi.fn()
    const 生成摘要 = vi.fn(async () => '用户要求保留原文，已经检查旧内容。')
    const 结果 = await 压缩上下文({ 消息, 摘要: '更早的真实记忆', 上下文令牌: 2000, 生成摘要, 推送 })
    expect(结果.消息).toEqual(消息.slice(-2))
    expect(结果.摘要).toContain('用户要求')
    expect(结果).toMatchObject({ 已压缩: true, 压缩次数: 1 })
    expect(生成摘要.mock.calls.map(([文本]) => 文本).join('\n')).toContain('更早的真实记忆')
    expect(JSON.stringify(消息)).toBe(原值)
    expect(推送.mock.calls.some(([事件]) => 事件.类型 === '压缩' && typeof 事件.内容 === 'string')).toBe(true)
  })

  it('固定消息计入预算但不会写回历史消息', async () => {
    const 消息 = [{ role: 'user', content: '历史内容'.repeat(100) }, { role: 'assistant', content: '旧答复' }, { role: 'user', content: '继续' }]
    const 固定消息 = [{ role: 'system', content: '文档说明'.repeat(300) }]
    const 结果 = await 压缩上下文({ 消息, 固定消息, 上下文令牌: 2000, 生成摘要: async () => '真实旧记录摘要。' })
    expect(结果.已压缩).toBe(true)
    expect(结果.消息).toEqual([消息.at(-1)])
    expect(结果.消息).not.toContain(固定消息[0])
  })

  it('最新用户尚未得到答复时保留上一完整轮次和当前输入', async () => {
    const 消息 = [
      { role: 'user', content: '很早的要求'.repeat(1000) }, { role: 'assistant', content: '早期答复' },
      { role: 'user', content: '上一轮的具体要求' }, { role: 'assistant', content: '上一轮的重要结论' },
      { role: 'user', content: '按刚才结论继续' },
    ]
    const 结果 = await 压缩上下文({ 消息, 上下文令牌: 2000, 生成摘要: async () => '早期任务的真实摘要。' })
    expect(结果.消息).toEqual(消息.slice(2))
  })

  it('很长的单条历史拆分后全部摘要，每个模型批次低于配置预算', async () => {
    const 超长正文 = '甲'.repeat(9000) + '中部真实约束' + '乙'.repeat(9000) + '末尾必须保留'
    const 消息 = [{ role: 'user', content: '旧轮次' }, { role: 'assistant', content: 超长正文 }, { role: 'user', content: '新问题' }]
    const 批次 = []
    const 结果 = await 压缩上下文({ 消息, 上下文令牌: 2000, 生成摘要: async (文本) => { 批次.push(文本); return '这一片段的真实摘要。' } })
    expect(结果.已压缩).toBe(true)
    expect(批次.length).toBeGreaterThan(2)
    expect(批次.every((文本) => 估算令牌(文本) < 2000)).toBe(true)
    expect(批次.join('')).toContain('中部真实约束')
    expect(批次.join('')).toContain('末尾必须保留')
    expect(结果.消息).toEqual([消息.at(-1)])
  })

  it('最近一轮的超长助手回复仍被摘要，原用户输入保留', async () => {
    const 消息 = [{ role: 'user', content: '请完整总结' }, { role: 'assistant', content: '完整总结'.repeat(2500) }]
    const 生成摘要 = vi.fn(async () => '该轮已经完成全面总结，原文数据未变。')
    const 结果 = await 压缩上下文({ 消息, 上下文令牌: 2000, 生成摘要 })
    expect(结果.已压缩).toBe(true)
    expect(结果.消息).toEqual([消息[0]])
    expect(生成摘要.mock.calls.map(([文本]) => 文本).join('')).toContain('完整总结')
  })

  it('分批历史全部整理后再调用模型合并最终摘要', async () => {
    const 消息 = [{ role: 'user', content: '旧用户要求'.repeat(1000) }, { role: 'assistant', content: '旧结论' }, { role: 'user', content: '继续' }]
    const 生成摘要 = vi.fn(async (文本) => 文本.includes('合并摘要') ? '经过模型合并的真实会话记忆。' : '某片段的事实。')
    const 结果 = await 压缩上下文({ 消息, 上下文令牌: 2000, 生成摘要 })
    expect(生成摘要.mock.calls.at(-1)[0]).toContain('合并摘要')
    expect(结果.摘要).toBe('经过模型合并的真实会话记忆。')
  })

  it('最新很长用户输入且没有历史时保留输入并直接交由模型预算处理', async () => {
    const 消息 = [{ role: 'user', content: '完整新目标'.repeat(5000) }]
    const 生成摘要 = vi.fn()
    const 结果 = await 压缩上下文({ 消息, 上下文令牌: 2000, 生成摘要 })
    expect(结果).toMatchObject({ 消息, 已压缩: false })
    expect(生成摘要).not.toHaveBeenCalled()
  })

  it('压缩当前工具轮次时原生思考字段保持完整且不会出现孤立返回', async () => {
    const 消息 = [
      { role: 'user', content: '此前要求'.repeat(1000) }, { role: 'assistant', content: '旧结论' },
      { role: 'user', content: '当前任务' },
      { role: 'assistant', content: null, reasoning_content: '当前轮的完整思考', tool_calls: [{ id: '读取', type: 'function', function: { name: 'read_document', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: '读取', content: '文档范围内容' },
      { role: 'assistant', content: '工具读取完成', reasoning_content: '读取后的完整思考' },
    ]
    const 结果 = await 压缩上下文({ 消息, 上下文令牌: 2000, 生成摘要: async () => '旧记录真实摘要。' })
    expect(结果.消息).toEqual(消息.slice(2))
    expect(结果.消息[1].reasoning_content).toBe('当前轮的完整思考')
  })

  it('最新用户长输入完整保留，不因任意文字限额拒绝', async () => {
    const 消息 = [{ role: 'user', content: '旧要求'.repeat(300) }, { role: 'assistant', content: '旧答复'.repeat(300) }, { role: 'user', content: '用户完整新要求'.repeat(5000) }]
    const 结果 = await 压缩上下文({ 消息, 上下文令牌: 2000, 生成摘要: async () => '以前已经核对正文。' })
    expect(结果.消息).toEqual([消息.at(-1)])
    expect(结果.已压缩).toBe(true)
  })

  it('多轮完整工具调用和返回成组保留，摘要也不遗漏工具事实', async () => {
    const 消息 = [
      { role: 'user', content: '旧任务'.repeat(500) },
      { role: 'assistant', content: null, tool_calls: [{ id: '旧调用', type: 'function', function: { name: 'read_document', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: '旧调用', content: '旧文档真实内容'.repeat(100) },
      { role: 'assistant', content: '旧处理完成' },
      { role: 'user', content: '继续读取' },
      { role: 'assistant', content: null, tool_calls: [{ id: '调用一', type: 'function', function: { name: 'read_document', arguments: '{}' } }, { id: '调用二', type: 'function', function: { name: 'set_plan', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: '调用一', content: '当前文档原文' },
      { role: 'tool', tool_call_id: '调用二', content: '当前计划' },
      { role: 'assistant', content: '当前工具轮次完成' },
    ]
    const 生成摘要 = vi.fn(async () => '旧工具读取了原文，并完成旧任务。')
    const 结果 = await 压缩上下文({ 消息, 上下文令牌: 2000, 生成摘要 })
    expect(结果.消息).toEqual(消息.slice(4))
    expect(生成摘要.mock.calls.map(([文本]) => 文本).join('')).toContain('旧文档真实内容')
  })

  it('最近轮次超长工具结果被整组摘要，不留下孤立工具返回', async () => {
    const 消息 = [
      { role: 'user', content: '读取全文' },
      { role: 'assistant', content: null, tool_calls: [{ id: '读取', type: 'function', function: { name: 'read_document', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: '读取', content: '很长文档内容'.repeat(2500) },
      { role: 'assistant', content: '已读取完成' },
    ]
    const 结果 = await 压缩上下文({ 消息, 上下文令牌: 2000, 生成摘要: async () => '读取了全文，下一步核对标题。' })
    expect(结果.消息).toEqual([消息[0]])
    expect(结果.消息.some((项) => 项.role === 'tool')).toBe(false)
  })

  it('工具尚未全部返回时保留完整未完成调用组', async () => {
    const 消息 = [
      { role: 'user', content: '历史要求'.repeat(500) }, { role: 'assistant', content: '旧答复' },
      { role: 'user', content: '当前任务' },
      { role: 'assistant', content: null, tool_calls: [{ id: '已返回', type: 'function', function: { name: 'read_document', arguments: '{}' } }, { id: '未返回', type: 'function', function: { name: 'set_plan', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: '已返回', content: '已读取内容' },
    ]
    const 结果 = await 压缩上下文({ 消息, 上下文令牌: 2000, 生成摘要: async () => '旧任务历史摘要。' })
    expect(结果.消息).toEqual(消息.slice(2))
  })

  it('各批摘要过长时继续合并压缩到可用预算', async () => {
    let 次数 = 0
    const 消息 = [{ role: 'user', content: '旧要求'.repeat(4000) }, { role: 'assistant', content: '旧答复' }, { role: 'user', content: '继续' }]
    const 结果 = await 压缩上下文({ 消息, 上下文令牌: 2000, 生成摘要: async (文本) => { 次数++; return 文本.includes('合并摘要') ? '完整合并的真实摘要。' : '这一批经过模型核对的事实。'.repeat(10) } })
    expect(次数).toBeGreaterThan(3)
    expect(估算令牌(结果.摘要) + 估算令牌(结果.消息)).toBeLessThan(1400)
  })

  it('模型持续返回超预算摘要时真实报错并保留原记录', async () => {
    const 消息 = [{ role: 'user', content: '旧要求'.repeat(500) }, { role: 'assistant', content: '旧答复' }, { role: 'user', content: '继续' }]
    const 原值 = JSON.stringify(消息)
    await expect(压缩上下文({ 消息, 上下文令牌: 2000, 生成摘要: async () => '不能缩短的模型回复'.repeat(1000) })).rejects.toThrow('摘要')
    expect(JSON.stringify(消息)).toBe(原值)
  })

  it('摘要失败和空摘要均不能覆盖原始消息', async () => {
    const 消息 = [{ role: 'user', content: '历史'.repeat(1000) }, { role: 'assistant', content: '答复' }, { role: 'user', content: '继续' }]
    const 原值 = JSON.stringify(消息)
    await expect(压缩上下文({ 消息, 摘要: '原摘要', 上下文令牌: 2000, 生成摘要: async () => { throw new Error('模型接口限流') } })).rejects.toThrow('模型接口限流')
    await expect(压缩上下文({ 消息, 摘要: '原摘要', 上下文令牌: 2000, 生成摘要: async () => '  ' })).rejects.toThrow('摘要')
    expect(JSON.stringify(消息)).toBe(原值)
  })

  it('开始前取消不会调用模型', async () => {
    const 控制 = new AbortController()
    控制.abort()
    const 生成摘要 = vi.fn()
    await expect(压缩上下文({ 消息: [{ role: 'user', content: '旧历史'.repeat(1000) }], 信号: 控制.signal, 生成摘要 })).rejects.toMatchObject({ name: 'AbortError' })
    expect(生成摘要).not.toHaveBeenCalled()
  })

  it('摘要过程中取消会立即传播并保留原始记录', async () => {
    const 控制 = new AbortController()
    const 消息 = [{ role: 'user', content: '历史'.repeat(1000) }, { role: 'assistant', content: '答复' }, { role: 'user', content: '继续' }]
    const 原值 = JSON.stringify(消息)
    let 摘要开始
    const 已开始 = new Promise((完成) => { 摘要开始 = 完成 })
    const 摘要中 = 压缩上下文({ 消息, 上下文令牌: 2000, 信号: 控制.signal, 生成摘要: async (文本, 信号) => { expect(信号).toBe(控制.signal); 摘要开始(); return new Promise(() => {}) } })
    await 已开始
    控制.abort()
    await expect(摘要中).rejects.toMatchObject({ name: 'AbortError' })
    expect(JSON.stringify(消息)).toBe(原值)
  })
})


describe('80%窗口和手动压缩', () => {
  it('75%不压缩，达到80%才自动压缩', async () => {
    const 消息 = [{ role: 'user', content: '早期记录' }, { role: 'assistant', content: '结论' }, { role: 'user', content: '继续' }]
    const 总数 = 估算令牌(消息), 生成摘要 = vi.fn(async () => '旧记录摘要')
    const 窗口 = Math.ceil(总数 / 0.75)
    expect((await 压缩上下文({ 消息, 上下文令牌: 窗口, 生成摘要 })).已压缩).toBe(false)
    expect(生成摘要).not.toHaveBeenCalled()
    const 大历史 = [{ role: 'user', content: '旧正文'.repeat(100) }, { role: 'assistant', content: '旧结论' }, { role: 'user', content: '继续' }]
    expect((await 压缩上下文({ 消息: 大历史, 上下文令牌: Math.floor(估算令牌(大历史) / 0.8), 生成摘要 })).已压缩).toBe(true)
  })
})
