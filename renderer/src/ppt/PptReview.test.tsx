import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import PptEditor from './PptEditor'
import { AppProvider, useAppStore, type AppState } from '../store'
import { 创建演示文稿 } from './deck'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

const 准备桥接 = () => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })),
      presentationResources: { sync: vi.fn(async () => ({ 成功: true })), release: vi.fn(async () => ({ 成功: true })) },
    },
  })
}

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

/** 功能区与审阅面板存在同名按钮，功能区按钮必须限定在 ribbon 面板内查找。 */
const 功能区按钮 = (名称: string): HTMLElement => {
  const 面板 = document.querySelector('.wps-ribbon-panel')
  if (!面板) throw new Error('未找到功能区面板')
  return within(面板 as HTMLElement).getByRole('button', { name: 名称 })
}

const 准备编辑器 = async () => {
  准备桥接()
  let 状态: AppState | null = null
  const 入口 = () => { 状态 = useAppStore(); return 状态.documents.length ? <PptEditor /> : null }
  render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
  await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
  act(() => 状态!.createDoc('ppt', 创建演示文稿()))
  const 标识 = () => 状态!.activeDocumentId!
  return { 状态: () => 状态!, 标识 }
}

it('审阅标签提供真实入口：命令打开面板、批注进入画布标记、显示开关不改正文', async () => {
  准备桥接()
  const { container } = 渲染演示()
  fireEvent.click(screen.getByRole('tab', { name: '审阅' }))
  expect(screen.getByRole('complementary', { name: '审阅' })).toBeInTheDocument()
  expect(screen.getByText(/本机排版检查/)).toBeInTheDocument()

  // 批注命令进入批注面板，而不是只给提示
  fireEvent.click(功能区按钮('新建批注'))
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
  fireEvent.click(功能区按钮('简转繁'))
  expect(screen.getByLabelText('转换方向')).toHaveValue('繁')
  expect(screen.getByText(/本机词组转换覆盖/)).toBeInTheDocument()
})

it('只读状态下批注面板仍可查看，但不可改写', async () => {
  准备桥接()
  渲染演示()
  fireEvent.click(screen.getByLabelText('只读查看'))
  fireEvent.click(screen.getByRole('tab', { name: '审阅' }))
  fireEvent.click(功能区按钮('新建批注'))
  expect(screen.getByRole('complementary', { name: '批注' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '添加批注' })).toBeDisabled()
  expect(screen.getByLabelText('批注内容')).toBeDisabled()
})

it('设计面板不会泄漏到其它标签页，切回后仍可使用', async () => {
  准备桥接()
  渲染演示()
  fireEvent.click(screen.getByRole('tab', { name: '设计' }))
  fireEvent.click(功能区按钮('主题面板'))
  expect(await screen.findByRole('complementary', { name: '设计主题面板' })).toBeInTheDocument()

  // 切到工具标签：设计面板必须让位给工具面板，不能继续占着右侧区域
  fireEvent.click(screen.getByRole('tab', { name: '工具' }))
  expect(screen.queryByRole('complementary', { name: '设计主题面板' })).not.toBeInTheDocument()
  expect(await screen.findByRole('complementary', { name: '工具面板' })).toBeInTheDocument()

  // 切回设计标签：仍是之前打开的主题面板
  fireEvent.click(screen.getByRole('tab', { name: '设计' }))
  expect(await screen.findByRole('complementary', { name: '设计主题面板' })).toBeInTheDocument()
})

it('功能区「文档定稿」打开定稿面板，定稿后编辑器进入只读并可继续编辑', async () => {
  const { 状态, 标识 } = await 准备编辑器()
  await userEvent.click(await screen.findByRole('tab', { name: '审阅' }))
  await userEvent.click(功能区按钮('文档定稿'))
  const 标记 = await screen.findByRole('button', { name: '标记为定稿' })
  expect(screen.getByText(/本版本不提供文档密码加密/)).toBeInTheDocument()
  await userEvent.click(标记)

  await waitFor(() => expect(状态().演示文档模型[标识()].定稿).toBeTruthy())
  const 只读框 = screen.getByRole('checkbox', { name: /只读查看/ })
  expect(只读框).toBeChecked()
  expect(只读框).toBeDisabled()
  expect(screen.getByText('本文稿已标记为定稿，处于只读状态。')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '继续编辑' }))
  await waitFor(() => expect(状态().演示文档模型[标识()].定稿).toBeUndefined())
  expect(screen.getByRole('checkbox', { name: /只读查看/ })).not.toBeChecked()
})

it('功能区「文档比对」切换到比对视图并说明只读取文件', async () => {
  const { 状态 } = await 准备编辑器()
  await userEvent.click(await screen.findByRole('tab', { name: '审阅' }))
  await userEvent.click(功能区按钮('文档比对'))
  expect(await screen.findByRole('button', { name: '选择左侧文件' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '选择右侧文件' })).toBeInTheDocument()
  expect(screen.getByText(/比对只读取两份文件，不会修改其中任何一份/)).toBeInTheDocument()
  expect(状态().演示文档模型[状态().activeDocumentId!].定稿).toBeUndefined()
})
