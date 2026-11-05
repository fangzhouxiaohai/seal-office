import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RibbonTabs from './RibbonTabs'
import RibbonGroup from './RibbonGroup'
import RibbonButton from './RibbonButton'
import RibbonPanel from './RibbonPanel'
import { RIBBON_TABS } from './tabSpecs'
import { 表格标签 } from '../../sheet/ribbonSpecs'
import { 演示标签 } from '../../ppt/ribbonSpecs'

describe('Ribbon 标签行', () => {
  it('渲染六个标签', () => {
    render(<RibbonTabs activeKey="start" onChange={() => {}} />)
    expect(RIBBON_TABS).toHaveLength(6)
    RIBBON_TABS.forEach((标签) => {
      expect(screen.getByText(标签.label)).toBeInTheDocument()
    })
  })

  it('当前标签带激活类名', () => {
    const { container } = render(<RibbonTabs activeKey="insert" onChange={() => {}} />)
    const 激活项 = container.querySelectorAll('.wps-ribbon-tab--active')
    expect(激活项).toHaveLength(1)
    expect(激活项[0].textContent).toBe('插入')
  })

  it('点击标签回传其键', async () => {
    const 回调 = vi.fn()
    render(<RibbonTabs activeKey="start" onChange={回调} />)
    await userEvent.click(screen.getByText('审阅'))
    expect(回调).toHaveBeenCalledWith('review')
  })
})

describe('Ribbon 功能组', () => {
  it('渲染组名与子元素', () => {
    const { container } = render(
      <RibbonGroup name="字体">
        <span>子元素</span>
      </RibbonGroup>
    )
    expect(screen.getByText('字体')).toBeInTheDocument()
    expect(screen.getByText('子元素')).toBeInTheDocument()
    expect(container.querySelector('.wps-ribbon-group')).not.toBeNull()
  })
})

describe('Ribbon 按钮', () => {
  it('大按钮渲染图标与文字', () => {
    const { container } = render(<RibbonButton icon="home" label="粘贴" />)
    expect(screen.getByText('粘贴')).toBeInTheDocument()
    expect(container.querySelector('.wps-ribbon-button--large')).not.toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('小按钮为紧凑图标按钮并提供无障碍名称', () => {
    const { container } = render(<RibbonButton icon="more" label="更多" size="small" />)
    expect(screen.getByRole('button', { name: '更多' })).toBeInTheDocument()
    expect(container.querySelector('.wps-ribbon-button--small')).not.toBeNull()
  })

  it('激活态带激活类名', () => {
    const { container } = render(<RibbonButton icon="more" label="加粗" active />)
    expect(container.querySelector('.wps-ribbon-button--active')).not.toBeNull()
  })

  it('禁用态不触发点击', async () => {
    const 点击 = vi.fn()
    render(<RibbonButton icon="more" label="不可用" disabled onClick={点击} />)
    await userEvent.click(screen.getByRole('button', { name: '不可用' }))
    expect(点击).not.toHaveBeenCalled()
  })

  it('下拉按钮展示当前值并回传选择', async () => {
    const 选择 = vi.fn()
    render(
      <RibbonButton
        icon="more"
        label="字号"
        currentValue="五号"
        options={['五号', '小四', '四号']}
        onSelect={选择}
      />
    )
    expect(screen.getByText('五号')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /字号/ }))
  })
})

describe('Ribbon 功能区', () => {
  it('渲染当前标签的功能组', () => {
    const { container } = render(<RibbonPanel activeKey="start" />)
    expect(container.querySelectorAll('.wps-ribbon-group').length).toBeGreaterThan(0)
    expect(screen.getByText('剪贴板')).toBeInTheDocument()
    expect(screen.getByText('字体')).toBeInTheDocument()
  })

  it('切换标签后功能组随之变化', () => {
    const { container } = render(<RibbonPanel activeKey="insert" />)
    expect(container.querySelectorAll('.wps-ribbon-group').length).toBeGreaterThan(0)
    expect(screen.queryByText('剪贴板')).toBeNull()
  })

  it.each(RIBBON_TABS)('文字 $label 标签的图标按命令取得稳定色调', (标签) => {
    const { container } = render(<RibbonPanel activeKey={标签.key} />)
    const 按钮 = Array.from(container.querySelectorAll<HTMLButtonElement>('.wps-ribbon-button:not(.seal-font-trigger)'))
    expect(按钮.length).toBeGreaterThan(0)
    for (const 项 of 按钮) {
      expect(项.querySelector('.wps-ribbon-button__icon[data-tone]')).not.toBeNull()
      expect(项.querySelector('.wps-ribbon-button__icon svg')).toHaveAttribute('color', 'currentColor')
      expect(项).toHaveAccessibleName()
    }
  })

  it('同一命令跨标签同色，文件与危险动作按语义区分', () => {
    const 首页 = render(<RibbonPanel activeKey="start" />)
    const 色调 = (名称: string) => 首页.getByRole('button', { name: 名称 }).querySelector('.wps-ribbon-button__icon')?.getAttribute('data-tone')
    expect(色调('打开')).toBe('amber')
    expect(色调('保存')).toBe('blue')
    expect(色调('导出为 PDF')).toBe('purple')
    首页.rerender(<RibbonPanel activeKey="insert" />)
    const 插入脚注色调 = 色调('脚注')
    首页.rerender(<RibbonPanel activeKey="reference" />)
    expect(色调('插入脚注')).toBe(插入脚注色调)
    首页.rerender(<RibbonPanel activeKey="review" />)
    expect(色调('删除批注')).toBe('red')
  })

  it('禁用图标回落中性灰，表格与演示功能区不套用文字配色', () => {
    const { container, rerender } = render(<RibbonPanel activeKey="start" 获取禁用态={(标识) => 标识 === 'file.save'} />)
    expect(screen.getByRole('button', { name: '保存' }).querySelector('.wps-ribbon-button__icon')).not.toHaveAttribute('data-tone')
    expect(screen.getByRole('button', { name: '打开' }).querySelector('.wps-ribbon-button__icon')).toHaveAttribute('data-tone', 'amber')
    for (const 标签 of [表格标签[0], 演示标签[0]]) {
      rerender(<RibbonPanel activeKey={标签.key} tabs={标签 === 表格标签[0] ? 表格标签 : 演示标签} />)
      expect(container.querySelector('.wps-ribbon-button__icon[data-tone]')).toBeNull()
    }
  })
})
