const fs = require('fs')
const os = require('os')
const path = require('path')
const { 注册演示生成通道 } = require('./presentationGenerationChannel')

const 文本配置 = { 名称: 'DeepSeek', 地址: 'https://api.deepseek.com/chat/completions', 模型: 'deepseek-flash', 已配置密钥: true }
const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('素材字节')])

function 建环境({ 助手配置 = 文本配置, 对话回复 = '{"提纲":[{"页标识":"p1","标题":"标题","版式":"标题幻灯片","要点":[]}]}' } = {}) {
  const 处理 = new Map()
  const 助手服务 = { 读取配置: async () => 助手配置, 对话: vi.fn(async () => ({ 内容: 对话回复 })) }
  const 服务存储 = { 读取: async () => null, 读取内部密钥: () => '' }
  const 目录 = fs.mkdtempSync(path.join(process.env.TEMP ?? os.tmpdir(), 'seal-gen-channel-'))
  const 发送 = []
  注册演示生成通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, { 助手服务, 服务存储, 用户数据目录: 目录 })
  const 事件 = { sender: { id: 11, isDestroyed: () => false, send: (...参数) => 发送.push(参数) } }
  const 调用 = (名称, ...参数) => 处理.get(名称)(事件, ...参数)
  return { 调用, 助手服务, 发送, 目录 }
}

