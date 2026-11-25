// 我的云盘拖放移动（2.8.0 工作流二）：鼠标移动 6px 起拖；触屏长按 400ms 起拖，拖动时阻止页面滚动。
// 投放目标为文件夹行与路径栏；悬停文件夹 600ms 自动进入；靠近列表上下边缘自动滚动；Esc 或在无效位置松手取消。
// 原“移动”菜单保留，作为键盘与读屏替代路径。
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

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

interface 拖动状态 { ids: string[]; x: number; y: number; 目标: string | null; 原因: string | null }
interface 按下记录 { id: string; x: number; y: number; 触摸: boolean; 计时器?: number; 已开始: boolean }

export function use拖放移动({ 节点表, 已选, 启用, on移动, on进入文件夹, on结束, t }: {
  节点表: 拖放节点[]; 已选: string[]; 启用: boolean
  on移动: (ids: string[], 目标父级: string | null) => void
  on进入文件夹?: (id: string) => void
  on结束?: (已投放: boolean) => void
  t: (中: string, 英: string) => string
}) {
  const [拖动, set拖动] = useState<拖动状态 | null>(null)
  const 按下 = useRef<按下记录 | null>(null), 拖动引用 = useRef<拖动状态 | null>(null), 悬停 = useRef<{ id: string; 计时器: number } | null>(null)
  const 抑制点击 = useRef(false), 滚动 = useRef(0), 参数 = useRef({ 节点表, on移动, on进入文件夹, on结束, t })
  参数.current = { 节点表, on移动, on进入文件夹, on结束, t }
  拖动引用.current = 拖动

  const 命中 = (x: number, y: number) => {
    const 元素 = document.elementFromPoint?.(x, y) as HTMLElement | null
    return 元素?.closest?.('[data-drop-target]')?.getAttribute('data-drop-target') ?? null
  }
  const 清理悬停 = () => { if (悬停.current) { clearTimeout(悬停.current.计时器); 悬停.current = null } }
  const 停止滚动 = () => { cancelAnimationFrame(滚动.current); 滚动.current = 0 }

  const 更新位置 = useCallback((x: number, y: number) => {
    const 当前 = 拖动引用.current
    if (!当前) return
    const { 节点表, t, on进入文件夹 } = 参数.current
    const 目标 = 命中(x, y)
    const 原因 = 目标 ? 投放检查(目标, 当前.ids, 节点表, t) : null
    if (目标 !== 悬停.current?.id) {
      清理悬停()
      // 悬停在可进入的文件夹上 600ms 后进入，继续拖动可投放到其子文件夹
      if (目标 && 目标 !== 根目录 && !原因 && on进入文件夹)
        悬停.current = { id: 目标, 计时器: window.setTimeout(() => { if (拖动引用.current) on进入文件夹(目标) }, 600) }
    }
    // 靠近滚动容器上下边缘时自动滚动
    const 容器 = document.querySelector('.ds-page-shell, .seal-drive') as HTMLElement | null
    const 区域 = 48, 高 = window.innerHeight
    停止滚动()
    if (容器 && (y < 区域 || y > 高 - 区域)) {
      const 步 = () => { 容器.scrollTop += y < 区域 ? -12 : 12; window.scrollBy?.(0, y < 区域 ? -12 : 12); 滚动.current = requestAnimationFrame(步) }
      滚动.current = requestAnimationFrame(步)
    }
    set拖动({ ...当前, x, y, 目标, 原因 })
  }, [])

  const 结束 = useCallback((投放: boolean) => {
    const 当前 = 拖动引用.current
    清理悬停(); 停止滚动()
    if (按下.current?.计时器) clearTimeout(按下.current.计时器)
    按下.current = null
    if (!当前) return
    抑制点击.current = true
    setTimeout(() => { 抑制点击.current = false }, 0)
    set拖动(null)
    const { 节点表, on移动, on结束 } = 参数.current
    const 可投 = 投放 && 当前.目标 && !当前.原因
    if (可投) {
      const ids = 待移动(当前.ids, 当前.目标!, 节点表)
      if (ids.length) on移动(ids, 当前.目标 === 根目录 ? null : 当前.目标)
    }
    on结束?.(Boolean(可投))
  }, [])

  const 开始 = useCallback((id: string, x: number, y: number) => {
    const ids = 拖动对象(id, 已选)
    const 状态 = { ids, x, y, 目标: null, 原因: null }
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
    const 触摸结束 = () => { if (按下.current?.已开始) 结束(true); else { if (按下.current?.计时器) clearTimeout(按下.current.计时器); 按下.current = null } }
    const 按键 = (e: KeyboardEvent) => { if (e.key === 'Escape' && 拖动引用.current) { e.preventDefault(); 结束(false) } }
    const 点击 = (e: MouseEvent) => { if (抑制点击.current) { e.preventDefault(); e.stopPropagation(); 抑制点击.current = false } }
    const 指针取消 = (e: PointerEvent) => { if (e.pointerType !== 'touch') 结束(false) }
    const 失焦 = () => 结束(false)
    window.addEventListener('pointermove', 鼠标移动)
    window.addEventListener('pointerup', 鼠标抬起)
    window.addEventListener('pointercancel', 指针取消)
    window.addEventListener('touchmove', 触摸移动, { passive: false })
    window.addEventListener('touchend', 触摸结束)
    window.addEventListener('touchcancel', 触摸结束)
    window.addEventListener('keydown', 按键, true)
    window.addEventListener('click', 点击, true)
    window.addEventListener('blur', 失焦)
    return () => {
      window.removeEventListener('pointermove', 鼠标移动)
      window.removeEventListener('pointerup', 鼠标抬起)
      window.removeEventListener('pointercancel', 指针取消)
      window.removeEventListener('blur', 失焦)
      window.removeEventListener('touchmove', 触摸移动)
      window.removeEventListener('touchend', 触摸结束)
      window.removeEventListener('touchcancel', 触摸结束)
      window.removeEventListener('keydown', 按键, true)
      window.removeEventListener('click', 点击, true)
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
      记录.计时器 = window.setTimeout(() => { if (按下.current === 记录) { 记录.已开始 = true; 开始(id, 记录.x, 记录.y); 更新位置(记录.x, 记录.y) } }, 400)
      按下.current = 记录
    },
    onContextMenu: (e: React.MouseEvent) => { if (按下.current?.触摸) e.preventDefault() },
  } : {}

  const 状态类 = (id: string) => !拖动 ? '' : 拖动.ids.includes(id) ? ' is-dragging' : 拖动.目标 === id ? (拖动.原因 ? ' is-drop-invalid' : ' is-drop-target') : ''

  const 浮层 = 拖动 ? <div className="seal-drive-drag-preview" role="status" aria-live="polite"
    style={{ left: 拖动.x + 14, top: 拖动.y + 14 } as CSSProperties}>
    <strong>{参数.current.t(`移动 ${拖动.ids.length} 项`, `Move ${拖动.ids.length} item${拖动.ids.length > 1 ? 's' : ''}`)}</strong>
    {拖动.目标 ? <span className={拖动.原因 ? 'is-invalid' : undefined}>{拖动.原因 || 参数.current.t('松开即可移动到此文件夹', 'Release to move here')}</span>
      : <span>{参数.current.t('拖到文件夹或路径栏，按 Esc 取消', 'Drop on a folder or the path bar; Esc to cancel')}</span>}
  </div> : null

  return { 拖动中: Boolean(拖动), 拖动目标: 拖动?.目标 ?? null, 拖动原因: 拖动?.原因 ?? null, 拖动属性, 状态类, 浮层 }
}
