// 我的云盘拖放移动：鼠标移动 6px 起拖；触屏长按 400ms 起拖，拖动时阻止页面滚动。
// 投放目标为文件夹卡片或整行、路径栏，以及悬停进入后的空目录空白区；悬停文件夹 600ms 自动进入。
// 2.8.1：拖动卡片挂到窗口级浮层（不受 .wps-main 容器查询影响），按卡片实际尺寸翻转与夹取；
// 边缘滚动只作用于文件区实际负责纵向滚动的容器，滚动后按最新指针位置重新判定目标。
// Esc、窗口失焦、页面隐藏与触摸被系统中断均走取消路径；原“移动到…”菜单保留，作为键盘与读屏替代路径。
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface 拖放节点 { id: string; parent: string | null; kind: string; deleted: number; meta: { name: string } }

export const 根目录 = '__root__'
const 是文件夹 = (节点: 拖放节点) => 节点.kind === 'folder' || 节点.kind === 'library'

/** 被拖动的对象：起点在多选中则拖动全部选中项，否则只拖起点。 */
export function 拖动对象(起点: string, 已选: string[]): string[] {
  return 已选.includes(起点) ? [...已选] : [起点]
}

/** 目标是否属于任一被拖动项（自身或其子孙）。 */
export function 位于子树(目标: string, 拖动: string[], 节点表: 拖放节点[]): boolean {
  const 上级 = new Map(节点表.map(节点 => [节点.id, 节点.parent]))
  const 已访问 = new Set<string>()
  let 当前: string | null = 目标
  while (当前 && !已访问.has(当前)) {
    if (拖动.includes(当前)) return true
    已访问.add(当前)
    当前 = 上级.get(当前) ?? null
  }
  return false
}

/** 判定投放目标：返回 null 表示可以投放，否则返回不可投放的原因。 */
export function 投放检查(目标: string, 拖动: string[], 节点表: 拖放节点[], t: (中: string, 英: string) => string = 中 => 中): string | null {
  if (!拖动.length) return t('没有要移动的项目', 'Nothing to move')
  const 项目 = 拖动.map(id => 节点表.find(节点 => 节点.id === id))
  if (项目.some(项 => !项 || 项.deleted)) return t('回收站中的项目不能移动', 'Items in the recycle bin cannot be moved')
  const 目标父级 = 目标 === 根目录 ? null : 目标
  if (目标父级) {
    const 目标节点 = 节点表.find(节点 => 节点.id === 目标父级)
    if (!目标节点 || 目标节点.deleted) return t('目标文件夹不可用', 'The destination folder is unavailable')
    if (!是文件夹(目标节点)) return t('只能移动到文件夹', 'Items can only be moved into folders')
    if (位于子树(目标父级, 拖动, 节点表)) return t('不能移动到自身或其子文件夹', 'A folder cannot be moved into itself or its subfolders')
  }
  if (项目.every(项 => (项!.parent ?? null) === 目标父级)) return t('已在此文件夹中', 'Already in this folder')
  return null
}

/** 实际需要提交的项：跳过已在目标中的项。 */
export function 待移动(拖动: string[], 目标: string, 节点表: 拖放节点[]): string[] {
  const 目标父级 = 目标 === 根目录 ? null : 目标
  return 拖动.filter(id => (节点表.find(节点 => 节点.id === id)?.parent ?? null) !== 目标父级)
}

/** 拖动卡片位置：默认在指针右下方 12px；靠近右边翻到指针左边，靠近底边翻到上方，四周至少留 8px。 */
export function 拖动卡片位置(指针: { x: number; y: number }, 卡片: { width: number; height: number }, 视口: { width: number; height: number }, 偏移 = 12, 边距 = 8) {
  let left = 指针.x + 偏移
  if (left + 卡片.width > 视口.width - 边距) left = 指针.x - 偏移 - 卡片.width
  let top = 指针.y + 偏移
  if (top + 卡片.height > 视口.height - 边距) top = 指针.y - 偏移 - 卡片.height
  left = Math.max(边距, Math.min(left, 视口.width - 边距 - 卡片.width))
  top = Math.max(边距, Math.min(top, 视口.height - 边距 - 卡片.height))
  return { left: Math.round(left), top: Math.round(top) }
}

