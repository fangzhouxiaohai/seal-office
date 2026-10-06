import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from 'antd'
import { expect, it, vi } from 'vitest'
import { 创建演示文稿 } from '../deck'
import DocumentSecurityPanel from './DocumentSecurityPanel'

it('标记定稿写入定稿时间与可选标记人，并明确不是加密保护', async () => {
  const 文稿 = 创建演示文稿(), 修改 = vi.fn()
  render(<App><DocumentSecurityPanel 文稿={文稿} 只读={false} on修改={修改} /></App>)
  expect(screen.getByText(/本版本不提供文档密码加密/)).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('标记人'), '张三')
  await userEvent.click(screen.getByRole('button', { name: '标记为定稿' }))
  const 新稿 = 修改.mock.calls[0][0]
  expect(新稿.定稿.标记人).toBe('张三')
  expect(新稿.定稿.时间).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
  expect(新稿).not.toBe(文稿)
  expect(文稿.定稿).toBeUndefined()
})

it('留空标记人时只写入定稿时间', async () => {
  const 文稿 = 创建演示文稿(), 修改 = vi.fn()
  render(<App><DocumentSecurityPanel 文稿={文稿} 只读={false} on修改={修改} /></App>)
  await userEvent.click(screen.getByRole('button', { name: '标记为定稿' }))
  expect(修改.mock.calls[0][0].定稿).toEqual({ 时间: expect.stringMatching(/Z$/) })
})

it('已定稿时展示元数据，继续编辑移除定稿标记', async () => {
  const 文稿 = 创建演示文稿(), 修改 = vi.fn()
  文稿.定稿 = { 时间: '2026-10-06T10:30:00.000Z', 标记人: '张三' }
  render(<App><DocumentSecurityPanel 文稿={文稿} 只读={false} on修改={修改} /></App>)
  expect(screen.getByText('2026-10-06T10:30:00.000Z')).toBeInTheDocument()
  expect(screen.getByText('张三')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '继续编辑' }))
  const 新稿 = 修改.mock.calls[0][0]
  expect('定稿' in 新稿).toBe(false)
  expect(新稿).not.toBe(文稿)
})

it('只读状态下不能标记定稿，但定稿后的「继续编辑」始终可用', async () => {
  const 文稿 = 创建演示文稿(), 修改 = vi.fn()
  const { rerender } = render(<App><DocumentSecurityPanel 文稿={文稿} 只读 on修改={修改} /></App>)
  expect(screen.getByRole('button', { name: '标记为定稿' })).toBeDisabled()
  expect(screen.getByLabelText('标记人')).toBeDisabled()
  文稿.定稿 = { 时间: '2026-10-06T10:30:00.000Z' }
  rerender(<App><DocumentSecurityPanel 文稿={文稿} 只读 on修改={修改} /></App>)
  const 继续 = screen.getByRole('button', { name: '继续编辑' })
  expect(继续).toBeEnabled()
  await userEvent.click(继续)
  expect('定稿' in 修改.mock.calls[0][0]).toBe(false)
})
