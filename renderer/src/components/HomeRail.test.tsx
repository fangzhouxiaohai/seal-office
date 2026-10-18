import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HomeRail from './HomeRail'
import { 桥接 } from '../ipc/bridge'

it('演示助手入口打开可处理演示文稿的内置助手', async () => {
  const 可用 = vi.spyOn(桥接.ai, '可用', 'get').mockReturnValue(true)
  const 打开 = vi.fn()
  const 提示 = vi.fn()
  window.addEventListener('seal-open-assistant', 打开)
  try {
    render(<HomeRail onNotify={提示} onNavigate={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '演示助手' }))
    expect(打开).toHaveBeenCalledOnce()
    expect(提示).not.toHaveBeenCalled()
  } finally {
    window.removeEventListener('seal-open-assistant', 打开)
    可用.mockRestore()
  }
})

it('最左侧团队入口进入真实团队导航并显示选中状态', async () => {
  const navigate = vi.fn(), notify = vi.fn()
  render(<HomeRail activeKey="team" onNotify={notify} onNavigate={navigate} />)
  const button = screen.getByRole('button', { name: '团队空间' })
  await userEvent.click(button)
  expect(navigate).toHaveBeenCalledWith('team')
  expect(button).toHaveClass('wps-homerail__item--active')
  expect(notify).not.toHaveBeenCalled()
})