describe('演示生成与素材通道', () => {
  it('未配置文本模型时拒绝生成并说明原因，且不调用模型', async () => {
    const { 调用, 助手服务 } = 建环境({ 助手配置: { ...文本配置, 已配置密钥: false, 服务商: 'deepseek' } })
    const 结果 = await 调用('presentation.generate.outline', { 请求标识: 'r1', 主题: '季度汇报', 页数: 1 })
    expect(结果.成功).toBe(false)
    expect(结果.错误).toMatch(/密钥|配置/)
    expect(助手服务.对话).not.toHaveBeenCalled()
  })

  it('生成提纲走共用文本链路并返回校验后的提纲', async () => {
    const { 调用, 助手服务, 发送 } = 建环境()
    const 结果 = await 调用('presentation.generate.outline', { 请求标识: 'r2', 主题: '季度汇报', 页数: 1, 受众: '管理层' })
    expect(结果.成功).toBe(true)
    expect(结果.数据.提纲[0]).toMatchObject({ 页标识: 'p1', 标题: '标题' })
    expect(助手服务.对话).toHaveBeenCalledTimes(1)
    expect(发送.length).toBe(0)
  })

  it('请求标识缺失或重复并发时给出真实原因', async () => {
    const { 调用 } = 建环境()
    expect(await 调用('presentation.generate.outline', { 主题: 'x', 页数: 1 })).toMatchObject({ 成功: false, 错误: expect.stringContaining('请求标识') })
    const 慢环境 = 建环境({ 对话回复: '{"提纲":[]}' })
    let 释放
    const 阻塞 = new Promise((完成) => { 释放 = 完成 })
    慢环境.助手服务.对话.mockImplementation(async () => { await 阻塞; return { 内容: '{"提纲":[]}' } })
    const 第一次 = 慢环境.调用('presentation.generate.outline', { 请求标识: 'r3', 主题: 'x', 页数: 1 })
    const 第二次 = await 慢环境.调用('presentation.generate.outline', { 请求标识: 'r4', 主题: 'x', 页数: 1 })
    expect(第二次).toMatchObject({ 成功: false, 错误: expect.stringContaining('等待') })
    释放()
    await 第一次
  })

  it('素材库支持导入、列出、检索、读取与删除，并校验 base64 与类型', async () => {
    const { 调用 } = 建环境()
    const 导入 = await 调用('presentation.assets.import', { 数据: PNG.toString('base64'), 类型: 'image/png', 名称: '底图', 分类: '背景', 授权: '自制' })
    expect(导入.成功).toBe(true)
    const 标识 = 导入.数据.素材.标识
    const 列表 = await 调用('presentation.assets.list')
    expect(列表.数据).toHaveLength(1)
    const 检索 = await 调用('presentation.assets.search', '底图')
    expect(检索.数据).toHaveLength(1)
    const 读取 = await 调用('presentation.assets.read', 标识)
    expect(读取.数据.数据).toBe(PNG.toString('base64'))
    expect(await 调用('presentation.assets.import', { 数据: '!!!', 类型: 'image/png', 名称: 'x', 分类: '背景', 授权: '自制' })).toMatchObject({ 成功: false })
    expect(await 调用('presentation.assets.import', { 数据: PNG.toString('base64'), 类型: 'image/gif', 名称: 'x', 分类: '背景', 授权: '自制' })).toMatchObject({ 成功: false, 错误: expect.stringContaining('类型') })
    const 删除 = await 调用('presentation.assets.remove', 标识)
    expect(删除.成功).toBe(true)
    expect((await 调用('presentation.assets.list')).数据).toHaveLength(0)
  })

  it('文档提纲导入支持文本与注入的 DOCX 读取，并报告遗漏', async () => {
    const { 调用 } = 建环境()
    const md = await 调用('presentation.generate.readOutline', { 名称: '提纲.md', 数据: Buffer.from('# 标题\n- 要点一').toString('base64') })
    expect(md.成功).toBe(true)
    expect(md.数据.提纲[0].标题).toBe('标题')
    expect(md.数据.来源.名称).toBe('提纲.md')
    expect(await 调用('presentation.generate.readOutline', { 名称: '稿件.pdf', 数据: Buffer.from('x').toString('base64') })).toMatchObject({ 成功: false, 错误: expect.stringContaining('不支持') })
  })

  it('素材语义搜索只允许重排图库中已有素材', async () => {
    const 环境 = 建环境()
    const 甲 = await 环境.调用('presentation.assets.import', { 数据: PNG.toString('base64'), 类型: 'image/png', 名称: '商务底图', 分类: '背景', 授权: '自制' })
    const 乙 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('另一张')])
    const 已导入 = await 环境.调用('presentation.assets.import', { 数据: 乙.toString('base64'), 类型: 'image/jpeg', 名称: '数据图', 分类: '图片', 授权: '客户提供' })
    环境.助手服务.对话.mockResolvedValue({ 内容: JSON.stringify({ 结果: [
      { 标识: 已导入.数据.素材.标识, 相关度: 95, 理由: '与数据页匹配' },
      { 标识: 甲.数据.素材.标识, 相关度: 40, 理由: '可作封面' },
    ] }) })
    const 结果 = await 环境.调用('presentation.assets.semanticSearch', { 请求标识: 'r5', 查询: '数据页配图' })
    expect(结果.成功).toBe(true)
    expect(结果.数据.结果.map((项) => 项.标识)).toEqual([已导入.数据.素材.标识, 甲.数据.素材.标识])

    环境.助手服务.对话.mockResolvedValue({ 内容: JSON.stringify({ 结果: [{ 标识: '不存在的素材', 相关度: 1, 理由: 'x' }] }) })
    const 编造 = await 环境.调用('presentation.assets.semanticSearch', { 请求标识: 'r6', 查询: 'x' })
    expect(编造).toMatchObject({ 成功: false, 错误: expect.stringContaining('不属于') })
  })

  it('候选应用前核对原内容版本', async () => {
    const { 调用 } = 建环境()
    const 通过 = await 调用('presentation.generate.validateCandidates', [{ 页标识: 'p1' }], [{ 页标识: 'p1', 版本: 'v1' }], { p1: 'v1' })
    expect(通过.成功).toBe(true)
    const 失败 = await 调用('presentation.generate.validateCandidates', [{ 页标识: 'p1' }], [{ 页标识: 'p1', 版本: 'v2' }], { p1: 'v1' })
    expect(失败).toMatchObject({ 成功: false, 错误: expect.stringContaining('已变化') })
  })
})
