import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import CloudFileBrowser, { type CloudNode } from './CloudFileBrowser'
import { 计算大小 } from './fileInfo'

vi.mock('../store/settingsStore', () => ({ useSettings: () => ({ 语言: 'zh-CN' }) }))

const 节点: CloudNode[] = [
  { id: 'd', parent: null, kind: 'folder', deleted: 0, version: 0, updated: Date.UTC(2026, 10, 20), bytes: null, created: null, meta: { name: '资料' } },
  { id: 'a', parent: 'd', kind: 'file', deleted: 0, version: 2, updated: Date.UTC(2026, 10, 21), bytes: 2048, created: Date.UTC(2026, 10, 1), meta: { name: '报告.docx' } },
  { id: 'b', parent: null, kind: 'file', deleted: 0, version: 1, updated: Date.UTC(2026, 10, 22), bytes: 3 * 1024 * 1024, created: Date.UTC(2026, 10, 2), meta: { name: '很长很长的文件名称.xlsx' } },
]

describe('云文件大小与悬停卡', () => {
  afterEach(() => { vi.useRealTimers(); localStorage.clear() })
  it('列表视图显示大小列，文件夹为递归汇总', () => {
    localStorage.setItem('seal-cloud-view', 'list')
    render(<CloudFileBrowser nodes={节点.filter(n => n.parent === null)} selected={[]} onSelect={() => {}} onOpen={() => {}} actions={() => []} busy={false} sizes={计算大小(节点)} />)
    expect(screen.getByText('大小')).toBeTruthy()
    expect(screen.getByText('2.0 KB')).toBeTruthy()
    expect(screen.getByText('3.0 MB')).toBeTruthy()
  })
  it('网格视图悬停 300ms 显示名称、大小、创建与修改时间，移出收起', () => {
    vi.useFakeTimers()
    localStorage.setItem('seal-cloud-view', 'grid')
    render(<CloudFileBrowser nodes={节点.filter(n => n.parent === null)} selected={[]} onSelect={() => {}} onOpen={() => {}} actions={() => []} busy={false} sizes={计算大小(节点)} />)
    const 按钮 = screen.getByText('很长很长的文件名称.xlsx').closest('button')!
    fireEvent.mouseEnter(按钮)
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => { vi.advanceTimersByTime(300) })
    const 卡片 = screen.getByRole('tooltip')
    expect(卡片.textContent).toContain('很长很长的文件名称.xlsx')
    expect(卡片.textContent).toContain('3.0 MB')
    expect(卡片.textContent).toContain('创建时间')
    expect(按钮.getAttribute('aria-describedby')).toBe('seal-drive-hover-card')
    fireEvent.mouseLeave(按钮)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
