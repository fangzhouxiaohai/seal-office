import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import DocEditor from './DocEditor'
import { AppProvider } from '../store'

const 渲染编辑器 = () =>
  render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <AntdApp>
        <AppProvider>
          <DocEditor />
        </AppProvider>
      </AntdApp>
    </ConfigProvider>
  )

describe('编辑器容器', () => {
  it('同时渲染标签栏、Ribbon、编辑区与状态栏', () => {
    const { container } = 渲染编辑器()
    expect(container.querySelector('.wps-doc-tabs')).not.toBeNull()
    expect(container.querySelector('.wps-ribbon-tabs')).not.toBeNull()
    expect(container.querySelector('.wps-ribbon-panel')).not.toBeNull()
    expect(container.querySelector('.wps-editor-canvas__content')).not.toBeNull()
    expect(container.querySelector('.wps-editor-status')).not.toBeNull()
  })

  it('默认展示开始标签的功能组', () => {
    渲染编辑器()
    expect(screen.getByText('剪贴板')).toBeInTheDocument()
    expect(screen.getByText('字体')).toBeInTheDocument()
  })

  it('点击插入标签后功能区切换', async () => {
    渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    const 功能区 = document.querySelector('.wps-ribbon-panel') as HTMLElement
    expect(within(功能区).queryByText('剪贴板')).toBeNull()
    expect(within(功能区).getByText('插图')).toBeInTheDocument()
  })

  it('点击未实现命令给出中文提示', async () => {
    渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    // 绘制表格属于尚未实现的功能，用于验证未实现提示
    await userEvent.click(screen.getByRole('button', { name: '绘制表格' }))
    expect(await screen.findByText('该功能开发中')).toBeInTheDocument()
  })

  // jsdom 不支持 execCommand 的真实插入，因此这里只验证命令被正确派发并给出中文提示，
  // 图形与公式是否真正写入文档由运行窗口验证。
  it('插入图表命令给出中文提示', async () => {
    渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '图表' }))
    await userEvent.click(await screen.findByText('折线图'))
    expect(await screen.findByText(/已插入折线图/)).toBeInTheDocument()
  })

  it('插入公式命令给出中文提示', async () => {
    渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '公式' }))
    await userEvent.click(await screen.findByText('分数'))
    expect(await screen.findByText(/已插入「分数」公式/)).toBeInTheDocument()
  })

  it('保护文档后编辑区转为只读', async () => {
    const { container } = 渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '审阅' }))
    await userEvent.click(screen.getByRole('button', { name: '保护文档' }))
    expect(await screen.findByText(/已开启文档保护/)).toBeInTheDocument()
    const 编辑区 = container.querySelector('.wps-editor-canvas__content')
    expect(编辑区?.getAttribute('contenteditable')).toBe('false')
  })

  it('点击查找命令后展开查找面板', async () => {
    渲染编辑器()
    await userEvent.click(screen.getByRole('button', { name: '查找' }))
    expect(await screen.findByPlaceholderText('查找内容')).toBeInTheDocument()
  })

  it('标签栏在无文档时仍渲染新建入口', () => {
    渲染编辑器()
    expect(screen.getByRole('button', { name: '新建文档' })).toBeInTheDocument()
  })

  it('点击新建文档后出现一个文档标签', async () => {
    const { container } = 渲染编辑器()
    expect(container.querySelectorAll('.wps-doc-tab')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: '新建文档' }))
    expect(container.querySelectorAll('.wps-doc-tab')).toHaveLength(1)
  })

  it('状态栏展示字数统计', () => {
    渲染编辑器()
    expect(screen.getByText(/字数：/)).toBeInTheDocument()
  })

  it('切换视图模式命令改变状态栏展示', async () => {
    const { container } = 渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '视图' }))
    await userEvent.click(screen.getByRole('button', { name: '阅读版式' }))
    const 状态栏 = container.querySelector('.wps-editor-status') as HTMLElement
    expect(within(状态栏).getByText('阅读版式')).toBeInTheDocument()
  })

  it('渲染标尺', () => {
    const { container } = 渲染编辑器()
    expect(container.querySelector('.wps-ruler')).not.toBeNull()
  })
})
