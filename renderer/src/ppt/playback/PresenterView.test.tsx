import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { 格式化时长, 归一化推送数据, 演讲者视图 } from './PresenterView'
import 演讲者窗口根 from './PresenterView'

const 快照 = {
  页码: 2, 总页数: 5, 标题: '第二页标题', 备注: '讲解要点一',
  下一页标题: '第三页标题', 暂停: false, 阶段: '等待',
  已用毫秒: 65000, 运行中: true,
}

it('格式化时长按分秒显示，超出一小时仍可读', () => {
  expect(格式化时长(0)).toBe('00:00')
  expect(格式化时长(65000)).toBe('01:05')
  expect(格式化时长(3661000)).toBe('61:01')
})

it('演讲者视图展示当前页、下一页、备注、页码与计时，并提供只读控制', () => {
  const 动作 = vi.fn()
  render(<演讲者视图 快照={快照} 显示器名称="扩展显示器 2（1920×1080）" 动作={动作}/>)
  const 面板 = screen.getByRole('region', { name: '演讲者视图' })
  expect(面板).toHaveTextContent('第二页标题')
  expect(面板).toHaveTextContent('讲解要点一')
  expect(面板).toHaveTextContent('第三页标题')
  expect(面板).toHaveTextContent('2 / 5')
  expect(面板).toHaveTextContent('01:05')
  expect(面板.querySelectorAll('input,textarea,[contenteditable="true"]')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  fireEvent.click(screen.getByRole('button', { name: '上一页' }))
  fireEvent.click(screen.getByRole('button', { name: '暂停计时' }))
  fireEvent.click(screen.getByRole('button', { name: '结束放映' }))
  expect(动作.mock.calls.map((项) => 项[0])).toEqual(['下一页', '上一页', '暂停', '结束'])
})

it('暂停时按钮改为继续，末页禁用下一页并说明原因', () => {
  const 动作 = vi.fn()
  render(<演讲者视图 快照={{ ...快照, 暂停: true, 下一页标题: null, 页码: 5 }} 动作={动作}/>)
  expect(screen.getByRole('button', { name: '继续计时' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  expect(screen.getByText('已是最后一页')).toBeInTheDocument()
})

it('单显示器打开演讲者视图时明确提示会遮挡观众画面', () => {
  render(<演讲者视图 快照={快照} 显示器名称="主显示器 1（1920×1080）" 提示="本机只有一台显示器：演讲者窗口与观众画面位于同一台显示器，切到演讲者视图时观众会看到演讲者窗口内容" 动作={() => {}}/>)
  expect(screen.getByText(/同一台显示器/)).toBeInTheDocument()
})

it('尚未收到播放状态时给出等待说明，不显示空白或伪状态', () => {
  render(<演讲者视图 快照={null} 动作={() => {}}/>)
  expect(screen.getByRole('region', { name: '演讲者视图' })).toHaveTextContent('等待放映状态')
})

it('备注字段缺失时按无备注渲染，不因异常字段导致窗口崩溃', () => {
  const 缺字段 = { ...快照, 备注: undefined } as unknown as typeof 快照
  render(<演讲者视图 快照={缺字段} 动作={() => {}}/>)
  expect(screen.getByRole('region', { name: '演讲者视图' })).toHaveTextContent('本页没有备注')
})

it('推送数据既接受完整包装对象也接受旧格式快照', () => {
  expect(归一化推送数据({ 快照, 显示器名称: '主显示器', 提示: '提示' })).toEqual({ 快照, 显示器名称: '主显示器', 提示: '提示' })
  expect(归一化推送数据(快照)).toEqual({ 快照 })
  expect(归一化推送数据(null)).toEqual({ 快照: null })
})

it('演讲者窗口根读取主进程最近状态并订阅后续推送', async () => {
  let 推送: ((数据: unknown) => void) | null = null
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
    presenter: {
      state: vi.fn().mockResolvedValue({ 成功: true, 状态: { 快照, 显示器名称: '扩展显示器 2（1920×1080）' } }),
      control: vi.fn().mockResolvedValue({ 成功: true }),
      onUpdate: (回调: (数据: unknown) => void) => { 推送 = 回调; return () => { 推送 = null } },
    },
  } })
  render(<演讲者窗口根 />)
  const 面板 = await screen.findByRole('region', { name: '演讲者视图' })
  expect(面板).toHaveTextContent('第二页标题')
  expect(面板).toHaveTextContent('讲解要点一')
  expect(面板).toHaveTextContent('01:05')
  expect(面板).toHaveTextContent('扩展显示器 2（1920×1080）')
  // 后续推送必须替换只读内容，而不是继续显示旧快照
  act(() => { 推送?.({ 快照: { ...快照, 页码: 3, 标题: '第三页标题', 备注: '' }, 显示器名称: '主显示器 2528732444（1920×1080）' }) })
  await waitFor(() => expect(面板).toHaveTextContent('第三页标题'))
  expect(面板).toHaveTextContent('本页没有备注')
  expect(面板).toHaveTextContent('3 / 5')
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  await waitFor(() => expect(window.electronAPI!.presenter!.control).toHaveBeenCalledWith(undefined, '下一页'))
  Reflect.deleteProperty(window, 'electronAPI')
})
