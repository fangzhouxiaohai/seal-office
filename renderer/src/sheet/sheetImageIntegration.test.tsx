import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import SheetEditor from './SheetEditor'
import { AppProvider } from '../store'

const 图片数据 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg=='), (字符) => 字符.charCodeAt(0))

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('表格图片功能区', () => {
  it('选择本机 PNG 后显示图片，删除后从网格移除', async () => {
    const { container } = render(<AntdApp><AppProvider><SheetEditor /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '图片' }))
    const 输入 = container.querySelector('input[type="file"][accept]') as HTMLInputElement
    expect(输入).not.toBeNull()
    class 测试图像 {
      naturalWidth = 1
      naturalHeight = 1
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_值: string) { queueMicrotask(() => this.onload?.()) }
    }
    vi.stubGlobal('Image', 测试图像)
    fireEvent.change(输入, { target: { files: [new File([图片数据], '图像.png', { type: 'image/png' })] } })
    await waitFor(() => expect(screen.getByRole('img', { name: '工作表图片' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '删除 A1 的图片' }))
    await waitFor(() => expect(screen.queryByRole('img', { name: '工作表图片' })).not.toBeInTheDocument())
  })

  it('文件实际格式与扩展名不符时弹窗说明原因，工作表不插入图片', async () => {
    const 读取样式 = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((元素) => 读取样式(元素))
    const { container } = render(<AntdApp><AppProvider><SheetEditor /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '图片' }))
    const 输入 = container.querySelector('input[type="file"][accept]') as HTMLInputElement
    fireEvent.change(输入, { target: { files: [new File([图片数据], '伪装.jpg', { type: 'image/jpeg' })] } })
    expect((await screen.findAllByText('插入图片失败')).length).toBeGreaterThan(0)
    expect(screen.getByText('图片格式无效或文件已损坏')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '工作表图片' })).not.toBeInTheDocument()
  })
})
