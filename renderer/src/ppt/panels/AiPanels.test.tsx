import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import { 创建演示文稿, 创建幻灯片 } from '../deck'
import TranslationPanel from './TranslationPanel'
import NarrationPanel from './NarrationPanel'

const 可用能力 = {
  文本: { 状态: '可用' as const, 模型: 'deepseek-flash' },
  语音合成: { 状态: '可用' as const, 声线: '女声-甲' },
  图像识别: { 状态: '缺少配置' as const, 原因: '请先配置具备图像理解或文字识别能力的模型服务' },
  图像生成: { 状态: '缺少配置' as const, 原因: '本阶段不提供图像生成入口' },
}

function 装配({ 能力 = 可用能力, 译文, 校验, 讲稿, 讲解 } = {} as any) {
  const 智能 = {
    capabilities: vi.fn(async () => ({ 成功: true, 数据: 能力 })),
    getService: vi.fn(async () => ({ 成功: true, 数据: null })),
    saveService: vi.fn(async () => ({ 成功: true })),
    clearService: vi.fn(async () => ({ 成功: true })),
    listServiceKinds: vi.fn(async () => ({ 成功: true, 数据: ['翻译', '语音', '识别'] })),
    migrateLegacyTranslate: vi.fn(async () => ({ 成功: true, 数据: { 成功: true } })),
    probeService: vi.fn(async () => ({ 成功: true, 数据: { 可用: true } })),
    translate: vi.fn(译文 ?? (async ({ 条目 }: any) => ({ 成功: true, 数据: { 译文: 条目.map((项: any) => ({ 对象标识: 项.对象标识, 原文: 项.原文, 译文: 'T:' + 项.原文 })), 批次: 1, 跳过: 0 } }))),
    proofread: vi.fn(async ({ 条目 }: any) => ({ 成功: true, 数据: { 建议: [{ 对象标识: 条目[0].对象标识, 原文: 条目[0].原文, 问题类型: '语义', 说明: '表述含糊', 建议文本: '明确的表述' }], 批次: 1, 检查对象数: 条目.length } })),
    validateTranslation: vi.fn(校验 ?? (async () => ({ 成功: true, 数据: [] }))),
    validateSuggestion: vi.fn(async () => ({ 成功: true, 数据: [] })),
    voices: vi.fn(async () => ({ 成功: true, 数据: [{ 标识: '女声-甲', 名称: '女声-甲' }] })),
    speak: vi.fn(async () => ({ 成功: true, 数据: { 音频: 'AAAA', 类型: 'audio/mpeg', 字节数: 3, 命中缓存: false, 缓存键: 'a'.repeat(64) } })),
    generateScript: vi.fn(讲稿 ?? (async ({ 页列表 }: any) => ({ 成功: true, 数据: { 讲稿: 页列表.map((项: any) => ({ 页标识: 项.页标识, 讲稿: '讲稿:' + 项.页标识 })), 批次: 1 } }))),
    narrate: vi.fn(讲解 ?? (async ({ 讲稿: 清单 }: any) => ({ 成功: true, 数据: { 音频: 清单.slice(0, 1).map((项: any) => ({ 页标识: 项.页标识, 缓存键: 'b'.repeat(64), 类型: 'audio/mpeg', 字节数: 10, 命中缓存: false, 音频: 'AAAA' })), 失败: 清单.slice(1).map((项: any) => ({ 页标识: 项.页标识, 原因: '语音合成服务请求过于频繁，请稍后再试' })) } }))),
    clearAudioCache: vi.fn(async () => ({ 成功: true })),
    onStream: vi.fn(() => () => {}),
  }
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { presentationAi: 智能 } })
  return 智能
}

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI'); vi.clearAllMocks() })

function 造稿() {
  const 文稿 = 创建演示文稿('智能面板')
  文稿.幻灯片列表[0].文本框列表[0].text = '第一页标题'
  const 第二页 = 创建幻灯片('标题和内容', '第二页')
  第二页.文本框列表[0].text = '待改文本'
  文稿.幻灯片列表.push(第二页)
  return 文稿
}

it('缺少文本能力时翻译入口只提示配置，不调用模型也不修改文稿', async () => {
  const 智能 = 装配({ 能力: { ...可用能力, 文本: { 状态: '缺少配置', 原因: '请先在设置中心配置模型服务' } } })
  const 修改 = vi.fn()
  render(<AntdApp><TranslationPanel 文稿={造稿()} 当前索引={0} 选中={[]} 只读={false} on修改={修改} /></AntdApp>)
  fireEvent.click(await screen.findByRole('button', { name: '翻译所选范围' }))
  expect(智能.translate).not.toHaveBeenCalled()
  expect(修改).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getAllByText(/请先在设置中心配置模型服务/).length).toBeGreaterThan(0))
})