/** 长文件名截断：保留扩展名，在主名末尾以省略号收尾。 */
export function 截断文件名(名称: string, 最多 = 28): string {
  const 字符 = [...名称]
  if (字符.length <= 最多) return 名称
  const 点 = 名称.lastIndexOf('.')
  const 扩展 = 点 > 0 && 名称.length - 点 <= 8 ? [...名称.slice(点)] : []
  const 主名 = 扩展.length ? [...名称.slice(0, 点)] : 字符
  const 保留 = Math.max(1, 最多 - 扩展.length - 1)
  return 主名.slice(0, 保留).join('') + '…' + 扩展.join('')
}

/** 文件区边缘滚动速度：指针进入可见区域上下 40px 内才滚动，越靠近边缘越快；离开可见区域返回 0。 */
export function 边缘滚动速度(y: number, 可见: { top: number; bottom: number }, 范围 = 40, 最大 = 18): number {
  if (可见.bottom - 可见.top < 范围 * 2 || y < 可见.top || y > 可见.bottom) return 0
  const 比例 = (距离: number) => Math.max(2, Math.ceil(最大 * (1 - 距离 / 范围)))
  if (y < 可见.top + 范围) return -比例(y - 可见.top)
  if (y > 可见.bottom - 范围) return 比例(可见.bottom - y)
  return 0
}

/** 文件区实际负责纵向滚动的容器：从文件区向上找第一个可纵向滚动且内容超出可见高度的祖先。 */
export function 纵向滚动容器(元素: HTMLElement | null): HTMLElement | null {
  for (let 当前 = 元素; 当前 && 当前 !== document.body && 当前 !== document.documentElement; 当前 = 当前.parentElement) {
    const 样式 = getComputedStyle(当前).overflowY
    if ((样式 === 'auto' || 样式 === 'scroll' || 样式 === 'overlay') && 当前.scrollHeight > 当前.clientHeight + 1) return 当前
  }
  return null
}

interface 拖动状态 { ids: string[]; x: number; y: number; 目标: string | null; 原因: string | null; 空目录: boolean }
interface 按下记录 { id: string; x: number; y: number; 触摸: boolean; 计时器?: number; 已开始: boolean }

