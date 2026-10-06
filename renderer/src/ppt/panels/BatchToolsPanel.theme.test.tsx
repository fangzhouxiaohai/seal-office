import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import { 创建演示文稿 } from '../deck'
import { 内置主题列表 } from '../model/themes'
import BatchToolsPanel from './BatchToolsPanel'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

const 文件列表 = ['E:\\Temp\\甲.pptx', 'E:\\Temp\\乙.pptx', 'E:\\Temp\\丙.pptx']

const 模型 = (文本: string) => {
  const 稿 = 创建演示文稿('测试.pptx')
  稿.幻灯片列表[0].文本框列表[0].text = 文本
  稿.幻灯片列表[0].文本框列表[0].字体 = undefined
  return 稿
}

const 取后端 = () => (window as unknown as { electronAPI: Record<string, any> }).electronAPI

const 设置后端 = (覆盖: Record<string, unknown> = {}) => {
  const 后端 = {
    showOpenDialogMany: vi.fn().mockResolvedValue(文件列表),
    readFile: vi.fn().mockResolvedValue({ 成功: true, 二进制: true, 内容: 'AA==', 扩展名: '.pptx' }),
    office: {
      readPptx: vi.fn().mockResolvedValue({ 成功: true, 演示文稿: 模型('正文'), 警告: [], 资源条目: [{ 标识: 'a'.repeat(64), 类型: 'image/png', 数据: 'AA==' }] }),
      writePptx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBA==' }),
    },
    saveToFile: vi.fn().mockResolvedValue({ 成功: true, 文件指纹: 'f'.repeat(64) }),
    ...覆盖,
  }
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: 后端 })
  return 后端 as typeof 后端 & { office: { readPptx: any; writePptx: any }; saveToFile: any; readFile: any }
}

const 准备面板 = async (只读 = false) => {
  render(<App><BatchToolsPanel 文稿={模型('当前')} 图片地址={{}} 打开 只读={只读} /></App>)
  await userEvent.click(screen.getByRole('button', { name: '选择演示文稿（可多选）' }))
  await waitFor(() => expect(screen.getByText(/甲\.pptx/)).toBeInTheDocument())
  await userEvent.selectOptions(screen.getByLabelText('批量操作'), '统一主题与字体')
  return 取后端()
}

it('未选择文件时给出提示且不发起任何读写', async () => {
  设置后端()
  render(<App><BatchToolsPanel 文稿={模型('当前')} 图片地址={{}} 打开 /></App>)
  await userEvent.selectOptions(screen.getByLabelText('批量操作'), '统一主题与字体')
  await userEvent.click(screen.getByRole('button', { name: '开始执行' }))
  expect(await screen.findByText(/请先选择至少一个演示文稿文件/)).toBeInTheDocument()
  expect(取后端().office.readPptx).not.toHaveBeenCalled()
  expect(取后端().saveToFile).not.toHaveBeenCalled()
})

it('逐个文件独立处理：一个解析失败、一个写盘失败都不影响其他文件', async () => {
  const 后端 = 设置后端()
  后端.office.readPptx
    .mockResolvedValueOnce({ 成功: true, 演示文稿: 模型('甲'), 警告: [], 资源条目: [] })
    .mockResolvedValueOnce({ 成功: false, 错误: '演示文稿结构损坏' })
    .mockResolvedValueOnce({ 成功: true, 演示文稿: 模型('丙'), 警告: [], 资源条目: [] })
  后端.saveToFile
    .mockResolvedValueOnce({ 成功: true })
    .mockResolvedValueOnce({ 成功: false, 错误: '磁盘写入失败' })
  const 面板后端 = await 准备面板()
  expect(面板后端).toBe(后端)
  await userEvent.click(screen.getByRole('button', { name: '开始执行' }))
  await waitFor(() => expect(screen.getByText(/成功 1，失败 2/)).toBeInTheDocument())
  expect(screen.getByText('演示文稿结构损坏')).toBeInTheDocument()
  expect(screen.getByText('磁盘写入失败')).toBeInTheDocument()
  expect(后端.saveToFile).toHaveBeenCalledTimes(2)
})

