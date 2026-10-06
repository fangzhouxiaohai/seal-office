import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from 'antd'
import { expect, it, vi } from 'vitest'
import { 创建演示文稿 } from '../deck'
import GenerationPanel from './GenerationPanel'
import AssetLibraryPanel from './AssetLibraryPanel'

const 设置后端 = (覆盖: Record<string, unknown> = {}) => {
  const 生成 = {
    outline: vi.fn().mockResolvedValue({ 成功: true, 数据: { 提纲: [
      { 页标识: 'p1', 标题: '季度目标', 版式: '标题幻灯片', 要点: [] },
      { 页标识: 'p2', 标题: '关键举措', 版式: '标题和内容', 要点: ['渠道扩展'] },
    ] } }),
    pages: vi.fn().mockResolvedValue({ 成功: true, 数据: { 页面: [
      { 页标识: 'p1', 标题: '季度目标', 正文: '开场', 版式: '标题幻灯片', 要点: [] },
      { 页标识: 'p2', 标题: '关键举措', 正文: '主线', 版式: '标题和内容', 要点: ['渠道扩展'] },
    ] } }),
    singlePage: vi.fn().mockResolvedValue({ 成功: true, 数据: { 页面: { 页标识: 'p1', 标题: '封面', 正文: '副标题', 版式: '标题幻灯片', 要点: [] } } }),
    beautify: vi.fn().mockResolvedValue({ 成功: true, 数据: { 建议: [{ 页标识: 'x', 对齐: '居中', 字号建议: 30, 要点上限: 4, 背景建议: '浅色', 版式建议: '标题幻灯片', 说明: '突出标题' }] } }),
    diagram: vi.fn().mockResolvedValue({ 成功: true, 数据: { 节点: [{ 标识: 'n1', 文本: '开始' }, { 标识: 'n2', 文本: '处理' }], 连线: [{ 起点: 'n1', 终点: 'n2' }] } }),
    validateCandidates: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
    readOutline: vi.fn().mockResolvedValue({ 成功: true, 数据: { 提纲: [{ 标题: '季度汇报', 要点: ['收入'] }], 遗漏: [{ 类型: '表格', 说明: '文档包含 1 个表格，本次只导入文字' }], 来源: { 名称: '稿件.docx', 类型: '.docx', 字节数: 2048 } } }),
    assets: {
      list: vi.fn().mockResolvedValue({ 成功: true, 数据: [{ 标识: 'a1'.padEnd(64, '0'), 名称: '商务底图', 分类: '背景', 类型: 'image/png', 字节数: 2048, 来源: '内部设计', 授权: '自制，可商用', 导入时间: '2026-10-06T10:00:00.000Z' }] }),
      read: vi.fn().mockResolvedValue({ 成功: true, 数据: { 数据: 'AAAA' } }),
      import: vi.fn().mockResolvedValue({ 成功: true, 数据: { 素材: { 标识: 'a2'.padEnd(64, '0'), 名称: '新素材', 分类: '图片', 类型: 'image/png', 字节数: 10, 授权: '自制', 导入时间: '2026-10-06T11:00:00.000Z' }, 去重: false } }),
      remove: vi.fn().mockResolvedValue({ 成功: true }),
      semanticSearch: vi.fn().mockResolvedValue({ 成功: true, 数据: { 结果: [{ 标识: 'a1'.padEnd(64, '0'), 相关度: 88, 理由: '与封面匹配' }] } }),
      search: vi.fn(),
      updateMeta: vi.fn(),
    },
  }
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { presentationGeneration: 生成, showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\稿件.docx'), readFile: vi.fn().mockResolvedValue({ 成功: true, 二进制: true, 内容: 'AA==' }), ...覆盖 },
  })
  return 生成
}

const 渲染生成 = (文稿 = 创建演示文稿(), 修改 = vi.fn(), 只读 = false) =>
  render(<App><GenerationPanel 文稿={文稿} 页={文稿.幻灯片列表[0]} 只读={只读} on修改={修改} /></App>)

