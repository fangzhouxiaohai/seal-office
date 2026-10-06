import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { expect, it, vi } from 'vitest'
import { 创建演示文稿, type 演示文稿 } from '../deck'
import { 默认主题标识, 内置主题列表 } from '../model/themes'
import { 创建默认母版, 按版式创建幻灯片 } from '../model/masters'
import ThemePanel from './ThemePanel'

const 默认主题 = 内置主题列表.find((项) => 项.标识 === 默认主题标识)!

const 造文稿 = (): 演示文稿 => {
  const 母版 = 创建默认母版()
  const 版式 = 母版.版式列表[1]
  const 页 = 按版式创建幻灯片(版式, 默认主题, '一页')
  页.文本框列表[0].text = '很长的标题文字'.repeat(20)
  页.文本框列表[0].height = 40
  // 用户显式设置的黑色标题：任何主题应用都不得覆盖
  页.文本框列表.push({ ...页.文本框列表[0], id: 'box-显式黑', text: '显式黑色标题', height: 120, 颜色: '#000000', 颜色引用: undefined })
  return { ...创建演示文稿(), 主题: 默认主题, 母版列表: [母版], 幻灯片列表: [页] }
}

const 内存后端 = () => {
  const 数据 = new Map<string, string>()
  return {
    getItem: (键: string) => 数据.get(键) ?? null,
    setItem: (键: string, 值: string) => { 数据.set(键, 值) },
    removeItem: (键: string) => { 数据.delete(键) },
  }
}

it('主题悬停预览不写入文稿，确认后才应用', async () => {
  const 文稿 = 造文稿()
  const 应用 = vi.fn()
  const 快照 = JSON.stringify(文稿)
  render(<App><ThemePanel 文稿={文稿} 只读={false} on应用={应用} 主题后端={内存后端()} /></App>)

  fireEvent.mouseEnter(screen.getByRole('button', { name: /海豹锐蓝/ }))

  // 预览态只更新界面候选
  expect(await screen.findByText(/预览：更新 \d+ 个文本框/)).toBeInTheDocument()
  expect(JSON.stringify(文稿)).toBe(快照)
  expect(应用).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: '确认应用主题' }))
  expect(应用).toHaveBeenCalledTimes(1)
  const 结果 = 应用.mock.calls[0][0] as 演示文稿
  expect(结果.主题?.标识).toBe('海豹-锐蓝')
  // 显式黑色标题不被主题覆盖
  expect(结果.幻灯片列表[0].文本框列表.some((框) => 框.颜色 === '#000000')).toBe(true)
})

it('只读时主题应用与配色按钮禁用并给出原因', () => {
  const 文稿 = 造文稿()
  render(<App><ThemePanel 文稿={文稿} 只读 on应用={vi.fn()} 主题后端={内存后端()} /></App>)

  const 主题按钮 = screen.getByRole('button', { name: /海豹锐蓝/ })
  expect(主题按钮).toBeDisabled()
  expect(主题按钮.getAttribute('title')).toContain('只读')
  expect(screen.getByRole('button', { name: '应用配色方案' })).toBeDisabled()
})

it('自定义主题可创建、保存到本地库并导出文本', async () => {
  const 文稿 = 造文稿()
  const 应用 = vi.fn()
  const 后端 = 内存后端()
  const 下载 = vi.fn()
  render(<App><ThemePanel 文稿={文稿} 只读={false} on应用={应用} 主题后端={后端} on导出文本={下载} /></App>)

  fireEvent.change(screen.getByLabelText('自定义主题名称'), { target: { value: '品牌主题' } })
  fireEvent.click(screen.getByRole('button', { name: '创建并保存主题' }))

  await waitFor(() => expect(screen.getByRole('button', { name: /品牌主题/ })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /品牌主题/ }))
  fireEvent.click(screen.getByRole('button', { name: '确认应用主题' }))
  expect((应用.mock.calls[0][0] as 演示文稿).主题?.名称).toBe('品牌主题')

  fireEvent.click(screen.getByRole('button', { name: '导出当前主题' }))
  expect(下载).toHaveBeenCalled()
  expect(String(下载.mock.calls[0][0])).toContain('海豹办公主题')
})

