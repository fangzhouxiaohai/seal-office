import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import RecognitionPanel from './RecognitionPanel'

const 装桥接 = (捕获: Record<string, unknown>) => {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { presentationCapture: 捕获 } })
}
const 图片文件 = (类型 = 'image/png') => {
  const 文件 = new File([new Uint8Array([137, 80, 78, 71])], '截图.png', { type: 类型 })
  Object.defineProperty(文件, 'size', { value: 4 })
  return 文件
}

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI'); vi.clearAllMocks() })

it('未配置模型时显示真实原因并禁用识别', async () => {
  装桥接({
    recognitionStatus: vi.fn(async () => ({ 成功: true, 可用: false, 原因: '请先在设置中心配置模型服务，并选择支持图像输入的模型' })),
    recognize: vi.fn(),
  })
  render(<App><RecognitionPanel 只读={false} on插入文字={vi.fn()} /></App>)
  expect(await screen.findByText(/请先在设置中心配置模型服务/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '开始识别' })).toBeDisabled()
})

it('识别成功后展示文字，可插入为文本框', async () => {
  const recognize = vi.fn(async () => ({ 成功: true, 文本: '第一行\n第二行' }))
  装桥接({ recognitionStatus: vi.fn(async () => ({ 成功: true, 可用: true, 模型: 'vision-1' })), recognize })
  const on插入文字 = vi.fn()
  const { container } = render(<App><RecognitionPanel 只读={false} on插入文字={on插入文字} /></App>)
  expect(await screen.findByText(/识别模型：vision-1/)).toBeInTheDocument()
  const 输入 = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(输入, { target: { files: [图片文件()] } })
  await waitFor(() => expect(screen.getByRole('button', { name: '开始识别' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '开始识别' }))
  expect(await screen.findByDisplayValue(/第一行/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '插入为文本框' }))
  expect(on插入文字).toHaveBeenCalledWith('第一行\n第二行')
})

it('识别失败时显示真实原因，不显示空结果', async () => {
  装桥接({
    recognitionStatus: vi.fn(async () => ({ 成功: true, 可用: true, 模型: 'vision-1' })),
    recognize: vi.fn(async () => ({ 成功: false, 错误: '模型服务拒绝请求参数，请核对模型名称、思考参数模式和当前模型支持范围' })),
  })
  const { container } = render(<App><RecognitionPanel 只读={false} on插入文字={vi.fn()} /></App>)
  expect(await screen.findByText(/识别模型：vision-1/)).toBeInTheDocument()
  fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [图片文件()] } })
  await waitFor(() => expect(screen.getByRole('button', { name: '开始识别' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '开始识别' }))
  expect(await screen.findByText(/模型服务拒绝请求参数/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '插入为文本框' })).not.toBeInTheDocument()
})

it('取消识别结果不产生文稿修改', async () => {
  装桥接({
    recognitionStatus: vi.fn(async () => ({ 成功: true, 可用: true, 模型: 'vision-1' })),
    recognize: vi.fn(async () => ({ 成功: true, 文本: '识别文字' })),
  })
  const on插入文字 = vi.fn()
  const { container } = render(<App><RecognitionPanel 只读={false} on插入文字={on插入文字} /></App>)
  expect(await screen.findByText(/识别模型：vision-1/)).toBeInTheDocument()
  fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [图片文件()] } })
  await waitFor(() => expect(screen.getByRole('button', { name: '开始识别' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '开始识别' }))
  await screen.findByDisplayValue('识别文字')
  fireEvent.click(screen.getByRole('button', { name: '取消结果' }))
  await waitFor(() => expect(screen.queryByDisplayValue('识别文字')).not.toBeInTheDocument())
  expect(on插入文字).not.toHaveBeenCalled()
})

it('只读状态下不允许插入识别文字', async () => {
  装桥接({ recognitionStatus: vi.fn(async () => ({ 成功: true, 可用: true, 模型: 'vision-1' })), recognize: vi.fn() })
  render(<App><RecognitionPanel 只读 on插入文字={vi.fn()} /></App>)
  await waitFor(() => expect(screen.getByRole('button', { name: '开始识别' })).toBeInTheDocument())
  expect(screen.getByRole('button', { name: '开始识别' })).toBeDisabled()
})
