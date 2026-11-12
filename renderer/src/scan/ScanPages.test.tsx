import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { IDBFactory } from '../../../mobile/node_modules/fake-indexeddb'

const 处理结果 = { 图片: new Uint8Array([1, 2, 3]), 类型: 'image/jpeg' as const, 宽: 100, 高: 140, 四角: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 140 }, { x: 0, y: 140 }], 已检测: true }
vi.mock('./scanPipeline', () => ({
  处理扫描页: vi.fn(async () => 处理结果),
  压缩原图: vi.fn(async () => new Uint8Array([9])),
  生成原图预览: vi.fn(async () => ({ 地址: 'blob:preview', 宽: 100, 高: 140, 自动四角: 处理结果.四角, 已检测: true })),
}))
const 输入 = vi.hoisted(() => ({ 选择图片: vi.fn(), 拍照: vi.fn() }))
vi.mock('./scanInput', async (原模块) => ({ ...(await 原模块<typeof import('./scanInput')>()), 选择图片: 输入.选择图片, 拍照: 输入.拍照 }))
const 云 = vi.hoisted(() => ({ cloudCall: vi.fn(), 授权: vi.fn(), 顺序: [] as string[] }))
vi.mock('../cloud/CloudProvider', () => ({ cloudCall: (...参数: unknown[]) => { 云.顺序.push('ocr'); return 云.cloudCall(...参数) } }))
vi.mock('../cloud/scanConsent', () => ({ confirmScanUpload: (...参数: unknown[]) => { 云.顺序.push('consent'); return 云.授权(...参数) } }))
const 仓库 = vi.hoisted(() => ({ createDoc: vi.fn() }))
vi.mock('../store', () => ({ useAppStore: () => ({ createDoc: 仓库.createDoc }) }))

import ScanPage from './ScanPage'
import ReceiptPage from './ReceiptPage'

const 渲染 = (页面: React.ReactNode) => render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp>{页面}</AntdApp></ConfigProvider>)
const 图片 = (名称 = '单据1.jpg') => new File([new Uint8Array([255, 216, 255])], 名称, { type: 'image/jpeg' })
const 设置平台 = (平台: 'desktop' | 'web' | 'android' | 'harmony') => {
  delete document.documentElement.dataset.sealPlatform
  delete (window as any).sealNative
  if (平台 === 'web') document.documentElement.dataset.sealPlatform = 'web'
  if (平台 === 'android' || 平台 === 'harmony') { document.documentElement.dataset.sealPlatform = 'app'; (window as any).sealNative = { token: 't', platform: 平台 } }
}

beforeEach(() => {
  ;(globalThis as any).indexedDB = new IDBFactory()
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
  localStorage.clear()
  云.顺序.length = 0
})
afterEach(() => { 设置平台('desktop'); vi.clearAllMocks() })

describe('扫描与识别：各平台入口差异', () => {
  it('Windows 桌面只有导入与截图粘贴，没有拍照按钮，有扫描件库', async () => {
    设置平台('desktop')
    渲染(<ScanPage />)
    expect(screen.queryByRole('button', { name: '拍照' })).toBeNull()
    expect(screen.getByRole('button', { name: '导入图片' })).toBeEnabled()
    expect(screen.getByText('可按 Ctrl+V 粘贴截图')).toBeInTheDocument()
    expect(await screen.findByText('全部扫描件')).toBeInTheDocument()
    expect(screen.getByText('已导出文件')).toBeInTheDocument()
  })

  it('网页版只做上传、处理与下载，不出现扫描件库与拍照', () => {
    设置平台('web')
    渲染(<ScanPage />)
    expect(screen.queryByText('全部扫描件')).toBeNull()
    expect(screen.queryByText('已导出文件')).toBeNull()
    expect(screen.queryByRole('button', { name: '保存到扫描件库' })).toBeNull()
    expect(screen.queryByRole('button', { name: '拍照' })).toBeNull()
    expect(screen.getByRole('button', { name: '导入图片' })).toBeEnabled()
  })

  it('安卓首次拍照先显示本应用的相机用途说明，确认后才调用系统相机', async () => {
    设置平台('android')
    输入.拍照.mockResolvedValue([图片('photo.jpg')])
    const 用户 = userEvent.setup()
    渲染(<ScanPage />)
    await 用户.click(screen.getByRole('button', { name: '拍照' }))
    expect((await screen.findAllByText('使用相机拍摄文档')).length).toBeGreaterThan(0)
    expect(输入.拍照).not.toHaveBeenCalled()
    await 用户.click(screen.getByRole('button', { name: '同意并拍照' }))
    await waitFor(() => expect(输入.拍照).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('第 1 页')).toBeInTheDocument()
    // 已同意过的说明不再重复弹出。
    await 用户.click(screen.getByRole('button', { name: '拍照' }))
    await waitFor(() => expect(输入.拍照).toHaveBeenCalledTimes(2))
  })

  it('拒绝相机权限时给出中文提示，相册导入仍可用', async () => {
    设置平台('harmony')
    localStorage.setItem('seal-scan-camera-notice', '1')
    输入.拍照.mockRejectedValue(Object.assign(new Error('未获得相机权限'), { name: 'CameraDeniedError' }))
    输入.选择图片.mockResolvedValue([图片('相册.jpg')])
    const 用户 = userEvent.setup()
    渲染(<ScanPage />)
    await 用户.click(screen.getByRole('button', { name: '拍照' }))
    expect(await screen.findByText('未获得相机权限，可在系统设置中开启；也可以继续从相册或文件导入。')).toBeInTheDocument()
    await 用户.click(screen.getByRole('button', { name: '相册导入' }))
    expect(await screen.findByText('第 1 页')).toBeInTheDocument()
  })
})

