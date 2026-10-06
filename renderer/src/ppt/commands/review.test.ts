import { expect, it, vi } from 'vitest'
import { 创建文本框, 创建演示文稿, 更新幻灯片 } from '../deck'
import { 审阅命令 } from './review'

const 上下文 = (文本: string) => {
  const 单页 = 创建演示文稿()
  const 目标 = 更新幻灯片(单页, 单页.幻灯片列表[0].id, { 文本框列表: [{ ...创建文本框(80, 60, 400, 120, 文本, 24), id: '文字' }] })
  return {
    文稿: 目标, 选中框标识: '文字', 更新文稿: vi.fn(), notify: vi.fn(), 撤销: vi.fn(), 重做: vi.fn(),
    打开审阅: vi.fn(), 跳转批注: vi.fn(), 切换批注显示: vi.fn(),
  }
}

const 取命令 = (id: string) => 审阅命令.find(项 => 项.id === id)!

it('排版检查命令打开检查面板并报告真实结果数量', () => {
  const 环境 = 上下文('完成。。')
  取命令('review.spell').run(环境)
  expect(环境.打开审阅).toHaveBeenCalledWith('检查')
  expect(环境.notify.mock.calls[0][0]).toContain('1 项')
  const 干净 = 上下文('正常文本')
  取命令('review.spell').run(干净)
  expect(干净.notify.mock.calls[0][0]).toBe('本机排版检查未发现问题')
})

it('批注命令打开批注面板，导航与显示开关派发到容器', () => {
  const 环境 = 上下文('正常文本')
  取命令('review.comment').run(环境)
  expect(环境.打开审阅).toHaveBeenCalledWith('批注')
  取命令('review.commentPrevious').run(环境)
  取命令('review.commentNext').run(环境)
  expect(环境.跳转批注.mock.calls).toEqual([[-1], [1]])
  取命令('review.commentToggle').run(环境)
  expect(环境.切换批注显示).toHaveBeenCalledTimes(1)
})

it('繁简命令打开转换面板并带上方向，不直接改写文稿', () => {
  const 环境 = 上下文('发现并发展')
  取命令('review.langToSimplified').run(环境)
  取命令('review.langToTraditional').run(环境)
  expect(环境.打开审阅.mock.calls).toEqual([['转换', '简'], ['转换', '繁']])
  expect(环境.更新文稿).not.toHaveBeenCalled()
})
