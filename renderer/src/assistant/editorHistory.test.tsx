import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import { AppProvider, useAppStore } from '../store'
import DocEditor from '../editor/DocEditor'
import SheetEditor from '../sheet/SheetEditor'
import PptEditor from '../ppt/PptEditor'
import { 写入单元格 } from '../sheet/model'
import { 创建演示文稿 } from '../ppt/deck'

describe('助手修改可撤销', () => {
  it('文字外部更新后可撤销到原文', async () => {
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('word', '<p>原文</p>')}>打开文字</button>
        <button onClick={() => 状态.activeDocumentId && 状态.updateEditorHtml(状态.activeDocumentId, '<p>助手改写</p>')}>应用助手文字</button>
        {状态.module === 'word' ? <DocEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开文字' }))
    await userEvent.click(screen.getByRole('button', { name: '应用助手文字' }))
    await waitFor(() => expect(container.querySelector('.wps-editor-canvas__content')?.textContent).toBe('助手改写'))
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    await waitFor(() => expect(container.querySelector('.wps-editor-canvas__content')?.textContent).toBe('原文'))
  })

  it('表格外部更新后可撤销到原值', async () => {
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>原值</td></tr></table>')}>打开表格</button>
        <button onClick={() => 状态.activeDocumentId && 状态.更新表格文档模型(状态.activeDocumentId, (列表) => 列表.map((表, 索引) => 索引 === 0 ? 写入单元格(表, 'A1', '助手改写') : 表))}>应用助手表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开表格' }))
    await userEvent.click(screen.getByRole('button', { name: '应用助手表格' }))
    await waitFor(() => expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('助手改写'))
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    await waitFor(() => expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('原值'))
  })

  it('演示外部更新后可撤销到原文本', async () => {
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 创建演示文稿())}>打开演示</button>
        <button onClick={() => 状态.activeDocumentId && 状态.更新演示文档模型(状态.activeDocumentId, (文稿) => ({ ...文稿, 幻灯片列表: 文稿.幻灯片列表.map((页, 索引) => 索引 === 0 ? { ...页, 文本框列表: 页.文本框列表.map((框, 框序) => 框序 === 0 ? { ...框, text: '助手改写' } : 框) } : 页) }))}>应用助手演示</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开演示' }))
    await userEvent.click(screen.getByRole('button', { name: '应用助手演示' }))
    await waitFor(() => expect(container.querySelector('.wps-ppt-canvas')?.textContent).toContain('助手改写'))
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    await waitFor(() => expect(container.querySelector('.wps-ppt-canvas')?.textContent).toContain('单击此处添加标题'))
  })
})