it('本地模板预览后确认应用并展示资源归档结果', async () => {
  const 文稿 = 造文稿()
  const 应用 = vi.fn()
  render(<App><ThemePanel 文稿={文稿} 只读={false} on应用={应用} 主题后端={内存后端()} /></App>)

  fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '封面模板' } })
  fireEvent.click(screen.getByRole('button', { name: '保存为本地模板' }))
  const 模板按钮 = await screen.findByRole('button', { name: /封面模板/ })

  fireEvent.mouseEnter(模板按钮)
  expect(await screen.findByText(/模板资源：归档 \d+ 项/)).toBeInTheDocument()
  fireEvent.click(模板按钮)
  fireEvent.click(screen.getByRole('button', { name: '确认应用模板' }))

  expect(应用).toHaveBeenCalledTimes(1)
  expect((应用.mock.calls[0][0] as 演示文稿).母版列表?.length).toBe(1)
})

it('统一字体展示缺失字体与溢出检查结果，确认后批量应用', async () => {
  const 文稿 = 造文稿()
  const 应用 = vi.fn()
  const 检测 = (字体: string) => 字体 !== '缺失字体'
  文稿.幻灯片列表[0].文本框列表[0].字体 = '缺失字体'
  文稿.幻灯片列表[0].文本框列表[0].字体显式 = true
  render(<App><ThemePanel 文稿={文稿} 只读={false} on应用={应用} 主题后端={内存后端()} 检测字体={检测} /></App>)

  expect(screen.getByText(/缺失字体：缺失字体（1 处）/)).toBeInTheDocument()
  expect(screen.getByText(/文字溢出：1 处/)).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('标题字体'), { target: { value: '思源黑体' } })
  fireEvent.click(screen.getByRole('button', { name: '应用统一字体' }))

  expect(应用).toHaveBeenCalledTimes(1)
  expect(String(screen.getByRole('status').textContent)).toContain('跳过 1 个显式字体')
})

it('背景设置支持纯色、渐变、图片资源与范围', () => {
  const 文稿 = 造文稿()
  文稿.资源索引 = { 指纹一: { 指纹: '指纹一', 类型: 'image/png', 字节数: 64 } }
  文稿.幻灯片列表.push({ ...文稿.幻灯片列表[0], id: 'slide-2' })
  const 应用 = vi.fn()
  render(<App><ThemePanel 文稿={文稿} 只读={false} on应用={应用} 主题后端={内存后端()} /></App>)

  fireEvent.change(screen.getByLabelText('背景类型'), { target: { value: '渐变' } })
  fireEvent.change(screen.getByLabelText('背景起始色'), { target: { value: '#FFFFFF' } })
  fireEvent.change(screen.getByLabelText('背景结束色'), { target: { value: '#DCE6FF' } })
  fireEvent.change(screen.getByLabelText('背景范围'), { target: { value: '全部' } })
  fireEvent.click(screen.getByRole('button', { name: '应用背景' }))

  const 结果 = 应用.mock.calls[0][0] as 演示文稿
  expect(结果.幻灯片列表[0].背景填充).toEqual({ 类型: '渐变', 起始色: '#FFFFFF', 结束色: '#DCE6FF', 角度: 90 })
  expect(结果.幻灯片列表[1].背景填充).toEqual(结果.幻灯片列表[0].背景填充)

  fireEvent.change(screen.getByLabelText('背景类型'), { target: { value: '图片' } })
  fireEvent.change(screen.getByLabelText('背景图片资源'), { target: { value: '指纹一' } })
  fireEvent.click(screen.getByRole('button', { name: '应用背景' }))
  expect((应用.mock.calls[1][0] as 演示文稿).幻灯片列表[0].背景填充).toEqual({ 类型: '图片', 资源标识: '指纹一' })
})

it('面板可折叠且不遮挡正文', () => {
  const 文稿 = 造文稿()
  render(<App><ThemePanel 文稿={文稿} 只读={false} on应用={vi.fn()} 主题后端={内存后端()} /></App>)
  const 面板 = screen.getByRole('complementary', { name: '设计主题面板' })
  expect(面板).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '折叠面板' }))
  expect(screen.getByRole('button', { name: '展开面板' })).toBeInTheDocument()
})
