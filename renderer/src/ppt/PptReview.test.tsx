import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import PptEditor from './PptEditor'
import { AppProvider } from '../store'

const 渲染演示 = () =>
  render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <AntdApp>
        <AppProvider>
          <PptEditor />
        </AppProvider>
      </AntdApp>
    </ConfigProvider>
  )

afterEach(() => {
  Reflect.deleteProperty(window, 'electronAPI')
})

const 准备桥接 = () => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })),
      presentationResources: { sync: vi.fn(async () => ({ 成功: true })), release: vi.fn(async () => ({ 成功: true })) },
    },
  })
}

it('审阅标签提供真实入口：命令打开面板、批注进入画布标记、显示开关不改正文', async () => {
  准备桥接()
  const { container } = 渲染演示()
  fireEvent.click(screen.getByRole('tab', { name: '审阅' }))
  expect(screen.getByRole('complementary', { name: '审阅' })).toBeInTheDocument()
  expect(screen.getByText(/本机排版检查/)).toBeInTheDocument()

  // 批注命令进入批注面板，而不是只给提示
  fireEvent.click(screen.getByRole('button', { name: '新建批注' }))
  const 批注面板 = screen.getByRole('complementary', { name: '批注' })
  expect(批注面板).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('批注内容'), { target: { value: '标题再短一些' } })
  fireEvent.click(screen.getByRole('button', { name: '添加批注' }))
  expect(await screen.findByText('标题再短一些')).toBeInTheDocument()
  expect(container.querySelectorAll('[data-批注标记]')).toHaveLength(1)

  // 显示开关只改变视图：标记消失，批注内容仍在
  fireEvent.click(screen.getByLabelText('显示批注标记'))
  expect(container.querySelectorAll('[data-批注标记]')).toHaveLength(0)
  expect(screen.getByText('标题再短一些')).toBeInTheDocument()

  // 批注面板内可以返回排版检查，不必回到功能区
  fireEvent.click(screen.getAllByRole('button', { name: '排版检查' })[0])
  expect(screen.getByRole('complementary', { name: '审阅' })).toBeInTheDocument()

  // 繁简转换入口进入转换面板并给出差异预览
  fireEvent.click(screen.getByRole('button', { name: '简转繁' }))
  expect(screen.getByLabelText('转换方向')).toHaveValue('繁')
  expect(screen.getByText(/本机词组转换覆盖/)).toBeInTheDocument()
})

it('只读状态下批注面板仍可查看，但不可改写', async () => {
  准备桥接()
  渲染演示()
  fireEvent.click(screen.getByLabelText('只读查看'))
  fireEvent.click(screen.getByRole('tab', { name: '审阅' }))
  fireEvent.click(screen.getByRole('button', { name: '新建批注' }))
  expect(screen.getByRole('complementary', { name: '批注' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '添加批注' })).toBeDisabled()
  expect(screen.getByLabelText('批注内容')).toBeDisabled()
})
