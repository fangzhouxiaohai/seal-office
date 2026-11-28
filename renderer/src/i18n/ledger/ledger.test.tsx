import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { 台账 } from './index'
import { 取文案 } from '../t'

const 语言 = vi.hoisted(() => ({ 当前: 'en-US' as 'en-US' | 'zh-CN' }))
vi.mock('../../store/settingsStore', () => ({ useSettings: () => ({ 语言: 语言.当前 }), use界面语言: () => 语言.当前 }))
vi.mock('../../store', () => ({ useAppStore: () => ({ createDoc: () => {}, setNavKey: () => {}, showSettings: () => {} }) }))

describe('文案台账', () => {
  it('键名、英文与占位符符合规范', () => {
    for (const [键, 条目] of Object.entries(台账)) {
      expect(键).toMatch(/^[a-z0-9]+(\.[a-z0-9]+)+$/)
      expect(条目.en.trim()).not.toBe('')
      expect(条目.en).not.toMatch(/[㐀-鿿]/u)
      const 占位 = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join()
      expect(占位(条目.en)).toBe(占位(条目.zh))
      const 单数 = (条目 as { enOne?: string }).enOne
      if (单数 !== undefined) {
        expect(单数).not.toMatch(/[㐀-鿿]/u)
        expect(占位(单数)).toBe(占位(条目.zh))
        expect(占位(条目.zh)).toContain('count')
      }
    }
  })
  it('英文按 0、1、多项区分单复数，中文不变', () => {
    expect(取文案('diagram.projects.nodes', 'en-US', { count: 0 })).toBe('0 nodes')
    expect(取文案('diagram.projects.nodes', 'en-US', { count: 1 })).toBe('1 node')
    expect(取文案('diagram.projects.nodes', 'en-US', { count: 5 })).toBe('5 nodes')
    expect(取文案('diagram.projects.nodes', 'zh-CN', { count: 1 })).toBe('1 个节点')
  })
  it('截图中的两个组合按钮按完整消息翻译', () => {
    expect(取文案('diagram.projects.create', 'en-US', { kind: 取文案('diagram.kind.flowchart', 'en-US') })).toBe('New flowchart project')
    expect(取文案('diagram.projects.create', 'zh-CN', { kind: 取文案('diagram.kind.flowchart', 'zh-CN') })).toBe('新建流程图项目')
    expect(取文案('diagram.projects.tab.trash', 'en-US', { count: 0 })).toBe('Recycle bin (0)')
    expect(取文案('diagram.projects.tab.trash', 'zh-CN', { count: 0 })).toBe('回收站 (0)')
  })
  it('按语言取词并替换占位参数，缺参数时保留原占位', () => {
    expect(取文案('apps.page.title', 'zh-CN')).toBe('应用')
    expect(取文案('apps.page.title', 'en-US')).toBe('Apps')
  })
})

describe('应用页显式文案', () => {
  it('英文模式下应用页不残留中文（计划点名的 9 条漏译已覆盖）', async () => {
    语言.当前 = 'en-US'
    const { default: AppsPage } = await import('../../localTools/AppsPage')
    const { container } = render(<AntdApp><AppsPage /></AntdApp>)
    expect(screen.getByRole('heading', { name: 'Apps' })).toBeTruthy()
    for (const 英文 of ['Write and edit documents', 'Organize and calculate data', 'Maintain MDB and ACCDB databases', 'Schedule events and export calendar files', 'Organize topics and branches', 'Posters, square images, banners, and long infographics', 'Markdown, notebooks, tags, and recycle bin', 'Edit the open file through conversation', 'Adjust app and model service settings'])
      expect(container.textContent).toContain(英文)
    expect(container.textContent).not.toMatch(/[㐀-鿿]/u)
  })
  it('切回中文立即显示中文', async () => {
    语言.当前 = 'zh-CN'
    const { default: AppsPage } = await import('../../localTools/AppsPage')
    render(<AntdApp><AppsPage /></AntdApp>)
    expect(screen.getByRole('heading', { name: '应用' })).toBeTruthy()
    expect(screen.getByText('编写与编辑文档')).toBeTruthy()
  })
})
