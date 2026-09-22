import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import PptEditor from './PptEditor'

const 渲染演示 = () =>
  render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <AntdApp>
        <PptEditor />
      </AntdApp>
    </ConfigProvider>
  )

describe('演示文稿编辑器容器', () => {
  it('渲染 Ribbon 八标签', () => {
    渲染演示()
    ;['开始', '插入', '设计', '切换', '动画', '幻灯片放映', '审阅', '视图'].forEach((名称) => {
      expect(screen.getByRole('tab', { name: 名称 })).toBeInTheDocument()
    })
  })

  it('渲染缩略图、画布与状态栏', () => {
    const { container } = 渲染演示()
    expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(1)
    expect(container.querySelector('.wps-ppt-canvas')).not.toBeNull()
    expect(container.querySelector('.wps-editor-status')).not.toBeNull()
  })

  it('画布渲染版式初始文本框', () => {
    const { container } = 渲染演示()
    expect(container.querySelectorAll('.wps-ppt-box')).toHaveLength(1)
    // 缩略图也会展示文本，此处限定画布内容
    expect(container.querySelector('.wps-ppt-canvas')?.textContent).toContain('单击此处添加标题')
  })

  it('状态栏展示幻灯片序号与总数', () => {
    渲染演示()
    expect(screen.getByText('第 1 张')).toBeInTheDocument()
    expect(screen.getByText('共 1 张')).toBeInTheDocument()
  })

  it('点击缩略图区的新建按钮后缩略图增加', async () => {
    const { container } = 渲染演示()
    await userEvent.click(container.querySelector('.wps-ppt-thumbs__create') as HTMLElement)
    expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(2)
  })

  it('点击插入标签下的未实现命令给出中文提示', async () => {
    渲染演示()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '图表' }))
    expect(await screen.findByText('该功能开发中')).toBeInTheDocument()
  })

  it('点击缩略图切换当前幻灯片', async () => {
    const { container } = 渲染演示()
    await userEvent.click(container.querySelector('.wps-ppt-thumbs__create') as HTMLElement)
    const 缩略图 = container.querySelectorAll('.wps-ppt-thumb')
    await userEvent.click(缩略图[0])
    expect(screen.getByText('第 1 张')).toBeInTheDocument()
  })

  it('未选中文本框时格式命令给出中文提示', async () => {
    渲染演示()
    await userEvent.click(screen.getByRole('button', { name: '加粗' }))
    expect(await screen.findByText('请先在画布中选中一个文本框')).toBeInTheDocument()
  })
})
