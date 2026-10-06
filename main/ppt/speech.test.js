const fs = require('fs')
const os = require('os')
const path = require('path')
const { 合成语音, 列出声线, 创建语音缓存, 语音缓存键 } = require('./speech')

const 临时目录 = () => fs.mkdtempSync(path.join(process.env.TEMP ?? os.tmpdir(), 'seal-speech-'))
const 配置 = { 名称: '本机语音', 地址: 'https://tts.example.com/v1', 模型: 'tts-1', 声线: '女声-甲', 语速: 1.25, 密钥: 'sk-语音' }
const 音频响应 = (字节 = Buffer.from([1, 2, 3, 4])) => ({
  ok: true, status: 200, headers: { get: (名) => (名.toLowerCase() === 'content-type' ? 'audio/mpeg' : null) },
  arrayBuffer: async () => 字节.buffer.slice(字节.byteOffset, 字节.byteOffset + 字节.byteLength),
  json: async () => ({}),
})

describe('AI 语音合成', () => {
  it('按配置发送模型、声线、语速与文本，并返回真实音频字节', async () => {
    const 请求 = vi.fn(async () => 音频响应(Buffer.from('ABCD')))
    const 结果 = await 合成语音('欢迎观看本次演示', { 配置, 请求 })
    expect(结果.类型).toBe('audio/mpeg')
    expect(结果.字节数).toBe(4)
    expect(Buffer.from(结果.音频, 'base64').toString('utf8')).toBe('ABCD')
    const [地址, 选项] = 请求.mock.calls[0]
    expect(地址).toBe('https://tts.example.com/v1/audio/speech')
    expect(选项.headers.Authorization).toBe('Bearer sk-语音')
    const 请求体 = JSON.parse(选项.body)
    expect(请求体).toMatchObject({ model: 'tts-1', voice: '女声-甲', speed: 1.25 })
    expect(请求体.input).toContain('欢迎观看本次演示')
  })

  it('未配置语音服务或缺声线时明确拒绝，且不发起任何请求', async () => {
    const 请求 = vi.fn()
    await expect(合成语音('文本', { 配置: null, 请求 })).rejects.toThrow('请先配置 AI 语音合成服务')
    await expect(合成语音('文本', { 配置: { ...配置, 声线: '' }, 请求 })).rejects.toThrow('声线')
    expect(请求).not.toHaveBeenCalled()
  })

  it('空文本、超长文本与无效语速拒绝并给出真实原因', async () => {
    const 请求 = vi.fn(async () => 音频响应())
    await expect(合成语音('   ', { 配置, 请求 })).rejects.toThrow('没有需要合成的文本')
    await expect(合成语音('字'.repeat(5001), { 配置, 请求 })).rejects.toThrow('文本过长')
    await expect(合成语音('文本', { 配置: { ...配置, 语速: 5 }, 请求 })).rejects.toThrow('语速')
    expect(请求).not.toHaveBeenCalled()
  })

  it('服务错误按真实状态报告，空响应不算成功', async () => {
    const 响应 = (状态, 内容类型 = 'application/json') => ({ ok: 状态 >= 200 && 状态 < 300, status: 状态, headers: { get: () => 内容类型 }, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({ error: { message: '失败' } }) })
    await expect(合成语音('文本', { 配置, 请求: async () => 响应(401) })).rejects.toThrow('鉴权失败')
    await expect(合成语音('文本', { 配置, 请求: async () => 响应(429) })).rejects.toThrow('频繁')
    await expect(合成语音('文本', { 配置, 请求: async () => 响应(404) })).rejects.toThrow('语音合成接口')
    await expect(合成语音('文本', { 配置, 请求: async () => 响应(200, 'audio/mpeg') })).rejects.toThrow('音频为空')
    await expect(合成语音('文本', { 配置, 请求: async () => 响应(200, 'application/json') })).rejects.toThrow('不是音频')
    await expect(合成语音('文本', { 配置, 请求: async () => { throw Object.assign(new Error('x'), { name: 'TypeError' }) } })).rejects.toThrow('无法连接')
  })

  it('声线列表按真实响应返回；接口不支持时如实说明而不是编造声线', async () => {
    const 成功 = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: '女声-甲', name: '女声-甲' }, { id: '男声-乙' }] }) }))
    const 结果 = await 列出声线({ 配置, 请求: 成功 })
    expect(结果.声线).toEqual([{ 标识: '女声-甲', 名称: '女声-甲' }, { 标识: '男声-乙', 名称: '男声-乙' }])
    const 不支持 = await 列出声线({ 配置, 请求: async () => ({ ok: false, status: 404, json: async () => ({}) }) })
    expect(不支持).toMatchObject({ 成功: false, 原因: expect.stringContaining('未提供声线列表接口') })
    const 未配置 = await 列出声线({ 配置: null, 请求: 成功 })
    expect(未配置).toMatchObject({ 成功: false, 原因: expect.stringContaining('请先配置') })
  })
})

describe('分页音频缓存', () => {
  it('同一文本命中缓存，不同声线不共享缓存', async () => {
    const 目录 = 临时目录()
    const 缓存 = 创建语音缓存({ 目录 })
    const 请求 = vi.fn(async () => 音频响应(Buffer.from('音频一')))
    const 首次 = await 合成语音('第一页讲解', { 配置, 请求, 缓存 })
    expect(首次.命中缓存).toBe(false)
    const 再次 = await 合成语音('第一页讲解', { 配置, 请求, 缓存 })
    expect(再次.命中缓存).toBe(true)
    expect(再次.音频).toBe(首次.音频)
    expect(请求).toHaveBeenCalledTimes(1)
    const 换声线 = await 合成语音('第一页讲解', { 配置: { ...配置, 声线: '男声-乙' }, 请求, 缓存 })
    expect(换声线.命中缓存).toBe(false)
    expect(请求).toHaveBeenCalledTimes(2)
    expect(语音缓存键({ ...配置, 声线: '男声-乙' }, '第一页讲解')).not.toBe(语音缓存键(配置, '第一页讲解'))
  })

  it('缓存文件按内容寻址，重复写入不产生重复文件，可整体清除', async () => {
    const 目录 = 临时目录()
    const 缓存 = 创建语音缓存({ 目录 })
    await 合成语音('第二页讲解', { 配置, 请求: async () => 音频响应(Buffer.from('音频二')), 缓存 })
    await 合成语音('第二页讲解', { 配置, 请求: async () => 音频响应(Buffer.from('音频二')), 缓存 })
    expect(fs.readdirSync(目录).filter((名) => 名.endsWith('.bin'))).toHaveLength(1)
    expect(await 缓存.读取(语音缓存键(配置, '第二页讲解'))).toMatchObject({ 类型: 'audio/mpeg' })
    await 缓存.清除()
    expect(fs.readdirSync(目录)).toHaveLength(0)
  })

  it('缓存读取失败时回退到真实请求而不是返回空音频', async () => {
    const 目录 = 临时目录()
    fs.mkdirSync(目录, { recursive: true })
    fs.writeFileSync(path.join(目录, 语音缓存键(配置, '文本') + '.json'), '{ 坏掉的元数据')
    const 请求 = vi.fn(async () => 音频响应(Buffer.from('音频三')))
    const 结果 = await 合成语音('文本', { 配置, 请求, 缓存: 创建语音缓存({ 目录 }) })
    expect(结果.命中缓存).toBe(false)
    expect(结果.字节数).toBeGreaterThan(0)
    expect(请求).toHaveBeenCalledTimes(1)
  })
})