it('翻译先出候选预览且不改稿，确认后才应用译文', async () => {
  const 智能 = 装配({})
  const 文稿 = 造稿(), 修改 = vi.fn()
  render(<AntdApp><TranslationPanel 文稿={文稿} 当前索引={0} 选中={[]} 只读={false} on修改={修改} /></AntdApp>)
  fireEvent.click(await screen.findByRole('button', { name: '翻译所选范围' }))
  await waitFor(() => expect(智能.translate).toHaveBeenCalledTimes(1))
  expect(修改).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByText('T:第一页标题')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /应用选中的 \d+ 条译文/ }))
  await waitFor(() => expect(修改).toHaveBeenCalledTimes(1))
  const 新稿 = 修改.mock.calls[0][0]
  expect(新稿.幻灯片列表[0].文本框列表[0].text).toBe('T:第一页标题')
  expect(文稿.幻灯片列表[0].文本框列表[0].text).toBe('第一页标题')
  expect(智能.validateTranslation).toHaveBeenCalled()
})

it('应用前发现原文已变化时阻止覆盖并给出真实原因', async () => {
  const 智能 = 装配({ 校验: async () => ({ 成功: false, 错误: '对象 文本框 的原文已变化，已阻止覆盖' }) })
  const 修改 = vi.fn()
  render(<AntdApp><TranslationPanel 文稿={造稿()} 当前索引={0} 选中={[]} 只读={false} on修改={修改} /></AntdApp>)
  fireEvent.click(await screen.findByRole('button', { name: '翻译所选范围' }))
  await waitFor(() => expect(screen.getByText('T:第一页标题')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /应用选中的 \d+ 条译文/ }))
  await waitFor(() => expect(screen.getAllByText(/原文已变化，已阻止覆盖/).length).toBeGreaterThan(0))
  expect(修改).not.toHaveBeenCalled()
  expect(智能.validateTranslation).toHaveBeenCalled()
})

it('语义校对逐条展示建议并可按条应用或忽略', async () => {
  const 智能 = 装配({})
  const 文稿 = 造稿(), 修改 = vi.fn()
  render(<AntdApp><TranslationPanel 文稿={文稿} 当前索引={1} 选中={[]} 只读={false} on修改={修改} /></AntdApp>)
  fireEvent.click(await screen.findByRole('button', { name: '语义校对' }))
  await waitFor(() => expect(智能.proofread).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByText('明确的表述')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '忽略' }))
  expect(修改).not.toHaveBeenCalled()
  expect(screen.queryByText('明确的表述')).not.toBeInTheDocument()
})

it('讲稿按页生成，讲解音频失败只影响该页并如实显示原因', async () => {
  const 智能 = 装配({})
  const 修改 = vi.fn()
  render(<AntdApp><NarrationPanel 文稿={造稿()} 只读={false} on修改={修改} /></AntdApp>)
  fireEvent.click(await screen.findByRole('button', { name: '生成分页讲稿' }))
  await waitFor(() => expect(智能.generateScript).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getAllByText(/讲稿:/).length).toBe(2))
  fireEvent.click(screen.getByRole('button', { name: '合成全部讲解音频' }))
  await waitFor(() => expect(智能.narrate).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByText(/音频失败：语音合成服务请求过于频繁/)).toBeInTheDocument())
  expect(screen.getByText(/音频已就绪/)).toBeInTheDocument()
})

it('讲稿可写入演讲备注，已有备注时先确认再覆盖', async () => {
  const 装配结果 = 装配({})
  const 文稿 = 造稿(), 修改 = vi.fn()
  render(<AntdApp><NarrationPanel 文稿={文稿} 只读={false} on修改={修改} /></AntdApp>)
  fireEvent.click(await screen.findByRole('button', { name: '生成分页讲稿' }))
  await waitFor(() => expect(装配结果.generateScript).toHaveBeenCalled())
  await waitFor(() => expect(screen.getAllByRole('button', { name: '写入演讲备注' }).length).toBe(2))
  fireEvent.click(screen.getAllByRole('button', { name: '写入演讲备注' })[0])
  await waitFor(() => expect(修改).toHaveBeenCalledTimes(1))
  expect(修改.mock.calls[0][0].幻灯片列表[0].备注).toMatch(/^讲稿:/)
})

it('只读状态下讲稿生成与写入备注都不可用', async () => {
  装配({})
  const 修改 = vi.fn()
  render(<AntdApp><NarrationPanel 文稿={造稿()} 只读 on修改={修改} /></AntdApp>)
  expect(await screen.findByRole('button', { name: '生成分页讲稿' })).toBeDisabled()
  expect(修改).not.toHaveBeenCalled()
})
