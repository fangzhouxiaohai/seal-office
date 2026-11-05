import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { expect, it } from 'vitest'
import { AppProvider } from '../store'
import SheetEditor from './SheetEditor'

it('右键单元格格式可修改选区样式并撤销，不提供误改整行的单元格操作', async () => {
  const { container } = render(<React.StrictMode><ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><SheetEditor /></AppProvider></AntdApp></ConfigProvider></React.StrictMode>)
  const 单元格 = container.querySelector('[data-地址="A1"]') as HTMLElement
  fireEvent.contextMenu(单元格, { clientX: 100, clientY: 100 })
  expect(screen.queryByRole('menuitem', { name: '插入...' })).not.toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: '删除...' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('menuitem', { name: '设置单元格格式' }))
  const 对话框 = await screen.findByRole('dialog', { name: '设置单元格格式' })
  fireEvent.change(within(对话框).getByRole('spinbutton', { name: '字号' }), { target: { value: '18' } })
  fireEvent.change(within(对话框).getByRole('combobox', { name: '水平对齐' }), { target: { value: 'center' } })
  await userEvent.click(within(对话框).getByRole('button', { name: '应用格式' }))
  await waitFor(() => expect(单元格.style.fontSize).toBe('18pt'))
  expect(单元格.style.textAlign).toBe('center')
  await userEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(单元格.style.fontSize).toBe('')
})
