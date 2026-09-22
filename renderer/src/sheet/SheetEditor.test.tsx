import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import SheetEditor from './SheetEditor'
import { SheetStatusBar, SheetTabs } from './SheetChrome'

const 渲染表格 = () =>
  render(
    // 与 main.tsx 保持一致地启用 StrictMode，复现真实运行环境的副作用双执行
    <React.StrictMode>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntdApp>
          <SheetEditor />
        </AntdApp>
      </ConfigProvider>
    </React.StrictMode>
  )

describe('表格编辑器容器', () => {
  it('渲染 Ribbon 七标签', () => {
    渲染表格()
    ;['开始', '插入', '页面布局', '公式', '数据', '审阅', '视图'].forEach((名称) => {
      expect(screen.getByRole('tab', { name: 名称 })).toBeInTheDocument()
    })
  })

  it('渲染网格、名称框与工作表标签', () => {
    const { container } = 渲染表格()
    expect(container.querySelector('.wps-sheet')).not.toBeNull()
    expect(screen.getByLabelText('名称框')).toBeInTheDocument()
    expect(screen.getByLabelText('公式栏')).toBeInTheDocument()
    expect(container.querySelectorAll('.wps-sheet-tab')).toHaveLength(1)
    expect(container.querySelector('.wps-editor-status')).not.toBeNull()
  })

  it('默认选中 A1 并在名称框显示', () => {
    渲染表格()
    expect(screen.getByDisplayValue('A1')).toBeInTheDocument()
  })

  it('点击单元格后名称框更新为对应地址', async () => {
    const { container } = 渲染表格()
    const 单元格 = container.querySelector('[data-地址="C3"]') as HTMLElement
    await userEvent.click(单元格)
    expect(screen.getByDisplayValue('C3')).toBeInTheDocument()
  })

  it('点击加粗后单元格样式生效', async () => {
    渲染表格()
    await userEvent.click(screen.getByRole('button', { name: '加粗' }))
    expect(await screen.findByText('已应用加粗')).toBeInTheDocument()
  })

  it('点击未实现的表格命令给出中文提示', async () => {
    渲染表格()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '数据透视表' }))
    expect(await screen.findByText('该功能开发中')).toBeInTheDocument()
  })

  it('新建工作表后标签数量增加', async () => {
    const { container } = 渲染表格()
    await userEvent.click(screen.getByRole('button', { name: '新建工作表' }))
    expect(container.querySelectorAll('.wps-sheet-tab')).toHaveLength(2)
  })

  it('名称框输入无效地址时给出中文提示', async () => {
    渲染表格()
    const 名称框 = screen.getByLabelText('名称框')
    await userEvent.clear(名称框)
    await userEvent.type(名称框, '随便{Enter}')
    expect(await screen.findByText('地址格式无效，请输入形如 A1 的地址')).toBeInTheDocument()
  })

  it('双击单元格进入编辑并提交内容', async () => {
    const { container } = 渲染表格()
    const 单元格 = container.querySelector('[data-地址="A1"]') as HTMLElement
    fireEvent.doubleClick(单元格)
    // 名称框与公式栏也是空值，此处限定查询单元格内的编辑器
    const 输入框 = container.querySelector('.wps-sheet__editor') as HTMLInputElement
    expect(输入框).not.toBeNull()
    await userEvent.type(输入框, '42{Enter}')
    // 公式栏也会显示同一原始值，因此限定查询单元格本身
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('42')
  })

  // 复现并锁定「撤销后重做未恢复状态」的缺陷
  it('加粗后撤销再重做，单元格格式应恢复到加粗状态', async () => {    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏')
    await userEvent.type(公式栏, '5{Enter}')
    await userEvent.click(screen.getByRole('button', { name: '加粗' }))

    const 取字重 = () =>
      (container.querySelector('[data-地址="A1"]') as HTMLElement).style.fontWeight

    expect(取字重()).toBe('600')
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(取字重()).not.toBe('600')
    await userEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(取字重()).toBe('600')
  })

  it('方向键移动选区并在名称框反映', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'ArrowRight' })
    expect(screen.getByDisplayValue('B1')).toBeInTheDocument()
    fireEvent.keyDown(网格, { key: 'ArrowDown' })
    expect(screen.getByDisplayValue('B2')).toBeInTheDocument()
  })

  it('方向键在边界处不越界', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'ArrowUp' })
    fireEvent.keyDown(网格, { key: 'ArrowLeft' })
    expect(screen.getByDisplayValue('A1')).toBeInTheDocument()
  })

  it('回车进入编辑态', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'Enter' })
    expect(container.querySelector('.wps-sheet__editor')).not.toBeNull()
  })

  it('可见字符直接进入编辑并预填该字符', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: '7' })
    const 输入框 = container.querySelector('.wps-sheet__editor') as HTMLInputElement
    expect(输入框).not.toBeNull()
    expect(输入框.value).toBe('7')
  })

  it('Delete 清空选区内容', async () => {
    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏')
    await userEvent.type(公式栏, '9{Enter}')
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('9')
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'Delete' })
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('')
  })
  // ---------- 增强键盘快捷键 ----------

  it('Ctrl+A 全选所有单元格', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'a', ctrlKey: true })
    // 全选后名称框应显示区域地址 A1:Z99（100行26列）
    expect(screen.getByDisplayValue('A1:Z99')).toBeInTheDocument()
  })

  it('Ctrl+Z 撤销操作', async () => {
    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏')
    await userEvent.type(公式栏, '100{Enter}')
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('100')
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'z', ctrlKey: true })
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('')
  })

  it('Ctrl+Y 重做操作', async () => {
    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏')
    await userEvent.type(公式栏, '200{Enter}')
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(网格, { key: 'y', ctrlKey: true })
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('200')
  })

  it('Alt+= 自动求和', async () => {
    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏')
    await userEvent.type(公式栏, '10{Enter}')
    await userEvent.type(公式栏, '20{Enter}')
    await userEvent.type(公式栏, '30{Enter}')
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: '=', altKey: true })
    expect(container.querySelector('[data-地址="A4"]')?.textContent).toBe('60')
  })

  it('Delete 清空多单元格选区', async () => {
    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏')
    await userEvent.type(公式栏, '1{Enter}')
    // 选区 A1:B2
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'ArrowRight' })
    fireEvent.keyDown(网格, { key: 'ArrowDown' })
    fireEvent.keyDown(网格, { key: 'ArrowRight' })
    expect(screen.getByDisplayValue('B2')).toBeInTheDocument()
    // 清空选区
    fireEvent.keyDown(网格, { key: 'Delete' })
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('')
    expect(container.querySelector('[data-地址="B1"]')?.textContent).toBe('')
    expect(container.querySelector('[data-地址="A2"]')?.textContent).toBe('')
    expect(container.querySelector('[data-地址="B2"]')?.textContent).toBe('')
  })
})

