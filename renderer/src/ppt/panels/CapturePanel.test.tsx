import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import CapturePanel from './CapturePanel'
import type { 捕获依赖 } from '../model/capture'

const 假视频 = () => ({ videoWidth: 1920, videoHeight: 1080, srcObject: null as unknown, play: vi.fn(async () => {}), pause: vi.fn() })
const 假画布 = () => ({
  width: 0, height: 0,
  getContext: () => ({ drawImage: vi.fn() }),
  toDataURL: () => 'data:image/png;base64,QUJD',
})
const 依赖 = (视频 = 假视频()): 捕获依赖 => ({
  媒体设备: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }], getVideoTracks: () => [] }) as unknown as MediaStream) },
  视频工厂: () => 视频 as never,
  画布工厂: () => 假画布() as never,
})

const 装桥接 = (捕获: Record<string, unknown>) => {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { presentationCapture: 捕获 } })
}

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI'); vi.clearAllMocks() })

it('加载捕获源后可预览，取消不会修改文稿', async () => {
  const sources = vi.fn(async () => ({ 成功: true, 源列表: [{ 标识: 'screen:0:0', 名称: '整个屏幕', 类型: 'screen', 显示器标识: '1', 缩略图: '' }] }))
  装桥接({ sources })
  const on插入图片 = vi.fn()
  render(<App><CapturePanel 只读={false} on插入图片={on插入图片} 依赖={依赖()} /></App>)
  fireEvent.click(screen.getByRole('button', { name: '刷新捕获源' }))
  await waitFor(() => expect(sources).toHaveBeenCalled())
  fireEvent.click(await screen.findByRole('radio', { name: /整个屏幕/ }))
  fireEvent.click(screen.getByRole('button', { name: '截取预览' }))
  expect(await screen.findByRole('button', { name: '确认插入' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '取消截屏' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: '确认插入' })).not.toBeInTheDocument())
  expect(on插入图片).not.toHaveBeenCalled()
})

it('确认插入时按裁剪区域生成像素数据', async () => {
  装桥接({ sources: vi.fn(async () => ({ 成功: true, 源列表: [{ 标识: 'screen:0:0', 名称: '整个屏幕', 类型: 'screen', 显示器标识: '1', 缩略图: '' }] })) })
  const on插入图片 = vi.fn()
  render(<App><CapturePanel 只读={false} on插入图片={on插入图片} 依赖={依赖()} /></App>)
  fireEvent.click(screen.getByRole('button', { name: '刷新捕获源' }))
  fireEvent.click(await screen.findByRole('radio', { name: /整个屏幕/ }))
  fireEvent.click(screen.getByRole('button', { name: '截取预览' }))
  fireEvent.change(await screen.findByLabelText('裁剪宽度'), { target: { value: '300' } })
  fireEvent.change(screen.getByLabelText('裁剪高度'), { target: { value: '200' } })
  fireEvent.click(screen.getByRole('button', { name: '确认插入' }))
  await waitFor(() => expect(on插入图片).toHaveBeenCalledWith({ 数据: 'QUJD', 类型: 'image/png', 宽: 300, 高: 200 }))
})

it('读取捕获源失败时显示真实原因并禁用截取', async () => {
  装桥接({ sources: vi.fn(async () => ({ 成功: false, 错误: '读取捕获源失败：系统未返回捕获源' })) })
  render(<App><CapturePanel 只读={false} on插入图片={vi.fn()} 依赖={依赖()} /></App>)
  fireEvent.click(screen.getByRole('button', { name: '刷新捕获源' }))
  expect(await screen.findByText(/系统未返回捕获源/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '截取预览' })).toBeDisabled()
})

it('只读状态下不允许截取插入', async () => {
  装桥接({ sources: vi.fn(async () => ({ 成功: true, 源列表: [] })) })
  render(<App><CapturePanel 只读 on插入图片={vi.fn()} 依赖={依赖()} /></App>)
  expect(screen.getByRole('button', { name: '刷新捕获源' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '截取预览' })).toBeDisabled()
})