describe('扫描与识别：识别与导出', () => {
  it('识别前调用 scanConsent 授权，拒绝时不上传，界面提示识别结果需核对', async () => {
    设置平台('desktop')
    输入.选择图片.mockResolvedValue([图片()])
    云.授权.mockResolvedValue(false)
    const 用户 = userEvent.setup()
    渲染(<ScanPage />)
    expect(screen.getByText('识别结果需核对')).toBeInTheDocument()
    await 用户.click(screen.getByRole('button', { name: '导入图片' }))
    await screen.findByText('第 1 页')
    await 用户.click(screen.getByRole('button', { name: '识别文字' }))
    await waitFor(() => expect(云.授权).toHaveBeenCalledTimes(1))
    expect(云.cloudCall).not.toHaveBeenCalled()
    expect(await screen.findByText('已取消识别，图片未上传')).toBeInTheDocument()
  })

  it('同意后先授权再识别，识别文字显示在页面下方', async () => {
    设置平台('desktop')
    输入.选择图片.mockResolvedValue([图片()])
    云.授权.mockResolvedValue(true)
    云.cloudCall.mockResolvedValue({ text: '合同正文第一行' })
    const 用户 = userEvent.setup()
    渲染(<ScanPage />)
    await 用户.click(screen.getByRole('button', { name: '导入图片' }))
    await screen.findByText('第 1 页')
    await 用户.click(screen.getByRole('button', { name: '识别文字' }))
    expect(await screen.findByDisplayValue('合同正文第一行')).toBeInTheDocument()
    expect(云.顺序).toEqual(['consent', 'ocr'])
  })

  it('保存到扫描件库后出现在“全部扫描件”，可按分组筛选', async () => {
    设置平台('desktop')
    输入.选择图片.mockResolvedValue([图片(), 图片('第二页.jpg')])
    const 用户 = userEvent.setup()
    渲染(<ScanPage />)
    await 用户.click(screen.getByRole('button', { name: '导入图片' }))
    await screen.findByText('第 2 页')
    // 扫描件库在 useEffect 中异步打开，负载较高时按钮稍晚出现。
    await 用户.click(await screen.findByRole('button', { name: '保存到扫描件库' }, { timeout: 5000 }))
    const 对话框 = await screen.findByRole('dialog')
    await 用户.clear(within(对话框).getByLabelText('扫描件名称'))
    await 用户.type(within(对话框).getByLabelText('扫描件名称'), '租赁合同')
    await 用户.click(within(对话框).getByRole('button', { name: '保存' }))
    await 用户.click(await screen.findByText('全部扫描件'))
    expect(await screen.findByText('租赁合同', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText(/^2 页/)).toBeInTheDocument()
  })
})

describe('单据转表格', () => {
  it('未选择单据类型时明确提示，不识别也不输出表格', async () => {
    设置平台('desktop')
    输入.选择图片.mockResolvedValue([图片()])
    const 用户 = userEvent.setup()
    渲染(<ReceiptPage />)
    expect(screen.queryByRole('button', { name: '拍照' })).toBeNull()
    await 用户.click(screen.getByRole('button', { name: '导入图片' }))
    await screen.findByText('单据1.jpg')
    await 用户.click(screen.getByRole('button', { name: '开始识别' }))
    expect(await screen.findByText('请先选择单据类型')).toBeInTheDocument()
    expect(云.授权).not.toHaveBeenCalled()
    expect(仓库.createDoc).not.toHaveBeenCalled()
  })

  it('识别后列出数字不符等异常，确认后生成新工作表并高亮异常单元格', async () => {
    设置平台('desktop')
    输入.选择图片.mockResolvedValue([图片()])
    云.授权.mockResolvedValue(true)
    云.cloudCall.mockResolvedValue({ text: '单号：SH1 日期：2026-11-01\n| 品名 | 规格 | 数量 | 单位 | 单价 | 金额 |\n| 线材 | Φ8 | 2 | 吨 | 4100 | 8300 |' })
    const 用户 = userEvent.setup()
    渲染(<ReceiptPage />)
    await 用户.click(screen.getByRole('combobox', { name: '单据类型' }))
    await 用户.click(await screen.findByTitle('送货单'))
    await 用户.click(screen.getByRole('button', { name: '导入图片' }))
    await screen.findByText('单据1.jpg')
    await 用户.click(screen.getByRole('button', { name: '开始识别' }))
    expect(await screen.findByText('数量 × 单价 = 8200，与金额 8300 不符')).toBeInTheDocument()
    expect(云.cloudCall).toHaveBeenCalledWith('ocrImage', expect.objectContaining({ consent: true, layout: 'table' }))
    await 用户.click(screen.getByRole('button', { name: '生成工作表' }))
    await 用户.click(await screen.findByRole('button', { name: '仍然生成' }))
    await waitFor(() => expect(仓库.createDoc).toHaveBeenCalledTimes(1))
    const [类型, 工作表] = 仓库.createDoc.mock.calls[0]
    expect(类型).toBe('table')
    expect(工作表[0].单元格.K2.批注).toBe('数量 × 单价 = 8200，与金额 8300 不符')
  })

  it('一次最多 100 张，超出部分不加入并提示', async () => {
    设置平台('desktop')
    输入.选择图片.mockResolvedValue(Array.from({ length: 101 }, (_, 序号) => 图片(`单据${序号 + 1}.jpg`)))
    const 用户 = userEvent.setup()
    渲染(<ReceiptPage />)
    await 用户.click(screen.getByRole('button', { name: '导入图片' }))
    expect(await screen.findByText('一次最多识别 100 张单据，超出的 1 张未加入')).toBeInTheDocument()
    expect(screen.getByText('已添加 100 张图片')).toBeInTheDocument()
  })
})
