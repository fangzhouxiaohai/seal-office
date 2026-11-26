import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { use拖放移动, 根目录, 待移动, 投放检查, 拖动对象, type 拖放节点 } from './dragMove'

const 节点 = (id: string, parent: string | null, kind = 'file', deleted = 0): 拖放节点 => ({ id, parent, kind, deleted, meta: { name: id } })
const 表 = [节点('A', null, 'folder'), 节点('A1', 'A', 'folder'), 节点('A2', 'A1', 'folder'), 节点('B', null, 'folder'), 节点('f1', null), 节点('f2', 'A'), 节点('t', null, 'file', 1)]

describe('拖放判定', () => {
  it('起点在多选中拖动全部选中项，否则只拖起点', () => {
    expect(拖动对象('f1', ['f1', 'B'])).toEqual(['f1', 'B'])
    expect(拖动对象('f1', ['B'])).toEqual(['f1'])
  })
  it('拒绝移入自身、子孙、普通文件与回收站项', () => {
    expect(投放检查('A', ['A'], 表)).toBe('不能移动到自身或其子文件夹')
    expect(投放检查('A2', ['A'], 表)).toBe('不能移动到自身或其子文件夹')
    expect(投放检查('f1', ['B'], 表)).toBe('只能移动到文件夹')
    expect(投放检查('B', ['t'], 表)).toBe('回收站中的项目不能移动')
    expect(投放检查('A', ['f2'], 表)).toBe('已在此文件夹中')
    expect(投放检查('B', ['f1', 'A1'], 表)).toBeNull()
    expect(投放检查(根目录, ['f2'], 表)).toBeNull()
  })
  it('只提交不在目标中的项', () => {
    expect(待移动(['f1', 'f2'], 'A', 表)).toEqual(['f1'])
    expect(待移动(['f1', 'f2'], 根目录, 表)).toEqual(['f2'])
  })
})

function 夹具({ on移动, on进入文件夹, 已选 = [] as string[] }: { on移动: (ids: string[], p: string | null) => void; on进入文件夹?: (id: string) => void; 已选?: string[] }) {
  const drag = use拖放移动({ 节点表: 表, 已选, 启用: true, on移动, on进入文件夹, t: 中 => 中 })
  return <div>
    {['f1', 'B', 'A'].map(id => <div key={id} data-testid={id} className={'row' + drag.状态类(id)} {...drag.拖动属性(id)} {...(id !== 'f1' ? { 'data-drop-target': id } : {})}>{id}</div>)}
    <button data-testid="root" data-drop-target={根目录}>全部文件</button>
    {drag.浮层}
  </div>
}

describe('拖放交互', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
  const 指向 = (元素: HTMLElement | null) => { (document as any).elementFromPoint = () => 元素 }
  const 移动 = (x: number, y: number) => act(() => { window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX: x, clientY: y }), { pointerType: 'mouse' })) })
  const 按下 = (元素: HTMLElement, x: number, y: number) => act(() => { 元素.dispatchEvent(Object.assign(new MouseEvent('pointerdown', { clientX: x, clientY: y, button: 0, bubbles: true }), { pointerType: 'mouse' })) })
  const 抬起 = () => act(() => { window.dispatchEvent(Object.assign(new MouseEvent('pointerup'), { pointerType: 'mouse' })) })

  it('鼠标拖动超过阈值后显示预览，投放到文件夹调用批量移动', () => {
    const on移动 = vi.fn()
    render(<夹具 on移动={on移动} 已选={['f1']} />)
    按下(screen.getByTestId('f1'), 10, 10)
    指向(screen.getByTestId('B'))
    移动(12, 12)
    expect(screen.queryByRole('status')).toBeNull()
    移动(40, 40)
    expect(screen.getByRole('status').textContent).toContain('移动 1 项')
    expect(screen.getByTestId('B').className).toContain('is-drop-target')
    抬起()
    expect(on移动).toHaveBeenCalledWith(['f1'], 'B')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('无效目标显示原因且松手不移动；Esc 取消', () => {
    const on移动 = vi.fn()
    render(<夹具 on移动={on移动} />)
    按下(screen.getByTestId('A'), 0, 0)
    指向(screen.getByTestId('A'))
    移动(50, 50)
    expect(screen.getByRole('status').textContent).toContain('不能移动到自身或其子文件夹')
    expect(screen.getByTestId('A').className).toContain('is-dragging')
    抬起()
    expect(on移动).not.toHaveBeenCalled()
    按下(screen.getByTestId('f1'), 0, 0)
    指向(screen.getByTestId('root'))
    移动(50, 50)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(screen.queryByRole('status')).toBeNull()
    抬起()
    expect(on移动).not.toHaveBeenCalled()
  })

  it('悬停文件夹 600ms 自动进入', () => {
    vi.useFakeTimers()
    const on进入文件夹 = vi.fn()
    render(<夹具 on移动={vi.fn()} on进入文件夹={on进入文件夹} />)
    按下(screen.getByTestId('f1'), 0, 0)
    指向(screen.getByTestId('A'))
    移动(60, 60)
    act(() => { vi.advanceTimersByTime(599) })
    expect(on进入文件夹).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(2) })
    expect(on进入文件夹).toHaveBeenCalledWith('A')
  })

  it('触屏长按 400ms 起拖，松手投放到路径栏', () => {
    vi.useFakeTimers()
    const on移动 = vi.fn()
    render(<夹具 on移动={on移动} />)
    指向(screen.getByTestId('root'))
    const 行 = screen.getByTestId('B')
    fireEvent.touchStart(行, { touches: [{ clientX: 5, clientY: 5 }] })
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('status').textContent).toContain('已在此文件夹中')
    act(() => { 行.dispatchEvent(new TouchEvent('touchend', { bubbles: true })) })
    expect(on移动).not.toHaveBeenCalled()
    const 文件 = screen.getByTestId('f1')
    指向(screen.getByTestId('B'))
    fireEvent.touchStart(文件, { touches: [{ clientX: 5, clientY: 5 }] })
    act(() => { vi.advanceTimersByTime(400) })
    act(() => { 文件.dispatchEvent(new TouchEvent('touchend', { bubbles: true })) })
    expect(on移动).toHaveBeenCalledWith(['f1'], 'B')
  })

  it('悬停进入文件夹后原行被移出页面，触摸松手仍能完成投放', () => {
    vi.useFakeTimers()
    const on移动 = vi.fn()
    render(<夹具 on移动={on移动} />)
    指向(screen.getByTestId('B'))
    const 行 = screen.getByTestId('f1')
    fireEvent.touchStart(行, { touches: [{ clientX: 5, clientY: 5 }] })
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('status')).toBeTruthy()
    行.remove()
    act(() => { 行.dispatchEvent(new TouchEvent('touchend', { bubbles: true })) })
    expect(on移动).toHaveBeenCalledWith(['f1'], 'B')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
