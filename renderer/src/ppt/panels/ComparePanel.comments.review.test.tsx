import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import ComparePanel from './ComparePanel'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

const 设置后端 = (返回: unknown) => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\右侧.pptx'),
      presentationCompare: { compareFiles: vi.fn().mockResolvedValue(返回) },
    },
  })
}

it('批注差异不会因为无法归属页面而消失', async () => {
  设置后端({
    成功: true,
    汇总: { 新增页: 0, 删除页: 0, 移动页: 0, 修改页: 0, 差异项: 1 },
    页面: [],
    批注: {
      数量: 1,
      差异: [{ 类型: '批注', 标识: '批甲', 页标识: '已删除页', 字段: '页标识', 左: '页一', 右: '已删除页' }],
      未归属页面: [{ 类型: '批注', 标识: '批甲', 页标识: '已删除页', 字段: '页标识', 左: '页一', 右: '已删除页' }],
    },
    警告: { 左: [], 右: [] },
  })
  render(<App><ComparePanel 当前路径={'C:\\资料\\左侧.pptx'} /></App>)
  await userEvent.click(screen.getByRole('button', { name: '选择右侧文件' }))
  await userEvent.click(screen.getByRole('button', { name: '开始比对' }))
  await waitFor(() => expect(screen.getByText(/批注（未归属到现存页面，1）/)).toBeInTheDocument())
  expect(screen.getByText(/已删除页 · 批甲/)).toBeInTheDocument()
  expect(screen.getByText('页标识')).toBeInTheDocument()
  expect(screen.queryByText('两份文稿没有可报告的差异。')).not.toBeInTheDocument()
})

it('页面内批注差异按批注分组显示', async () => {
  设置后端({
    成功: true,
    汇总: { 新增页: 0, 删除页: 0, 移动页: 0, 修改页: 1, 差异项: 1 },
    页面: [{ 标识: '页一', 类型: '修改', 标题: '第一页', 差异: [{ 类型: '批注', 标识: '批甲', 字段: '已解决', 左: false, 右: true }] }],
    警告: { 左: [], 右: [] },
  })
  render(<App><ComparePanel 当前路径={'C:\\资料\\左侧.pptx'} /></App>)
  await userEvent.click(screen.getByRole('button', { name: '选择右侧文件' }))
  await userEvent.click(screen.getByRole('button', { name: '开始比对' }))
  await waitFor(() => expect(screen.getByText(/批注（1）/)).toBeInTheDocument())
  expect(screen.getByText('已解决')).toBeInTheDocument()
  expect(screen.getAllByText('false').length).toBeGreaterThan(0)
  expect(screen.getAllByText('true').length).toBeGreaterThan(0)
})
