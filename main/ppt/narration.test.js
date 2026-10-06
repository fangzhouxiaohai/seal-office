const fs = require('fs')
const os = require('os')
const path = require('path')
const { 生成讲稿, 合成讲解音频 } = require('./narration')

const 页 = (标识, 文本) => ({ 页标识: 标识, 标题: `标题-${标识}`, 文本, 备注: '' })
const 讲稿模型 = (映射) => async () => JSON.stringify({ 讲稿: Object.entries(映射).map(([页标识, 讲稿]) => ({ 页标识, 讲稿 })) })
const 临时目录 = () => fs.mkdtempSync(path.join(process.env.TEMP ?? os.tmpdir(), 'seal-narration-'))
const 音频响应 = () => ({
  ok: true, status: 200, headers: { get: () => 'audio/mpeg' },
  arrayBuffer: async () => Uint8Array.from([9, 9, 9]).buffer,
})

describe('智能讲 PPT 讲稿生成', () => {
  it('按页面稳定标识分页生成讲稿并保留内容范围', async () => {
    const 调用模型 = vi.fn(讲稿模型({ 页一: '第一页讲解词', 页二: '第二页讲解词' }))
    const 结果 = await 生成讲稿({ 页列表: [页('页一', '营收增长'), 页('页二', '下一步计划')], 调用模型 })
    expect(结果.讲稿).toEqual([
      { 页标识: '页一', 讲稿: '第一页讲解词' },
      { 页标识: '页二', 讲稿: '第二页讲解词' },
    ])
    expect(调用模型.mock.calls[0][0].用户内容).toContain('页一')
    expect(调用模型.mock.calls[0][0].用户内容).toContain('下一步计划')
    expect(调用模型.mock.calls[0][0].系统提示).toContain('JSON')
  })

  it('缺少页面、重复页面或空讲稿时整体拒绝，不产生半份讲稿', async () => {
    await expect(生成讲稿({ 页列表: [页('页一', '甲'), 页('页二', '乙')], 调用模型: 讲稿模型({ 页一: '只有一页' }) }))
      .rejects.toThrow('缺少页标识：页二')
    await expect(生成讲稿({ 页列表: [页('页一', '甲')], 调用模型: async () => JSON.stringify({ 讲稿: [{ 页标识: '页一', 讲稿: '甲' }, { 页标识: '页一', 讲稿: '甲2' }] }) }))
      .rejects.toThrow('重复页标识')
    await expect(生成讲稿({ 页列表: [页('页一', '甲')], 调用模型: 讲稿模型({ 页一: '   ' }) })).rejects.toThrow('讲稿为空')
    await expect(生成讲稿({ 页列表: [页('页一', '甲')], 调用模型: async () => '{"讲稿":[' })).rejects.toThrow('讲稿格式无效')
    await expect(生成讲稿({ 页列表: [], 调用模型: async () => '{}' })).rejects.toThrow('没有可生成讲稿的页面')
    await expect(生成讲稿({ 页列表: [页('页一', '')], 调用模型: async () => '{}' })).rejects.toThrow('没有可生成讲稿的页面')
    await expect(生成讲稿({ 页列表: [页('页一', '甲')] })).rejects.toThrow('必须调用 AI 模型服务')
  })
})

describe('讲稿音频按页绑定与失败隔离', () => {
  const 语音配置 = { 地址: 'https://tts.example.com/v1', 模型: 'tts-1', 声线: '女声-甲', 语速: 1, 密钥: 'k' }

  it('逐页合成并按页标识绑定缓存键，失败页只影响自己', async () => {
    const 目录 = 临时目录()
    const { 创建语音缓存 } = require('./speech')
    const 缓存 = 创建语音缓存({ 目录 })
    const 请求 = vi.fn(async (地址, 选项) => {
      const 文本 = JSON.parse(选项.body).input
      if (文本.includes('第二页')) return { ok: false, status: 429, headers: { get: () => 'application/json' }, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) }
      return 音频响应()
    })
    const 结果 = await 合成讲解音频({
      讲稿: [{ 页标识: '页一', 讲稿: '第一页讲解' }, { 页标识: '页二', 讲稿: '第二页讲解' }, { 页标识: '页三', 讲稿: '第三页讲解' }],
      语音配置, 请求, 缓存,
    })
    expect(结果.音频.map((项) => 项.页标识)).toEqual(['页一', '页三'])
    expect(结果.音频[0]).toMatchObject({ 页标识: '页一', 类型: 'audio/mpeg' })
    expect(结果.音频[0].缓存键).toMatch(/^[0-9a-f]{64}$/)
    expect(结果.失败).toEqual([{ 页标识: '页二', 原因: expect.stringContaining('频繁') }])
    expect(请求).toHaveBeenCalledTimes(3)
  })

  it('未配置语音服务时全部页面如实失败，不伪造音频', async () => {
    const 请求 = vi.fn()
    const 结果 = await 合成讲解音频({ 讲稿: [{ 页标识: '页一', 讲稿: '讲解' }], 语音配置: null, 请求 })
    expect(结果.音频).toEqual([])
    expect(结果.失败[0].原因).toContain('请先配置 AI 语音合成服务')
    expect(请求).not.toHaveBeenCalled()
  })

  it('重复合成同一页命中缓存，不产生重复音频文件', async () => {
    const 目录 = 临时目录()
    const { 创建语音缓存 } = require('./speech')
    const 缓存 = 创建语音缓存({ 目录 })
    const 请求 = vi.fn(async () => 音频响应())
    const 参数 = { 讲稿: [{ 页标识: '页一', 讲稿: '同一段讲解' }], 语音配置, 请求, 缓存 }
    await 合成讲解音频(参数)
    const 再次 = await 合成讲解音频(参数)
    expect(请求).toHaveBeenCalledTimes(1)
    expect(再次.音频[0].命中缓存).toBe(true)
    expect(fs.readdirSync(目录).filter((名) => 名.endsWith('.bin'))).toHaveLength(1)
  })
})
