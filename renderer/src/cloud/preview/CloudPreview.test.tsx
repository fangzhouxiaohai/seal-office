import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { SettingsProvider } from '../../store/settingsStore'

const 云调用 = vi.hoisted(() => vi.fn())
vi.mock('../CloudProvider', () => ({ cloudCall: 云调用 }))
vi.mock('./fileViewerEngine', () => ({ default: ({ 文件 }: { 文件: File }) => <div data-testid="完整引擎">{文件.name}:{文件.size}</div> }))

import CloudPreview from './CloudPreview'

const base64 = (文本: string) => btoa(unescape(encodeURIComponent(文本)))
const 渲染 = (名称: string, props: Partial<React.ComponentProps<typeof CloudPreview>> = {}) => render(
  <SettingsProvider><AntdApp><CloudPreview 节点={{ id: 'n1', name: 名称 }} 引擎="完整" onClose={() => {}} on用编辑器打开={() => {}} on下载={() => {}} {...props} /></AntdApp></SettingsProvider>)

describe('云文件预览', () => {
  beforeEach(() => { 云调用.mockReset(); (URL as any).createObjectURL = vi.fn(() => 'blob:preview'); (URL as any).revokeObjectURL = vi.fn() })

  it('加载期间显示统一加载动画，图片读取后以原生方式显示', async () => {
    云调用.mockResolvedValue({ name: '照片.png', data: base64('png-bytes') })
    渲染('照片.png')
    expect(screen.getByRole('status').textContent).toContain('正在解密并读取')
    const 图 = await screen.findByRole('img', { name: '照片.png' })
    expect(图.getAttribute('src')).toBe('blob:preview')
    expect(云调用).toHaveBeenCalledWith('rawDownload', { id: 'n1' })
  })

  it('Office 等格式交给完整预览引擎并传入解密后的文件', async () => {
    云调用.mockResolvedValue({ name: '报告.docx', data: base64('docx') })
    渲染('报告.docx')
    expect((await screen.findByTestId('完整引擎')).textContent).toBe('报告.docx:4')
  })

  it('精简引擎下文本文件以纯文本显示', async () => {
    云调用.mockResolvedValue({ name: '说明.md', data: base64('# 标题\n中文内容') })
    渲染('说明.md', { 引擎: '精简' })
    expect((await screen.findByLabelText('文本内容')).textContent).toBe('# 标题\n中文内容')
  })

  it('读取失败时显示中文错误并可重试', async () => {
    云调用.mockRejectedValueOnce(new Error('网络连接中断'))
    云调用.mockResolvedValueOnce({ name: '照片.png', data: base64('x') })
    渲染('照片.png')
    expect(await screen.findByText(/网络连接中断/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('img', { name: '照片.png' })).toBeTruthy()
  })

  it('不支持的格式不下载内容，直接说明原因并提供下载', async () => {
    const 下载 = vi.fn()
    渲染('安装包.exe', { on下载: 下载 })
    expect(screen.getByText(/暂不支持预览 EXE/)).toBeTruthy()
    expect(云调用).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '下载文件' }))
    expect(下载).toHaveBeenCalled()
  })

  it('超过 100 MB 的文件提示改为下载', async () => {
    渲染('超大视频.mp4', { 大小: 200 * 1024 * 1024 })
    expect(screen.getByText(/超过 100 MB/)).toBeTruthy()
    expect(云调用).not.toHaveBeenCalled()
  })

  it('可编辑格式提供用海豹办公打开', async () => {
    const 打开 = vi.fn()
    云调用.mockResolvedValue({ name: '报告.docx', data: base64('docx') })
    渲染('报告.docx', { on用编辑器打开: 打开 })
    await screen.findByTestId('完整引擎')
    fireEvent.click(screen.getByRole('button', { name: '用海豹办公打开' }))
    expect(打开).toHaveBeenCalled()
  })
})