it('提纲生成、正文生成与插入形成完整链路，插入前不改动文稿', async () => {
  const 生成 = 设置后端()
  const 文稿 = 创建演示文稿(), 修改 = vi.fn()
  渲染生成(文稿, 修改)
  await userEvent.type(screen.getByLabelText('演示主题'), '季度汇报')
  await userEvent.click(screen.getByRole('button', { name: '生成提纲' }))
  expect(await screen.findByText('季度目标')).toBeInTheDocument()
  expect(生成.outline).toHaveBeenCalledWith(expect.objectContaining({ 主题: '季度汇报', 页数: 6 }))
  expect(修改).not.toHaveBeenCalled()

  await userEvent.click(screen.getByRole('button', { name: '生成正文' }))
  expect(await screen.findByText(/正文预览（2 页）/)).toBeInTheDocument()
  expect(修改).not.toHaveBeenCalled()

  await userEvent.click(screen.getByRole('button', { name: '插入到文稿' }))
  await waitFor(() => expect(修改).toHaveBeenCalledTimes(1))
  expect(修改.mock.calls[0][0].幻灯片列表).toHaveLength(3)
  expect(文稿.幻灯片列表).toHaveLength(1)
})

it('未配置服务时展示真实原因，不展示空结果', async () => {
  const 生成 = 设置后端()
  生成.outline.mockResolvedValue({ 成功: false, 错误: '请先在设置中心配置模型服务' })
  渲染生成()
  await userEvent.type(screen.getByLabelText('演示主题'), '季度汇报')
  await userEvent.click(screen.getByRole('button', { name: '生成提纲' }))
  expect(await screen.findByText('请先在设置中心配置模型服务')).toBeInTheDocument()
  expect(screen.queryByText('季度目标')).not.toBeInTheDocument()
})

it('智能图形生成后可插入可编辑对象，只读时按钮禁用', async () => {
  const 生成 = 设置后端()
  const 文稿 = 创建演示文稿(), 修改 = vi.fn()
  const { unmount } = 渲染生成(文稿, 修改)
  await userEvent.click(screen.getByRole('button', { name: '智能图形' }))
  await userEvent.type(screen.getByLabelText('图形主题'), '审批流程')
  await userEvent.click(screen.getByRole('button', { name: '生成结构' }))
  expect(await screen.findByText('开始')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '插入可编辑图形' }))
  await waitFor(() => expect(修改).toHaveBeenCalledTimes(1))
  const 新页 = 修改.mock.calls[0][0].幻灯片列表[0]
  expect(新页.对象列表.some((项: { 类型: string }) => 项.类型 === '组合')).toBe(true)
  expect(生成.diagram).toHaveBeenCalledTimes(1)
  unmount()

  const 只读视图 = 渲染生成(文稿, vi.fn(), true)
  await userEvent.click(within(只读视图.container).getByRole('button', { name: '智能图形' }))
  expect(within(只读视图.container).getByRole('button', { name: '生成结构' })).toBeDisabled()
})

it('文档导入展示来源、遗漏与提纲', async () => {
  设置后端()
  渲染生成()
  await userEvent.click(screen.getByRole('button', { name: '文档生成' }))
  await userEvent.click(screen.getByRole('button', { name: '选择文档并解析提纲' }))
  expect(await screen.findByText(/来源：稿件\.docx/)).toBeInTheDocument()
  expect(screen.getByText(/文档包含 1 个表格/)).toBeInTheDocument()
  expect(screen.getByText('季度汇报')).toBeInTheDocument()
})

it('素材库列出条目、展示授权、预览与删除，删除后刷新', async () => {
  const 生成 = 设置后端()
  const 文稿 = 创建演示文稿()
  render(<App><AssetLibraryPanel 文稿={文稿} 页={文稿.幻灯片列表[0]} 只读={false} on修改={vi.fn()} /></App>)
  expect(await screen.findByText('商务底图')).toBeInTheDocument()
  expect(screen.getByText('授权：自制，可商用')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '预览' }))
  await waitFor(() => expect(生成.assets.read).toHaveBeenCalled())
  await userEvent.click(screen.getByRole('button', { name: '删除' }))
  await waitFor(() => expect(生成.assets.remove).toHaveBeenCalled())
  expect(生成.assets.list.mock.calls.length).toBeGreaterThan(1)
})

it('素材库智能检索只展示模型返回的排序与理由', async () => {
  const 生成 = 设置后端()
  const 文稿 = 创建演示文稿()
  render(<App><AssetLibraryPanel 文稿={文稿} 页={文稿.幻灯片列表[0]} 只读={false} on修改={vi.fn()} /></App>)
  await screen.findByText('商务底图')
  await userEvent.type(screen.getByLabelText('素材关键词'), '封面')
  await userEvent.click(screen.getByRole('button', { name: '智能检索' }))
  expect(await screen.findByText(/相关度 88/)).toBeInTheDocument()
  expect(screen.getByText(/与封面匹配/)).toBeInTheDocument()
  expect(生成.assets.semanticSearch).toHaveBeenCalledWith(expect.objectContaining({ 查询: '封面' }))
})
