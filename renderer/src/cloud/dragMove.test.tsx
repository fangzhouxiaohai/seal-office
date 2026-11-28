import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { use拖放移动, 根目录, 待移动, 投放检查, 拖动对象, 拖动卡片位置, 截断文件名, 边缘滚动速度, type 拖放节点 } from './dragMove'

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
  it('拖动卡片距指针 12px，靠右翻到左边、靠底翻到上方，四周至少留 8px', () => {
    const 视口 = { width: 1280, height: 720 }, 卡片 = { width: 210, height: 51 }
    expect(拖动卡片位置({ x: 600, y: 300 }, 卡片, 视口)).toEqual({ left: 612, top: 312 })
    expect(拖动卡片位置({ x: 1200, y: 300 }, 卡片, 视口)).toEqual({ left: 1200 - 12 - 210, top: 312 })
    expect(拖动卡片位置({ x: 600, y: 700 }, 卡片, 视口)).toEqual({ left: 612, top: 700 - 12 - 51 })
    const 角落 = 拖动卡片位置({ x: 1279, y: 719 }, 卡片, 视口)
    expect(角落.left + 卡片.width).toBeLessThanOrEqual(1280 - 8)
    expect(角落.top + 卡片.height).toBeLessThanOrEqual(720 - 8)
    const 左上 = 拖动卡片位置({ x: 2, y: 2 }, { width: 400, height: 51 }, { width: 320, height: 200 })
    expect(左上).toEqual({ left: 8, top: 14 })
  })
  it('长文件名截断并保留扩展名', () => {
    expect(截断文件名('短名称.docx')).toBe('短名称.docx')
    const 结果 = 截断文件名('二〇二六年第四季度全部门预算汇总与执行情况说明.xlsx', 20)
    expect(结果.endsWith('….xlsx')).toBe(true)
    expect([...结果].length).toBe(20)
    expect(截断文件名('没有扩展名但是非常非常非常非常长的标题文字', 10)).toBe('没有扩展名但是非常…')
  })
  it('边缘滚动只在可见区域上下 40px 内触发，越靠边越快，离开区域即停', () => {
    const 可见 = { top: 100, bottom: 600 }
    expect(边缘滚动速度(300, 可见)).toBe(0)
    expect(边缘滚动速度(590, 可见)).toBeGreaterThan(0)
    expect(边缘滚动速度(599, 可见)).toBeGreaterThan(边缘滚动速度(570, 可见))
    expect(边缘滚动速度(105, 可见)).toBeLessThan(0)
    expect(边缘滚动速度(50, 可见)).toBe(0)
    expect(边缘滚动速度(650, 可见)).toBe(0)
    expect(边缘滚动速度(110, { top: 100, bottom: 150 })).toBe(0)
  })
})

