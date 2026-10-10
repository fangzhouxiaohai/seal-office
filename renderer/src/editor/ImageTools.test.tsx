import { createRef } from 'react'
import { App, ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImageTools from './ImageTools'
import * as 像素操作 from './imagePixels'

afterEach(() => { document.querySelectorAll('[data-test-canvas]').forEach(节点 => 节点.remove()); vi.restoreAllMocks(); Reflect.deleteProperty(window, 'electronAPI') })

function 准备(只读 = false) {
  const 根 = document.createElement('div')
  根.dataset.testCanvas = 'true'
  根.contentEditable = String(!只读)
  根.innerHTML = '<p>前文<img width="120" height="80" alt="测试图片">后文</p><p>目标正文</p>'
  Object.defineProperty(根, 'clientWidth', { value: 600 })
  document.body.appendChild(根)
  const 图 = 根.querySelector('img')!
  vi.spyOn(图, 'getBoundingClientRect').mockImplementation(() => ({ x: 100, y: 180, left: 100, top: 180, width: 图.width, height: 图.height, right: 100 + 图.width, bottom: 180 + 图.height, toJSON: () => ({}) }))
  const 引用 = createRef<HTMLDivElement>()
  Object.defineProperty(引用, 'current', { value: 根 })
  const 开始 = vi.fn(), 完成 = vi.fn()
  const 组件 = render(<ConfigProvider button={{ autoInsertSpace: false }}><App><ImageTools 编辑区={引用} 文档标识="图片测试" 只读={只读} 开始修改={开始} 完成修改={完成} /></App></ConfigProvider>)
  return { 根, 图, 开始, 完成, 引用, ...组件 }
}

describe('图片调整工具', () => {
  it('提取文字复用识别服务，结果预览后才将纯文本插入图片后的正文', async () => {
    const 识别 = vi.fn(async () => ({ 成功: true, 文本: '第一行\n<b>识别原文</b>' }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { presentationCapture: { recognitionStatus: async () => ({ 成功: true, 可用: true, 模型: 'vision-test' }), recognize: 识别 } } })
    const 编码 = vi.spyOn(像素操作, '识别用图片').mockResolvedValue({ 数据: 'isolated-test-image', 类型: 'image/png' })
    const { 图, 根, 完成 } = 准备()
    图.src = 'data:image/png;base64,test'
    图.style.transform = 'rotate(90deg) scale(-1, 1)'
    const 原文 = 根.innerHTML
    await userEvent.click(图)
    await userEvent.click(screen.getByRole('button', { name: '提取文字' }))
    expect(await screen.findByText('识别模型：vision-test')).toBeInTheDocument()
    expect(编码).toHaveBeenCalledWith(图.src, { 旋转: 90, 水平翻转: true, 垂直翻转: false })
    await userEvent.click(screen.getByRole('button', { name: '开始识别' }))
    expect(await screen.findByDisplayValue(/识别原文/)).toHaveValue('第一行\n<b>识别原文</b>')
    expect(识别).toHaveBeenCalledWith('isolated-test-image', 'image/png')
    expect(根.innerHTML).toBe(原文)
    expect(完成).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '插入正文' }))
    expect(图.closest('p')!.nextElementSibling!.textContent).toBe('第一行\n<b>识别原文</b>')
    expect(根.querySelector('b')).toBeNull()
    expect(完成).toHaveBeenCalledOnce()
  })

  it('裁剪结果只应用到原文档，切换文档后不修改已关闭图片', async () => {
    let 完成裁剪!: (结果: { 数据: string; 宽比例: number; 高比例: number }) => void
    vi.spyOn(像素操作, '裁剪图片像素').mockImplementation(async () => new Promise<{ 数据: string; 宽比例: number; 高比例: number }>(完成 => { 完成裁剪 = 完成 }))
    const { 图, 引用, rerender, 完成 } = 准备()
    图.src = 'data:image/png;base64,old'
    const 原图 = 图.outerHTML
    await userEvent.click(图)
    await userEvent.click(screen.getByRole('button', { name: '图片裁剪' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: '裁剪左侧百分比' }), { target: { value: '25' } })
    await userEvent.click(screen.getByRole('button', { name: '裁剪' }))
    rerender(<App><ImageTools 编辑区={引用} 文档标识="其他文档" 只读={false} 开始修改={vi.fn()} 完成修改={完成} /></App>)
    完成裁剪({ 数据: 'data:image/png;base64,new', 宽比例: 0.75, 高比例: 1 })
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: '图片工具' })).toBeNull())
    expect(图.outerHTML).toBe(原图)
    expect(完成).not.toHaveBeenCalled()
  })
  it('选中图片展示八个尺寸手柄、旋转和工具条，不把控件写入正文', async () => {
    const { 根, 图 } = 准备()
    const 原文 = 根.innerHTML
    await userEvent.click(图)
    expect(screen.getByRole('toolbar', { name: '图片工具' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /角调整图片尺寸/ })).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: /调整图片尺寸/ })).toHaveLength(8)
    expect(screen.getByRole('button', { name: '拖动旋转图片' })).toBeInTheDocument()
    expect(根.innerHTML).toBe(原文)
    await userEvent.click(screen.getByRole('button', { name: '布局选项' }))
    await userEvent.click(screen.getByRole('button', { name: '居中' }))
    expect(图.parentElement?.style.textAlign).toBe('center')
  })

  it('边手柄独立调整宽度，旋转后的手柄沿图片坐标调整', async () => {
    const { 图, 完成 } = 准备()
    图.style.transform = 'rotate(90deg) scale(1, 1)'
    await userEvent.click(图)
    fireEvent(screen.getByRole('button', { name: '从右侧调整图片尺寸' }), new MouseEvent('pointerdown', { clientX: 160, clientY: 280, bubbles: true }))
    fireEvent(document, new MouseEvent('pointermove', { clientX: 160, clientY: 310, bubbles: true }))
    fireEvent(document, new MouseEvent('pointerup', { bubbles: true }))
    expect(图.width).toBe(150)
    expect(图.height).toBe(80)
    expect(完成).toHaveBeenCalledOnce()
  })

  it('旋转手柄及方向键修改角度，取消手势恢复原图', async () => {
    const { 图, 完成 } = 准备()
    await userEvent.click(图)
    const 旋转 = screen.getByRole('button', { name: '拖动旋转图片' })
    fireEvent(旋转, new MouseEvent('pointerdown', { clientX: 160, clientY: 140, bubbles: true }))
    fireEvent(document, new MouseEvent('pointermove', { clientX: 240, clientY: 220, bubbles: true }))
    expect(图.style.transform).toBe('rotate(90deg) scale(1, 1)')
    fireEvent(document, new MouseEvent('pointercancel', { bubbles: true }))
    expect(图.style.transform).toBe('')
    expect(完成).not.toHaveBeenCalled()
    fireEvent.keyDown(旋转, { key: 'ArrowRight', shiftKey: true })
    expect(图.style.transform).toBe('rotate(15deg) scale(1, 1)')
    expect(完成).toHaveBeenCalledOnce()
  })

  it('旋转弹窗及更多菜单翻转可提交，取消预览不改变图片', async () => {
    const { 图, 完成 } = 准备()
    await userEvent.click(图)
    await userEvent.click(screen.getByRole('button', { name: '图片旋转' }))
    await userEvent.click(screen.getByRole('button', { name: '向右 90°' }))
    await userEvent.click(screen.getByRole('button', { name: '应用' }))
    expect(图.style.transform).toBe('rotate(90deg) scale(1, 1)')
    await userEvent.click(screen.getByRole('button', { name: '更多功能' }))
    await userEvent.click(screen.getByRole('menuitem', { name: '水平翻转' }))
    expect(图.style.transform).toBe('rotate(90deg) scale(-1, 1)')
    const 原图 = 图.outerHTML
    await userEvent.click(screen.getByRole('button', { name: '图片预览' }))
    expect(document.querySelector('.seal-image-preview img')).toHaveAttribute('src', 图.src)
    expect(图.outerHTML).toBe(原图)
    expect(完成).toHaveBeenCalledTimes(2)
  })

  it('拖动四角保持比例，完成时提交一次', async () => {
    const { 图, 开始, 完成 } = 准备()
    await userEvent.click(图)
    fireEvent(screen.getByRole('button', { name: '从右下角调整图片尺寸' }), new MouseEvent('pointerdown', { clientX: 220, clientY: 260, bubbles: true }))
    fireEvent(document, new MouseEvent('pointermove', { clientX: 340, clientY: 340, bubbles: true }))
    expect(图.width).toBe(240)
    expect(图.height).toBe(160)
    fireEvent(document, new MouseEvent('pointerup', { bubbles: true }))
    expect(开始).toHaveBeenCalledOnce()
    expect(完成).toHaveBeenCalledOnce()
  })

  it('取消缩放还原尺寸，不提交修改', async () => {
    const { 图, 完成 } = 准备()
    const 原文 = 图.outerHTML
    await userEvent.click(图)
    fireEvent(screen.getByRole('button', { name: '从右下角调整图片尺寸' }), new MouseEvent('pointerdown', { clientX: 220, clientY: 260, bubbles: true }))
    fireEvent(document, new MouseEvent('pointermove', { clientX: 340, clientY: 340, bubbles: true }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(图.outerHTML).toBe(原文)
    expect(完成).not.toHaveBeenCalled()
  })

  it('锁定比例输入精确宽度，取消弹窗不会修改原图', async () => {
    const { 图, 完成 } = 准备()
    await userEvent.click(图)
    await userEvent.click(screen.getByRole('button', { name: '尺寸' }))
    const 输入 = screen.getByRole('spinbutton', { name: '图片宽度（厘米）' })
    fireEvent.change(输入, { target: { value: '5.08' } })
    await userEvent.click(screen.getByRole('button', { name: '应用' }))
    expect(图.width).toBe(192)
    expect(图.height).toBe(128)
    expect(完成).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: '尺寸' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: '图片宽度（厘米）' }), { target: { value: '2.54' } })
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(图.width).toBe(192)
    expect(完成).toHaveBeenCalledOnce()
  })

  it('只读文档不展示修改入口，切换文档后清除选中', async () => {
    const { 图, 引用, rerender } = 准备()
    await userEvent.click(图)
    rerender(<App><ImageTools 编辑区={引用} 文档标识="其他文档" 只读={false} 开始修改={vi.fn()} 完成修改={vi.fn()} /></App>)
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: '图片工具' })).toBeNull())
    rerender(<App><ImageTools 编辑区={引用} 文档标识="其他文档" 只读={true} 开始修改={vi.fn()} 完成修改={vi.fn()} /></App>)
    await userEvent.click(图)
    expect(screen.queryByRole('toolbar', { name: '图片工具' })).toBeNull()
  })

  it('点击目标与正文拖放都移动原图片，并进入修改链路', async () => {
    const { 根, 图, 完成 } = 准备()
    const 原方法 = Object.getOwnPropertyDescriptor(document, 'caretRangeFromPoint')
    const 范围 = document.createRange()
    范围.setStart(根.lastElementChild!.firstChild!, 2)
    范围.collapse(true)
    Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: () => 范围 })
    try {
      await userEvent.click(图)
      await userEvent.click(screen.getByRole('button', { name: '移动图片' }))
      fireEvent.click(根.lastElementChild!, { clientX: 160, clientY: 260 })
      expect(根.lastElementChild!.querySelector('img')).toBe(图)
      expect(完成).toHaveBeenCalledOnce()
      范围.setStart(根.firstElementChild!.firstChild!, 1)
      范围.collapse(true)
      fireEvent.dragStart(图, { dataTransfer: { setData: vi.fn(), effectAllowed: '' } })
      fireEvent.drop(根, { clientX: 120, clientY: 200 })
      expect(根.firstElementChild!.querySelector('img')).toBe(图)
      expect(根.querySelectorAll('img')).toHaveLength(1)
      expect(完成).toHaveBeenCalledTimes(2)
    } finally {
      if (原方法) Object.defineProperty(document, 'caretRangeFromPoint', 原方法)
      else Reflect.deleteProperty(document, 'caretRangeFromPoint')
    }
  })
})