it('默认另存为新文件，且写回模型的主题与字体确实改变、资源条目被透传', async () => {
  const 后端 = 设置后端()
  await 准备面板()
  await userEvent.type(screen.getByLabelText('正文字体'), '黑体')
  await userEvent.click(screen.getByRole('button', { name: '开始执行' }))
  await waitFor(() => expect(后端.saveToFile).toHaveBeenCalledTimes(3))
  const 模型参数 = 后端.office.writePptx.mock.calls[0][0]
  expect(模型参数.主题?.标识).toBe(内置主题列表[0].标识)
  expect(模型参数.资源条目).toHaveLength(1)
  expect(模型参数.幻灯片列表[0].文本框列表[0].字体).toBe('黑体')
  expect(String(后端.saveToFile.mock.calls[0][0])).toMatch(/甲-统一主题\.pptx$/)
  expect(后端.readFile).toHaveBeenCalledTimes(3)
})

it('覆盖原文件需要二次确认，取消确认时不写盘', async () => {
  const 后端 = 设置后端()
  await 准备面板()
  await userEvent.selectOptions(screen.getByLabelText('输出方式'), '覆盖原文件')
  await userEvent.click(screen.getByRole('button', { name: '开始执行' }))
  const 对话框 = await waitFor(() => {
    const 节点 = document.querySelector('.ant-modal-confirm')
    if (!节点) throw new Error('未出现覆盖确认')
    return 节点 as HTMLElement
  })
  expect(within(对话框).getAllByText(/覆盖原文件/).length).toBeGreaterThan(0)
  await userEvent.click(within(对话框).getByRole('button', { name: /取\s*消|Cancel/ }))
  await waitFor(() => expect(screen.queryByText(/成功 3/)).not.toBeInTheDocument())
  expect(后端.saveToFile).not.toHaveBeenCalled()
})

it('确认覆盖后写回原路径', async () => {
  const 后端 = 设置后端()
  await 准备面板()
  await userEvent.selectOptions(screen.getByLabelText('输出方式'), '覆盖原文件')
  await userEvent.click(screen.getByRole('button', { name: '开始执行' }))
  const 对话框 = await waitFor(() => {
    const 节点 = document.querySelector('.ant-modal-confirm')
    if (!节点) throw new Error('未出现覆盖确认')
    return 节点 as HTMLElement
  })
  await userEvent.click(within(对话框).getByRole('button', { name: '覆盖写入' }))
  await waitFor(() => expect(后端.saveToFile).toHaveBeenCalledTimes(3))
  expect(String(后端.saveToFile.mock.calls[0][0])).toBe(文件列表[0])
})

it('含未完整支持内容的文件在覆盖模式下被阻止写入，另存模式仍可进行并给出说明', async () => {
  const 后端 = 设置后端()
  后端.office.readPptx.mockResolvedValue({ 成功: true, 演示文稿: 模型('甲'), 警告: ['主题未完整导入'], 资源条目: [] })
  await 准备面板()
  await userEvent.selectOptions(screen.getByLabelText('输出方式'), '覆盖原文件')
  await userEvent.click(screen.getByRole('button', { name: '开始执行' }))
  const 对话框 = await waitFor(() => {
    const 节点 = document.querySelector('.ant-modal-confirm')
    if (!节点) throw new Error('未出现覆盖确认')
    return 节点 as HTMLElement
  })
  await userEvent.click(within(对话框).getByRole('button', { name: '覆盖写入' }))
  await waitFor(() => expect(screen.getByText(/成功 0，失败 3/)).toBeInTheDocument())
  expect(后端.saveToFile).not.toHaveBeenCalled()
  expect(screen.getAllByText(/已阻止覆盖/).length).toBeGreaterThan(0)
})

it('取消后剩余文件标记为已取消，已完成结果保留', async () => {
  const 后端 = 设置后端()
  let 释放第一个: (值: unknown) => void = () => {}
  const 首个读取 = new Promise(解决 => { 释放第一个 = 解决 })
  后端.readFile
    .mockImplementationOnce(() => 首个读取)
    .mockResolvedValue({ 成功: true, 二进制: true, 内容: 'AA==' })
  await 准备面板()
  await userEvent.click(screen.getByRole('button', { name: '开始执行' }))
  await userEvent.click(screen.getByRole('button', { name: '取消' }))
  释放第一个({ 成功: true, 二进制: true, 内容: 'AA==' })
  await waitFor(() => expect(screen.getByText(/已取消 2/)).toBeInTheDocument())
  expect(screen.getByText(/成功 1，失败 0，已取消 2/)).toBeInTheDocument()
  expect(后端.saveToFile).toHaveBeenCalledTimes(1)
})

it('只读状态下禁用写入类批量操作并给出原因', async () => {
  设置后端()
  await 准备面板(true)
  const 按钮 = screen.getByRole('button', { name: '开始执行' })
  expect(按钮).toBeDisabled()
  expect(按钮.getAttribute('title') ?? '').toContain('只读')
})