function 夹具({ on移动, on进入文件夹, on结束, 已选 = [] as string[] }: { on移动: (ids: string[], p: string | null) => void; on进入文件夹?: (id: string) => void; on结束?: (投放: boolean) => void; 已选?: string[] }) {
  const drag = use拖放移动({ 节点表: 表, 已选, 启用: true, on移动, on进入文件夹, on结束, t: 中 => 中, 图标: id => <i data-testid={`icon-${id}`} /> })
  return <div data-testid="scroller" style={{ overflowY: 'auto' }}>
    <div ref={drag.区域} data-testid="region">
      {['f1', 'B', 'A'].map(id => <div key={id} data-testid={id} className={'row' + drag.状态类(id)} {...drag.拖动属性(id)} {...(id !== 'f1' ? { 'data-drop-target': id } : {})}>{id}</div>)}
      <div data-testid="empty" data-drop-target="A1" data-drop-hint="empty" />
    </div>
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
    expect(screen.getByRole('status').textContent).toContain('f1')
    expect(screen.getByRole('status').textContent).toContain('移至『B』')
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

  it('卡片挂到窗口级浮层，多选只显示一张卡片与计数', () => {
    const { container } = render(<夹具 on移动={vi.fn()} 已选={['f1', 'B']} />)
    按下(screen.getByTestId('f1'), 0, 0)
    指向(null)
    移动(30, 30)
    const 卡片 = screen.getByRole('status')
    expect(container.contains(卡片)).toBe(false)
    expect(卡片.parentElement).toBe(document.body)
    expect(卡片.textContent).toContain('共 2 项')
    expect(screen.getAllByTestId('icon-f1')).toHaveLength(1)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
  })

  it('松手后紧接失焦只提交一次', () => {
    const on移动 = vi.fn()
    render(<夹具 on移动={on移动} />)
    按下(screen.getByTestId('f1'), 0, 0)
    指向(screen.getByTestId('B'))
    移动(40, 40)
    act(() => {
      window.dispatchEvent(Object.assign(new MouseEvent('pointerup'), { pointerType: 'mouse' }))
      window.dispatchEvent(new Event('blur'))
    })
    expect(on移动).toHaveBeenCalledTimes(1)
  })

  it('取消时即使指针停在有效文件夹上也不移动', () => {
    const on移动 = vi.fn(), on结束 = vi.fn()
    render(<夹具 on移动={on移动} on结束={on结束} />)
    按下(screen.getByTestId('f1'), 0, 0)
    指向(screen.getByTestId('B'))
    移动(40, 40)
    act(() => { window.dispatchEvent(new Event('blur')) })
    抬起()
    expect(on移动).not.toHaveBeenCalled()
    expect(on结束).toHaveBeenCalledWith(false)
  })

  it('触摸被系统中断走取消路径，不提交移动', () => {
    vi.useFakeTimers()
    const on移动 = vi.fn()
    render(<夹具 on移动={on移动} />)
    指向(screen.getByTestId('B'))
    const 行 = screen.getByTestId('f1')
    fireEvent.touchStart(行, { touches: [{ clientX: 5, clientY: 5 }] })
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('status')).toBeTruthy()
    act(() => { 行.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true })) })
    expect(on移动).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('悬停进入的空目录空白区可接收投放，且不再触发进入', () => {
    vi.useFakeTimers()
    const on移动 = vi.fn(), on进入文件夹 = vi.fn()
    render(<夹具 on移动={on移动} on进入文件夹={on进入文件夹} />)
    按下(screen.getByTestId('f1'), 0, 0)
    指向(screen.getByTestId('empty'))
    移动(40, 40)
    expect(screen.getByRole('status').textContent).toContain('松开移入『A1』')
    act(() => { vi.advanceTimersByTime(800) })
    expect(on进入文件夹).not.toHaveBeenCalled()
    抬起()
    expect(on移动).toHaveBeenCalledWith(['f1'], 'A1')
  })

  it('靠近文件区下沿只滚动实际滚动容器，滚动后按最新位置重新判定目标', () => {
    const 帧: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(回调 => { 帧.push(回调); return 帧.length })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const 窗口滚动 = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const on移动 = vi.fn()
    render(<夹具 on移动={on移动} />)
    const 滚动层 = screen.getByTestId('scroller'), 区域 = screen.getByTestId('region')
    Object.defineProperty(滚动层, 'scrollHeight', { configurable: true, value: 2000 })
    Object.defineProperty(滚动层, 'clientHeight', { configurable: true, value: 500 })
    滚动层.getBoundingClientRect = () => ({ left: 0, right: 800, top: 0, bottom: 500, width: 800, height: 500, x: 0, y: 0, toJSON: () => ({}) })
    区域.getBoundingClientRect = () => ({ left: 100, right: 700, top: 0, bottom: 2000, width: 600, height: 2000, x: 100, y: 0, toJSON: () => ({}) })
    按下(screen.getByTestId('f1'), 300, 300)
    指向(screen.getByTestId('B'))
    移动(300, 490)
    expect(帧.length).toBe(1)
    // 滚动后指针下方换成文件夹 A，松手应投到 A 而不是滚动前的 B
    指向(screen.getByTestId('A'))
    act(() => { 帧.shift()!(0) })
    expect(滚动层.scrollTop).toBeGreaterThan(0)
    expect(screen.getByTestId('A').className).toContain('is-drop-target')
    expect(窗口滚动).not.toHaveBeenCalled()
    // 指针移出文件区横向范围：下一帧不再滚动，也不再排帧
    expect(帧.length).toBe(1)
    移动(750, 490)
    const 停前 = 滚动层.scrollTop
    act(() => { 帧.shift()!(0) })
    expect(滚动层.scrollTop).toBe(停前)
    expect(帧.length).toBe(0)
    移动(300, 300)
    抬起()
    expect(on移动).toHaveBeenCalledWith(['f1'], 'A')
  })
})
