import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import RecordingPanel from './RecordingPanel'
import type { 捕获依赖 } from '../model/capture'

class 假录制器 {
  static isTypeSupported = () => true
  ondataavailable: ((事件: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((事件: unknown) => void) | null = null
  start() {}
  pause() {}
  resume() {}
  stop() { this.ondataavailable?.({ data: new Blob(['录制片段'], { type: 'video/webm' }) }); this.onstop?.() }
}

const 依赖: 捕获依赖 = {
  媒体设备: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }], getVideoTracks: () => [], getAudioTracks: () => [] }) as unknown as MediaStream) },
  录制器构造: 假录制器 as never,
}

const 装桥接 = (捕获: Record<string, unknown>) => {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { presentationCapture: 捕获 } })
}
const 默认捕获 = (额外: Record<string, unknown> = {}) => ({
  sources: vi.fn(async () => ({ 成功: true, 源列表: [{ 标识: 'screen:0:0', 名称: '整个屏幕', 类型: 'screen', 显示器标识: '1', 缩略图: '' }] })),
  support: vi.fn(async () => ({ 成功: true, WebM: true, 媒体类型: 'video/webm;codecs=vp8,opus', MP4: false, MP4原因: 'MP4 需要额外编码器与分发授权' })),
  saveRecording: vi.fn(async (_数据: string, _格式: string, _建议名: string) => ({ 成功: true, 路径: 'E:\\演示\\录制.webm', 字节数: 12 })),
  ...额外,
})

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI'); vi.clearAllMocks() })

it('显示本机真实录制支持情况，并说明 MP4 未开放', async () => {
  装桥接(默认捕获())
  render(<App><RecordingPanel 只读={false} 依赖={依赖} /></App>)
  expect(await screen.findByText(/WebM/)).toBeInTheDocument()
  expect(screen.getByText(/MP4 需要额外编码器与分发授权/)).toBeInTheDocument()
})

it('完成选择源、开始、暂停、继续、停止、预览与保存的完整链路', async () => {
  const 捕获 = 默认捕获()
  装桥接(捕获)
  render(<App><RecordingPanel 只读={false} 依赖={依赖} /></App>)
  fireEvent.click(screen.getByRole('button', { name: '刷新捕获源' }))
  fireEvent.click(await screen.findByRole('radio', { name: /整个屏幕/ }))
  fireEvent.click(screen.getByRole('button', { name: '开始录制' }))
  await screen.findByRole('button', { name: '暂停录制' })
  fireEvent.click(screen.getByRole('button', { name: '暂停录制' }))
  fireEvent.click(screen.getByRole('button', { name: '继续录制' }))
  fireEvent.click(screen.getByRole('button', { name: '停止录制' }))
  await screen.findByRole('button', { name: '保存录制' })
  fireEvent.click(screen.getByRole('button', { name: '保存录制' }))
  await waitFor(() => expect(捕获.saveRecording).toHaveBeenCalled())
  expect(捕获.saveRecording.mock.calls[0][1]).toBe('webm')
  expect(await screen.findByText(/已保存/)).toBeInTheDocument()
})

it('保存失败时保留已捕获片段并允许重试', async () => {
  const 捕获 = 默认捕获({ saveRecording: vi.fn(async () => ({ 成功: false, 错误: '保存录制失败：磁盘已满' })) })
  装桥接(捕获)
  render(<App><RecordingPanel 只读={false} 依赖={依赖} /></App>)
  fireEvent.click(screen.getByRole('button', { name: '刷新捕获源' }))
  fireEvent.click(await screen.findByRole('radio', { name: /整个屏幕/ }))
  fireEvent.click(screen.getByRole('button', { name: '开始录制' }))
  fireEvent.click(await screen.findByRole('button', { name: '停止录制' }))
  fireEvent.click(await screen.findByRole('button', { name: '保存录制' }))
  expect((await screen.findAllByText(/磁盘已满/)).length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: '保存录制' })).toBeEnabled()
})

it('取消保存时保留录制片段并说明已取消', async () => {
  装桥接(默认捕获({ saveRecording: vi.fn(async () => ({ 成功: true, 已取消: true })) }))
  render(<App><RecordingPanel 只读={false} 依赖={依赖} /></App>)
  fireEvent.click(screen.getByRole('button', { name: '刷新捕获源' }))
  fireEvent.click(await screen.findByRole('radio', { name: /整个屏幕/ }))
  fireEvent.click(screen.getByRole('button', { name: '开始录制' }))
  fireEvent.click(await screen.findByRole('button', { name: '停止录制' }))
  fireEvent.click(await screen.findByRole('button', { name: '保存录制' }))
  expect(await screen.findByText(/已取消保存/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '保存录制' })).toBeEnabled()
})

it('没有可用编码时明确说明原因，不提供假按钮', async () => {
  装桥接(默认捕获({ support: vi.fn(async () => ({ 成功: true, WebM: false, MP4: false, MP4原因: 'MP4 未开放' })) }))
  render(<App><RecordingPanel 只读={false} 依赖={{ 媒体设备: undefined, 录制器构造: null }} /></App>)
  expect(await screen.findByText(/当前环境不支持 WebM 录制编码|当前环境不支持屏幕录制/)).toBeInTheDocument()
})
