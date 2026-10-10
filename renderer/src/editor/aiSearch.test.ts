import { describe, it, expect, vi, afterEach } from 'vitest'
import { 分组搜索资料, 核对搜索结果, 搜索文档含义 } from './aiSearch'
import { 桥接 } from '../ipc/bridge'
afterEach(() => { vi.restoreAllMocks() })
describe('AI 文档搜索', () => {
  it('长文件分组覆盖全部文字与长段落末尾，传送组大小有界', () => {
    const 文本 = Array.from({ length: 100 }, (_, i) => `第${i}段` + '文字'.repeat(800)).join('\n') + '\n文末标记'
    const 批次 = 分组搜索资料(文本)
    expect(批次.length).toBeGreaterThan(1)
    const 全部 = 批次.flat()
    expect(全部[全部.length - 1]?.原文).toBe('文末标记')
    for (const 批 of 批次) {
      expect(JSON.stringify(批.map(({ 编号, 原文 }) => ({ 编号, 原文 }))).length).toBeLessThan(20500)
      for (const 项 of 批) expect(文本.slice(项.开始, 项.开始 + 项.原文.length)).toBe(项.原文)
    }
  })
  it('模型引用必须有有效编号和对应连续原文，不采纳编造文字', () => {
    const 资料 = [{ 编号: 1, 原文: '请继续补充自己的需求', 开始: 12 }]
    const 回复 = JSON.stringify({ 结果: [{ 编号: 1, 原文: '补充自己的需求', 说明: '补充方式' }, { 编号: 1, 原文: '模型编造' }, { 编号: 9, 原文: '补充自己的需求' }] })
    expect(核对搜索结果(回复, 资料)).toEqual([{ 原文: '补充自己的需求', 说明: '补充方式', 开始: 15 }])
    expect(() => 核对搜索结果('不是JSON', 资料)).toThrow('格式无效')
  })
  it('沿用既有模型通道，返回可选中的真实文字范围', async () => {
    vi.spyOn(桥接.ai, 'getConfig').mockResolvedValue({ 成功: true, 数据: { 地址: 'https://example.com', 模型: 'test', 服务商: 'custom' } as any })
    const chat = vi.spyOn(桥接.ai, 'chat').mockResolvedValue({ 成功: true, 数据: { 内容: '{"结果":[{"编号":1,"原文":"补充自己的需求","说明":"相关原文"}]}' } })
    const 根 = document.createElement('div'); 根.innerHTML = '<p>请继续补<b>充</b>自己的需求</p>'; document.body.append(根)
    const 结果 = await 搜索文档含义(根, '怎样补充问题', { 已取消: () => false, 请求: () => {}, 进度: () => {} })
    expect(结果[0].范围.toString()).toBe('补充自己的需求')
    expect(chat.mock.calls[0][0]).toMatchObject({ 用途: '文档搜索', 自动执行: false })
    根.remove()
  })
  it('搜索期间正文变化后拒绝跳转到旧引用', async () => {
    vi.spyOn(桥接.ai, 'getConfig').mockResolvedValue({ 成功: true, 数据: { 地址: 'https://example.com', 模型: 'test', 服务商: 'custom' } as any })
    const 根 = document.createElement('div'); 根.innerHTML = '<p>原文</p>'; document.body.append(根)
    vi.spyOn(桥接.ai, 'chat').mockImplementation(async () => { 根.innerHTML = '<p>已变化</p>'; return { 成功: true, 数据: { 内容: '{"结果":[]}' } } })
    await expect(搜索文档含义(根, '问题', { 已取消: () => false, 请求: () => {}, 进度: () => {} })).rejects.toThrow('文档已变化')
    根.remove()
  })
})