describe('工作表标签栏', () => {
  const 列表 = [
    { id: 's1', name: 'Sheet1' },
    { id: 's2', name: 'Sheet2' },
  ]

  it('渲染全部工作表并标记当前项', () => {
    const { container } = render(
      <SheetTabs 工作表列表={列表} 当前标识="s2" on切换={() => {}} on新建={() => {}} on删除={() => {}} />
    )
    expect(screen.getByText('Sheet1')).toBeInTheDocument()
    expect(container.querySelectorAll('.wps-sheet-tab--active')).toHaveLength(1)
  })

  it('点击标签回传标识', async () => {
    const 切换 = vi.fn()
    render(<SheetTabs 工作表列表={列表} 当前标识="s1" on切换={切换} on新建={() => {}} on删除={() => {}} />)
    await userEvent.click(screen.getByText('Sheet2'))
    expect(切换).toHaveBeenCalledWith('s2')
  })

  it('只有一个工作表时不显示删除按钮', () => {
    render(
      <SheetTabs 工作表列表={[列表[0]]} 当前标识="s1" on切换={() => {}} on新建={() => {}} on删除={() => {}} />
    )
    expect(screen.queryByRole('button', { name: /删除工作表/ })).toBeNull()
  })
})

describe('表格状态栏', () => {
  it('展示选区统计', () => {
    render(
      <SheetStatusBar
        统计={{ 计数: 3, 求和: 60, 平均值: 20, 最大: 30, 最小: 10 }}
        缩放={1}
        on缩放变化={() => {}}
      />
    )
    expect(screen.getByText('计数：3')).toBeInTheDocument()
    expect(screen.getByText('求和：60')).toBeInTheDocument()
    expect(screen.getByText('平均值：20')).toBeInTheDocument()
  })

  it('点击放大回传更大的缩放值', async () => {
    const 回调 = vi.fn()
    render(
      <SheetStatusBar
        统计={{ 计数: 0, 求和: 0, 平均值: 0, 最大: 0, 最小: 0 }}
        缩放={1}
        on缩放变化={回调}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: '放大' }))
    expect(回调).toHaveBeenCalledWith(1.1)
  })
})