function 拖动卡片({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const 引用 = useRef<HTMLDivElement>(null), 尺寸 = useRef({ width: 220, height: 52 })
  const 视口 = () => ({ width: window.innerWidth, height: window.innerHeight })
  const 初始 = 拖动卡片位置({ x, y }, 尺寸.current, 视口())
  // 渲染后按卡片实际宽高重新计算，避免长名称或英文提示越出窗口
  useLayoutEffect(() => {
    const 卡片 = 引用.current
    if (!卡片) return
    const 矩形 = 卡片.getBoundingClientRect()
    if (矩形.width && 矩形.height) 尺寸.current = { width: 矩形.width, height: 矩形.height }
    const 位置 = 拖动卡片位置({ x, y }, 尺寸.current, 视口())
    卡片.style.left = `${位置.left}px`
    卡片.style.top = `${位置.top}px`
  })
  return createPortal(<div ref={引用} className="seal-drive-drag-preview" role="status" aria-live="polite" style={{ left: 初始.left, top: 初始.top }}>{children}</div>, document.body)
}

export function use拖放移动({ 节点表, 已选, 启用, on移动, on进入文件夹, on结束, t, 图标 }: {
  节点表: 拖放节点[]; 已选: string[]; 启用: boolean
  on移动: (ids: string[], 目标父级: string | null) => void
  on进入文件夹?: (id: string) => void
  on结束?: (已投放: boolean) => void
  t: (中: string, 英: string) => string
  /** 拖动卡片使用首项的文件类型图标 */
  图标?: (id: string) => ReactNode
}) {
  const [拖动, set拖动] = useState<拖动状态 | null>(null)
  const 按下 = useRef<按下记录 | null>(null), 拖动引用 = useRef<拖动状态 | null>(null), 悬停 = useRef<{ id: string; 计时器: number } | null>(null)
  const 抑制点击 = useRef(false), 滚动帧 = useRef(0), 指针 = useRef({ x: 0, y: 0 }), 参数 = useRef({ 节点表, on移动, on进入文件夹, on结束, t })
  /** 绑定到文件区根元素，用于确定横向命中范围与实际滚动容器 */
  const 区域 = useRef<HTMLDivElement>(null)
  // 触摸事件始终派发给按下时的元素；悬停进入文件夹后该行会被移出页面，事件不再冒泡到 window，
  // 因此触摸监听同时挂在按下的元素上（见 拖动属性.onTouchStart）。
  const 触摸处理 = useRef<{ 移动: (e: TouchEvent) => void; 结束: () => void; 取消: () => void } | null>(null)
  参数.current = { 节点表, on移动, on进入文件夹, on结束, t }

  const 命中 = (x: number, y: number) => {
    const 元素 = (document.elementFromPoint?.(x, y) as HTMLElement | null)?.closest?.('[data-drop-target]')
    return { 目标: 元素?.getAttribute('data-drop-target') ?? null, 空目录: 元素?.getAttribute('data-drop-hint') === 'empty' }
  }
  const 清理悬停 = () => { if (悬停.current) { clearTimeout(悬停.current.计时器); 悬停.current = null } }
  const 停止滚动 = () => { if (滚动帧.current) cancelAnimationFrame(滚动帧.current); 滚动帧.current = 0 }

  // 按指针位置重新判定目标；滚动后也调用，避免松手投到滚动前位于指针下的文件夹
  const 判定 = useCallback(() => {
    const 当前 = 拖动引用.current
    if (!当前) return
    const { x, y } = 指针.current
    const { 节点表, t, on进入文件夹 } = 参数.current
    const { 目标, 空目录 } = 命中(x, y)
    const 原因 = 目标 ? 投放检查(目标, 当前.ids, 节点表, t) : null
    if (目标 !== 悬停.current?.id) {
      清理悬停()
      // 悬停在可进入的文件夹上 600ms 后进入，继续拖动可投放到其子文件夹；空目录区已是当前目录，不再进入
      if (目标 && 目标 !== 根目录 && !空目录 && !原因 && on进入文件夹)
        悬停.current = { id: 目标, 计时器: window.setTimeout(() => { if (拖动引用.current) on进入文件夹(目标) }, 600) }
    }
    const 新状态 = { ...当前, x, y, 目标, 原因, 空目录 }
    拖动引用.current = 新状态
    set拖动(新状态)
  }, [])

  const 滚动速度 = () => {
    const 容器 = 纵向滚动容器(区域.current)
    const 文件区 = 区域.current?.getBoundingClientRect()
    if (!容器 || !文件区) return { 容器: null, 速度: 0 }
    const { x, y } = 指针.current
    if (x < 文件区.left || x > 文件区.right) return { 容器, 速度: 0 }
    const 矩形 = 容器.getBoundingClientRect()
    const 可见 = { top: Math.max(矩形.top, 0), bottom: Math.min(矩形.bottom, window.innerHeight) }
    let 速度 = 边缘滚动速度(y, 可见)
    if (速度 < 0 && 容器.scrollTop <= 0) 速度 = 0
    if (速度 > 0 && 容器.scrollTop + 容器.clientHeight >= 容器.scrollHeight - 1) 速度 = 0
    return { 容器, 速度 }
  }
  const 安排滚动 = () => {
    if (滚动帧.current) return
    if (!滚动速度().速度) return
    const 步 = () => {
      滚动帧.current = 0
      if (!拖动引用.current) return
      const { 容器, 速度 } = 滚动速度()
      if (!容器 || !速度) return
      const 之前 = 容器.scrollTop
      容器.scrollTop = 之前 + 速度
      if (容器.scrollTop === 之前) return
      判定()
      滚动帧.current = requestAnimationFrame(步)
    }
    滚动帧.current = requestAnimationFrame(步)
  }

  const 更新位置 = useCallback((x: number, y: number) => {
    指针.current = { x, y }
    判定()
    安排滚动()
  }, [判定])

  const 结束 = useCallback((投放: boolean) => {
    const 当前 = 拖动引用.current
    清理悬停(); 停止滚动()
    if (按下.current?.计时器) clearTimeout(按下.current.计时器)
    按下.current = null
    if (!当前) return
    // 同步清除，保证 pointerup 与随后的 blur 等事件只提交一次
    拖动引用.current = null
    抑制点击.current = true
    setTimeout(() => { 抑制点击.current = false }, 0)
    set拖动(null)
    const { 节点表, on移动, on结束 } = 参数.current
    // 松手时按最终坐标复核目标，避免状态停留在上一帧
    let 目标 = 当前.目标, 原因 = 当前.原因
    if (投放) {
      目标 = 命中(指针.current.x, 指针.current.y).目标
      原因 = 目标 ? 投放检查(目标, 当前.ids, 节点表) : null
    }
    const 可投 = Boolean(投放 && 目标 && !原因)
    if (可投) {
      const ids = 待移动(当前.ids, 目标!, 节点表)
      if (ids.length) on移动(ids, 目标 === 根目录 ? null : 目标)
    }
    on结束?.(可投)
  }, [])

  const 开始 = useCallback((id: string, x: number, y: number) => {
    const ids = 拖动对象(id, 已选)
    const 状态: 拖动状态 = { ids, x, y, 目标: null, 原因: null, 空目录: false }
    指针.current = { x, y }
    拖动引用.current = 状态
    set拖动(状态)
    navigator.vibrate?.(15)
  }, [已选])

  useEffect(() => {
    if (!启用) return
    const 移动 = (x: number, y: number, 事件?: Event) => {
      const 记录 = 按下.current
      if (!记录) return
      if (!记录.已开始) {
        const 距离 = Math.hypot(x - 记录.x, y - 记录.y)
        // 长按前提前滑动视为浏览列表，放弃起拖
        if (记录.触摸) { if (距离 > 8) { clearTimeout(记录.计时器); 按下.current = null } return }
        if (距离 < 6) return
        记录.已开始 = true
        开始(记录.id, x, y)
      }
      事件?.preventDefault()
      更新位置(x, y)
    }
    const 鼠标移动 = (e: PointerEvent) => { if (e.pointerType !== 'touch') 移动(e.clientX, e.clientY, e) }
    const 鼠标抬起 = (e: PointerEvent) => { if (e.pointerType !== 'touch') { if (按下.current?.已开始) 结束(true); else 按下.current = null } }
    const 触摸移动 = (e: TouchEvent) => { const 点 = e.touches[0]; if (点) 移动(点.clientX, 点.clientY, 按下.current?.已开始 ? e : undefined) }
    const 放弃按下 = () => { if (按下.current?.计时器) clearTimeout(按下.current.计时器); 按下.current = null }
    const 触摸结束 = () => { if (按下.current?.已开始) 结束(true); else 放弃按下() }
    // 触摸被系统中断（来电、手势、滚动接管）不提交移动
    const 触摸取消 = () => { if (按下.current?.已开始) 结束(false); else 放弃按下() }
    触摸处理.current = { 移动: 触摸移动, 结束: 触摸结束, 取消: 触摸取消 }
    const 按键 = (e: KeyboardEvent) => { if (e.key === 'Escape' && 拖动引用.current) { e.preventDefault(); e.stopPropagation(); 结束(false) } }
    const 点击 = (e: MouseEvent) => { if (抑制点击.current) { e.preventDefault(); e.stopPropagation(); 抑制点击.current = false } }
    const 指针取消 = (e: PointerEvent) => { if (e.pointerType !== 'touch') 结束(false) }
    const 失焦 = () => 结束(false)
    const 可见性 = () => { if (document.visibilityState === 'hidden') 结束(false) }
    window.addEventListener('pointermove', 鼠标移动)
    window.addEventListener('pointerup', 鼠标抬起)
    window.addEventListener('pointercancel', 指针取消)
    window.addEventListener('touchmove', 触摸移动, { passive: false })
    window.addEventListener('touchend', 触摸结束)
    window.addEventListener('touchcancel', 触摸取消)
    window.addEventListener('keydown', 按键, true)
    window.addEventListener('click', 点击, true)
    window.addEventListener('blur', 失焦)
    document.addEventListener('visibilitychange', 可见性)
    return () => {
      window.removeEventListener('pointermove', 鼠标移动)
      window.removeEventListener('pointerup', 鼠标抬起)
      window.removeEventListener('pointercancel', 指针取消)
      window.removeEventListener('blur', 失焦)
      window.removeEventListener('touchmove', 触摸移动)
      window.removeEventListener('touchend', 触摸结束)
      window.removeEventListener('touchcancel', 触摸取消)
      window.removeEventListener('keydown', 按键, true)
      window.removeEventListener('click', 点击, true)
      document.removeEventListener('visibilitychange', 可见性)
      停止滚动()
    }
  }, [启用, 开始, 更新位置, 结束])

  /** 绑定到可拖动的文件行 */
  const 拖动属性 = (id: string) => 启用 ? {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'touch' || (e.button ?? 0) !== 0) return
      if ((e.target as HTMLElement).closest('.ant-checkbox-wrapper, .seal-drive-file-more')) return
      按下.current = { id, x: e.clientX, y: e.clientY, 触摸: false, 已开始: false }
    },
    onTouchStart: (e: React.TouchEvent) => {
      if ((e.target as HTMLElement).closest('.ant-checkbox-wrapper, .seal-drive-file-more')) return
      const 点 = e.touches[0]
      if (!点 || e.touches.length > 1) return
      const 记录: 按下记录 = { id, x: 点.clientX, y: 点.clientY, 触摸: true, 已开始: false }
      // 挂在触摸目标元素上并阻止继续冒泡：元素仍在页面时只由这里处理，被移出页面后依然能收到后续事件
      const 元素 = e.target as HTMLElement
      const 移动 = (事件: TouchEvent) => { 事件.stopPropagation(); 触摸处理.current?.移动(事件) }
      const 完成 = (事件: TouchEvent) => {
        事件.stopPropagation()
        元素.removeEventListener('touchmove', 移动); 元素.removeEventListener('touchend', 完成); 元素.removeEventListener('touchcancel', 完成)
        if (事件.type === 'touchcancel') 触摸处理.current?.取消(); else 触摸处理.current?.结束()
      }
      元素.addEventListener('touchmove', 移动, { passive: false })
      元素.addEventListener('touchend', 完成)
      元素.addEventListener('touchcancel', 完成)
      记录.计时器 = window.setTimeout(() => { if (按下.current === 记录) { 记录.已开始 = true; 开始(id, 记录.x, 记录.y); 更新位置(记录.x, 记录.y) } }, 400)
      按下.current = 记录
    },
    onContextMenu: (e: React.MouseEvent) => { if (按下.current?.触摸) e.preventDefault() },
  } : {}

  const 状态类 = (id: string) => !拖动 ? '' : 拖动.ids.includes(id) ? ' is-dragging' : 拖动.目标 === id ? (拖动.原因 ? ' is-drop-invalid' : ' is-drop-target') : ''

  const 名称 = (id: string) => id === 根目录 ? t('全部文件', 'All files') : 节点表.find(节点 => 节点.id === id)?.meta.name ?? ''
  const 提示 = !拖动 ? '' : 拖动.目标
    ? 拖动.原因 || (拖动.空目录 ? t(`松开移入『${名称(拖动.目标)}』`, `Release to move into "${名称(拖动.目标)}"`) : t(`移至『${名称(拖动.目标)}』`, `Move to "${名称(拖动.目标)}"`))
    : t('拖到文件夹或路径栏，按 Esc 取消', 'Drop on a folder or the path bar; press Esc to cancel')
  const 浮层 = 拖动 ? <拖动卡片 x={拖动.x} y={拖动.y}>
    <span className="seal-drive-drag-preview__icon" aria-hidden="true">{图标?.(拖动.ids[0])}</span>
    <span className="seal-drive-drag-preview__text">
      <strong translate={拖动.ids.length === 1 ? 'no' : undefined}>{拖动.ids.length === 1 ? 截断文件名(名称(拖动.ids[0])) : t(`共 ${拖动.ids.length} 项`, `${拖动.ids.length} items`)}</strong>
      <span className={拖动.原因 ? 'is-invalid' : 拖动.目标 ? 'is-valid' : undefined}>{提示}</span>
    </span>
  </拖动卡片> : null

  return { 拖动中: Boolean(拖动), 拖动目标: 拖动?.目标 ?? null, 拖动原因: 拖动?.原因 ?? null, 拖动属性, 状态类, 浮层, 区域 }
}
