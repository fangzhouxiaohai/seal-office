import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { useState } from 'react'
import MobileScanCamera from './MobileScanCamera'
import type { 扫描模式, 扫描取景参数 } from './scanModes'

const 相机 = vi.hoisted(() => ({ status: 'ready', videoRef: { current: null }, error: '', start: vi.fn(), stop: vi.fn(), capture: vi.fn(), torchAvailable: false, torchEnabled: false, toggleTorch: vi.fn() }))
vi.mock('./useMobileViewfinder', () => ({ useMobileViewfinder: () => 相机 }))
const 选择 = vi.hoisted(() => vi.fn())
vi.mock('./scanInput', async () => ({ ...(await vi.importActual<typeof import('./scanInput')>('./scanInput')), 选择图片: 选择 }))

function 场景(参数: Partial<扫描取景参数>) {
  const [模式, 切换模式] = useState<扫描模式>(参数.模式 || '文件扫描')
  return <App><MobileScanCamera 证件="身份证" 切换证件={vi.fn()} 书籍="单页" 切换书籍={vi.fn()} 页数={0} 忙碌={false} 接收图片={vi.fn()} 查看结果={vi.fn()} 返回={vi.fn()} {...参数} 模式={模式} 切换模式={切换模式} /></App>
}

beforeEach(() => { vi.clearAllMocks(); 相机.status = 'ready'; 相机.torchAvailable = false; localStorage.clear() })

it('首次进入自动启动镜头，取景失败仍可从相册导入', async () => {
  相机.status = 'unavailable'
  const 接收图片 = vi.fn(), 查看结果 = vi.fn(), 文件 = new File(['图片'], '文稿.png', {type:'image/png'})
  选择.mockResolvedValue([文件]); render(<场景 接收图片={接收图片} 查看结果={查看结果} />)
  await waitFor(() => expect(相机.start).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', {name:'导入图片'}))
  await waitFor(() => expect(接收图片).toHaveBeenCalledWith([文件], '相册'))
  expect(查看结果).toHaveBeenCalledOnce()
})

it('连续拍摄保留取景，手动点结果后释放镜头', async () => {
  const 查看结果=vi.fn(), 接收图片=vi.fn(); 相机.capture.mockResolvedValue(new File(['原图'],'拍摄.jpg',{type:'image/jpeg'}))
  render(<场景 页数={1} 查看结果={查看结果} 接收图片={接收图片} />)
  fireEvent.loadedData(screen.getByLabelText('实时相机画面'))
  fireEvent.click(screen.getByRole('button',{name:'连拍'})); fireEvent.click(screen.getByRole('button',{name:'拍照'}))
  await waitFor(()=>expect(接收图片).toHaveBeenCalledOnce()); expect(查看结果).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:/查看.*1.*页/})); expect(相机.stop).toHaveBeenCalled(); expect(查看结果).toHaveBeenCalledOnce()
})

it('更多模式能打开证件选项，书籍双页面有明确的对齐提示', () => {
  const 切换证件=vi.fn();const {unmount}=render(<场景 切换证件={切换证件} />)
  fireEvent.click(screen.getByRole('button',{name:'更多模式'})); fireEvent.click(screen.getByRole('button',{name:'证件扫描'})); fireEvent.click(screen.getByRole('button',{name:'护照'})); expect(切换证件).toHaveBeenCalledWith('护照'); unmount()
  render(<场景 模式="拍书籍" 书籍="双页" />); expect(screen.getByText(/中缝/)).toBeInTheDocument(); expect(screen.queryByRole('button',{name:'补光'})).toBeNull()
})
