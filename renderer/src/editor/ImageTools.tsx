import { useEffect, useRef, useState, type RefObject, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { App, Button, Checkbox, Dropdown, InputNumber, Modal } from 'antd'
import { 对齐图片, 图片可用宽度, 正文位置, 移动图片到选区, 调整图片尺寸, 读取图片尺寸, 显示缩放, 屏幕矩形 } from './imageEditing'
import { 图片变换样式, 规范角度, 读取图片变换, type 图片变换 } from '../office/imageTransform'
import { 检查裁剪, 裁剪图片像素, 识别用图片, type 图片裁剪 } from './imagePixels'
import RecognitionPanel from '../ppt/panels/RecognitionPanel'
import './imageTools.css'

interface Props {
  编辑区: RefObject<HTMLDivElement | null>
  文档标识: string
  只读: boolean
  开始修改: () => void
  完成修改: () => void
}
type 手柄 = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'
type 弹窗类型 = '尺寸' | '布局' | '旋转' | '裁剪' | '预览' | null
const 手柄名: Record<手柄, string> = { nw: '左上角', n: '上侧', ne: '右上角', w: '左侧', e: '右侧', sw: '左下角', s: '下侧', se: '右下角' }
const 每厘米像素 = 96 / 2.54
const 空裁剪: 图片裁剪 = { 左: 0, 上: 0, 右: 0, 下: 0 }

export default function ImageTools({ 编辑区, 文档标识, 只读, 开始修改, 完成修改 }: Props) {
  const { modal } = App.useApp()
  const [图片, 设图片] = useState<HTMLImageElement | null>(null)
  const [位置, 设位置] = useState<{ left: number; top: number; width: number; height: number; angle: number; right: number; boundTop: number } | null>(null)
  const [弹窗, 设弹窗] = useState<弹窗类型>(null)
  const [尺寸, 设尺寸] = useState({ 宽: 0, 高: 0 })
  const [锁定比例, 设锁定比例] = useState(true)
  const [角度, 设角度] = useState<number | null>(0)
  const [裁剪, 设裁剪] = useState<图片裁剪>({ ...空裁剪 })
  const [等待位置, 设等待位置] = useState(false)
  const [处理中, 设处理中] = useState(false)
  const [识别图片, 设识别图片] = useState<{ 数据: string; 类型: string; 名称: string } | null>(null)
  const [拖动预览, 设拖动预览] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const 比例 = useRef(1)
  const 拖动图片 = useRef<HTMLImageElement | null>(null)
  const 取消手势 = useRef<(() => void) | null>(null)
  const 回调 = useRef({ 开始修改, 完成修改 })
  const 当前文档 = useRef(文档标识)
  const 当前图片 = useRef(图片)
  const 忽略点击到 = useRef(0)
  const 异步序号 = useRef(0)
  回调.current = { 开始修改, 完成修改 }
  当前文档.current = 文档标识
  当前图片.current = 图片

  const 报错 = (错误: unknown) => modal.error({ title: '图片操作失败', content: 错误 instanceof Error ? 错误.message : '请重新选择图片后重试', okText: '确定' })
  const 检查目标 = (图: HTMLImageElement) => {
    if (只读 || !编辑区.current?.contains(图)) throw new Error('图片已不在可编辑的正文中，请重新选择')
  }
  const 更新位置 = (图 = 当前图片.current) => {
    if (!图 || !编辑区.current?.contains(图)) { 设位置(null); return }
    const 矩形 = 屏幕矩形(图)
    const 容器 = 图.closest<HTMLElement>('.wps-editor-stage,.wps-editor-canvas')
    const 可视区 = 容器 ? 屏幕矩形(容器) : null
    if (矩形.width <= 0 || 矩形.height <= 0 || 可视区 && 可视区.height > 0 && (矩形.bottom < 可视区.top || 矩形.top > 可视区.bottom)) { 设位置(null); return }
    try {
      const 实际 = 读取图片尺寸(图)
      // 用元素未旋转的显示尺寸及边界中心定位，页面缩放也应跟随。
      const 缩放 = 显示缩放(图)
      const 宽 = (图.offsetWidth || 实际.宽) * 缩放, 高 = (图.offsetHeight || 实际.高) * 缩放
      let 转角 = 0
      try { 转角 = 读取图片变换(图.style.transform).旋转 } catch { /* 不支持的变换在修改或保存时提示。 */ }
      设位置({ left: 矩形.left + (矩形.width - 宽) / 2, top: 矩形.top + (矩形.height - 高) / 2, width: 宽, height: 高, angle: 转角, right: 矩形.right, boundTop: 矩形.top })
    } catch { 设位置(null) }
  }

  const 修改 = (操作: (图: HTMLImageElement) => void) => {
    if (!图片 || 处理中) return
    try { 检查目标(图片); 回调.current.开始修改(); 操作(图片); 回调.current.完成修改(); 更新位置() } catch (错误) { 报错(错误) }
  }
  const 修改变换 = (变更: Partial<图片变换>) => {
    if (!图片) return
    try { const 新变换 = { ...读取图片变换(图片.style.transform), ...变更 }; const 样式 = 图片变换样式(新变换); 修改(图 => { 图.style.transform = 样式 }) } catch (错误) { 报错(错误) }
  }

  /** 手柄会随 React 重绘，因此手势由 document 监听，取消、切换文档和失焦均回滚。 */
  const 手势 = (事件: PointerEvent | globalThis.PointerEvent, 图: HTMLImageElement, 移动: (dx: number, dy: number, 事件: globalThis.PointerEvent) => void, 提交?: (事件: globalThis.PointerEvent) => void) => {
    if (事件.button !== 0 || 事件.isPrimary === false || 只读 || 处理中) return
    事件.preventDefault(); 事件.stopPropagation(); 取消手势.current?.()
    检查目标(图)
    const 属性 = ['style', 'width', 'height'].map(名 => [名, 图.getAttribute(名)] as const)
    const 文档 = 当前文档.current, 指针 = 事件.pointerId, x = 事件.clientX, y = 事件.clientY
    let 已移动 = false
    const 同指针 = (e: globalThis.PointerEvent) => 指针 === undefined || e.pointerId === undefined || 指针 === e.pointerId
    const 清理 = () => {
      document.removeEventListener('pointermove', 移动事件); document.removeEventListener('pointerup', 放开)
      document.removeEventListener('pointercancel', 取消); document.removeEventListener('pointerdown', 多指)
      window.removeEventListener('blur', 取消); 取消手势.current = null; 设拖动预览(null)
    }
    const 取消 = () => {
      清理()
      for (const [名, 值] of 属性) { if (值 === null) 图.removeAttribute(名); else 图.setAttribute(名, 值) }
      if (已移动) 忽略点击到.current = Date.now() + 400
      更新位置(图)
    }
    const 多指 = (e: globalThis.PointerEvent) => { if (e.pointerType === 'touch' && !同指针(e)) 取消() }
    const 移动事件 = (e: globalThis.PointerEvent) => {
      if (!同指针(e)) return
      if (当前文档.current !== 文档 || !编辑区.current?.contains(图)) { 取消(); return }
      const dx = e.clientX - x, dy = e.clientY - y
      if (!已移动 && Math.hypot(dx, dy) < 3) return
      e.preventDefault()
      try {
        if (!已移动) { 回调.current.开始修改(); 已移动 = true }
        移动(dx, dy, e)
        更新位置(图)
      } catch (错误) { 取消(); 报错(错误) }
    }
    const 放开 = (e: globalThis.PointerEvent) => {
      if (!同指针(e)) return
      if (!已移动) { 清理(); return }
      if (当前文档.current !== 文档 || !编辑区.current?.contains(图)) { 取消(); return }
      try { 提交?.(e); 清理(); 忽略点击到.current = Date.now() + 400; 回调.current.完成修改(); 更新位置(图) } catch (错误) { 取消(); 报错(错误) }
    }
    取消手势.current = 取消
    document.addEventListener('pointermove', 移动事件, { passive: false }); document.addEventListener('pointerup', 放开)
    document.addEventListener('pointercancel', 取消); document.addEventListener('pointerdown', 多指); window.addEventListener('blur', 取消)
  }

  const 开始移动 = (事件: globalThis.PointerEvent, 图: HTMLImageElement) => {
    设图片(图); 设等待位置(false)
    const 矩形 = 屏幕矩形(图)
    try {
      手势(事件, 图, (dx, dy) => 设拖动预览({ left: 矩形.left + dx, top: 矩形.top + dy, width: 矩形.width, height: 矩形.height }), e => 移动图片到选区(编辑区.current!, 图, 正文位置(编辑区.current!, e.clientX, e.clientY)))
    } catch (错误) { 报错(错误) }
  }
  const 开始缩放 = (事件: PointerEvent<HTMLButtonElement>, 边: 手柄) => {
    if (!图片 || !编辑区.current) return
    try {
      const 初始 = 读取图片尺寸(图片), 最大宽 = 图片可用宽度(编辑区.current, 图片)
      const 图 = 图片, 弧度 = 读取图片变换(图.style.transform).旋转 * Math.PI / 180
      const 缩放率 = (位置?.width ?? 初始.宽) / 初始.宽
      手势(事件, 图, (dx, dy) => {
        const 横向 = (dx * Math.cos(弧度) + dy * Math.sin(弧度)) / 缩放率 * (边.includes('w') ? -1 : 1)
        const 纵向 = (-dx * Math.sin(弧度) + dy * Math.cos(弧度)) / 缩放率 * (边.includes('n') ? -1 : 1)
        if (边.length === 2) {
          const 增量 = Math.abs(横向) >= Math.abs(纵向 * 初始.宽 / 初始.高) ? 横向 : 纵向 * 初始.宽 / 初始.高
          const 宽 = Math.max(1, 初始.宽 / 初始.高, Math.min(最大宽, 32768, 32768 * 初始.宽 / 初始.高, 初始.宽 + 增量))
          调整图片尺寸(图, 宽, 宽 * 初始.高 / 初始.宽)
        } else if (边 === 'w' || 边 === 'e') 调整图片尺寸(图, Math.max(1, Math.min(最大宽, 32768, 初始.宽 + 横向)), 初始.高)
        else 调整图片尺寸(图, 初始.宽, Math.max(1, Math.min(32768, 初始.高 + 纵向)))
      })
    } catch (错误) { 报错(错误) }
  }
  const 开始旋转 = (事件: PointerEvent<HTMLButtonElement>) => {
    if (!图片) return
    try {
      const 图 = 图片, 变换 = 读取图片变换(图.style.transform), 矩形 = 屏幕矩形(图)
      const cx = 矩形.left + 矩形.width / 2, cy = 矩形.top + 矩形.height / 2
      const 起点 = Math.atan2(事件.clientY - cy, 事件.clientX - cx)
      手势(事件, 图, (_dx, _dy, e) => {
        let 转角 = 变换.旋转 + (Math.atan2(e.clientY - cy, e.clientX - cx) - 起点) * 180 / Math.PI
        if (e.shiftKey) 转角 = Math.round(转角 / 15) * 15
        图.style.transform = 图片变换样式({ ...变换, 旋转: 转角 })
      })
    } catch (错误) { 报错(错误) }
  }

  useEffect(() => {
    取消手势.current?.(); 异步序号.current++
    设图片(null); 设弹窗(null); 设识别图片(null); 设处理中(false); 设等待位置(false); 拖动图片.current = null; 忽略点击到.current = 0
  }, [文档标识, 只读])
  useEffect(() => () => { 异步序号.current++; 取消手势.current?.() }, [])
  useEffect(() => {
    const 根 = 编辑区.current
    if (!根 || 只读) return
    const 点击 = (事件: MouseEvent) => {
      if (Date.now() < 忽略点击到.current) { 忽略点击到.current = 0; return }
      const 目标 = 事件.target as HTMLElement
      if (等待位置 && 图片 && 目标.tagName !== 'IMG') {
        try { const 范围 = 正文位置(根, 事件.clientX, 事件.clientY); 修改(图 => 移动图片到选区(根, 图, 范围)); 设等待位置(false) } catch (错误) { 报错(错误) }
        return
      }
      设图片(目标 instanceof HTMLImageElement ? 目标 : null); 设等待位置(false)
    }
    const 指针按下 = (事件: globalThis.PointerEvent) => { if (事件.target instanceof HTMLImageElement) 开始移动(事件, 事件.target) }
    const 拖动开始 = (事件: DragEvent) => {
      if (!(事件.target instanceof HTMLImageElement)) return
      // Pointer Events 已接管时，阻止浏览器再次启动原生拖放。
      if (取消手势.current) { 事件.preventDefault(); return }
      拖动图片.current = 事件.target; 设图片(事件.target)
      事件.dataTransfer?.setData('application/x-seal-image', '正文图片')
      if (事件.dataTransfer) 事件.dataTransfer.effectAllowed = 'move'
    }
    const 拖动经过 = (事件: DragEvent) => { if (拖动图片.current) { 事件.preventDefault(); if (事件.dataTransfer) 事件.dataTransfer.dropEffect = 'move' } }
    const 放下 = (事件: DragEvent) => {
      const 图 = 拖动图片.current
      if (!图) return
      事件.preventDefault()
      try { const 范围 = 正文位置(根, 事件.clientX, 事件.clientY); 检查目标(图); 回调.current.开始修改(); 移动图片到选区(根, 图, 范围); 回调.current.完成修改(); 设图片(图) } catch (错误) { 报错(错误) }
      拖动图片.current = null
    }
    const 拖动结束 = () => { 拖动图片.current = null }
    根.addEventListener('click', 点击); 根.addEventListener('pointerdown', 指针按下); 根.addEventListener('dragstart', 拖动开始)
    根.addEventListener('dragover', 拖动经过); 根.addEventListener('drop', 放下); 根.addEventListener('dragend', 拖动结束)
    return () => { 根.removeEventListener('click', 点击); 根.removeEventListener('pointerdown', 指针按下); 根.removeEventListener('dragstart', 拖动开始); 根.removeEventListener('dragover', 拖动经过); 根.removeEventListener('drop', 放下); 根.removeEventListener('dragend', 拖动结束) }
  }, [文档标识, 只读, 图片, 等待位置, 处理中])
  useEffect(() => {
    if (!图片) { 设位置(null); return }
    const 刷新 = () => { if (!编辑区.current?.contains(图片)) { 取消手势.current?.(); 设图片(null); 设弹窗(null); 设识别图片(null); 设等待位置(false) } else 更新位置(图片) }
    const 观察 = new MutationObserver(刷新)
    if (编辑区.current) 观察.observe(编辑区.current, { childList: true, subtree: true, attributes: true })
    const 大小观察 = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(刷新)
    大小观察?.observe(图片)
    const 外部点击 = (事件: MouseEvent) => {
      const 目标 = 事件.target as HTMLElement
      if (!编辑区.current?.contains(目标) && !目标.closest('.seal-image-tools,.seal-image-menu,.ant-modal-root')) { 取消手势.current?.(); 设图片(null); 设等待位置(false) }
    }
    const 键盘 = (事件: KeyboardEvent) => { if (事件.key === 'Escape') { const 活动 = Boolean(取消手势.current); 取消手势.current?.(); 设等待位置(false); if (!活动 && !弹窗 && !识别图片) 设图片(null) } }
    刷新(); document.addEventListener('scroll', 刷新, true); window.addEventListener('resize', 刷新)
    document.addEventListener('mousedown', 外部点击); document.addEventListener('keydown', 键盘)
    return () => { 观察.disconnect(); 大小观察?.disconnect(); document.removeEventListener('scroll', 刷新, true); window.removeEventListener('resize', 刷新); document.removeEventListener('mousedown', 外部点击); document.removeEventListener('keydown', 键盘) }
  }, [图片, 弹窗, 识别图片])

  const 打开尺寸 = () => { if (!图片) return; try { const 当前 = 读取图片尺寸(图片); 比例.current = 当前.宽 / 当前.高; 设尺寸(当前); 设锁定比例(true); 设弹窗('尺寸') } catch (错误) { 报错(错误) } }
  const 应用尺寸 = () => {
    if (!图片 || !编辑区.current) return
    try {
      if (![尺寸.宽, 尺寸.高].every(值 => Number.isFinite(值) && 值 >= 1 && 值 <= 32768)) throw new Error('请填写有效的图片宽度和高度')
      if (尺寸.宽 > 图片可用宽度(编辑区.current, 图片) + 0.01) throw new Error('图片宽度超过正文或单元格可用宽度，请减小尺寸')
      修改(图 => 调整图片尺寸(图, 尺寸.宽, 尺寸.高)); 设弹窗(null)
    } catch (错误) { 报错(错误) }
  }
  const 修改尺寸 = (字段: '宽' | '高', 厘米: number | null) => {
    if (厘米 === null) { 设尺寸(当前 => ({ ...当前, [字段]: NaN })); return }
    const 像素 = 厘米 * 每厘米像素
    设尺寸(当前 => ({ ...当前, [字段]: 像素, ...(锁定比例 ? 字段 === '宽' ? { 高: 像素 / 比例.current } : { 宽: 像素 * 比例.current } : {}) }))
  }
  const 打开旋转 = () => { if (!图片) return; try { 设角度(读取图片变换(图片.style.transform).旋转); 设弹窗('旋转') } catch (错误) { 报错(错误) } }
  const 应用旋转 = () => { if (角度 === null || !Number.isFinite(角度)) { 报错(new Error('请填写有效的旋转角度')); return }; 修改变换({ 旋转: 规范角度(角度) }); 设弹窗(null) }
  const 应用裁剪 = async () => {
    if (!图片 || 处理中) return
    const 图 = 图片, 文档 = 当前文档.current, 原图 = 图.outerHTML, 序号 = ++异步序号.current
    try {
      检查目标(图); 检查裁剪(裁剪); const 初始 = 读取图片尺寸(图)
      if (!Object.values(裁剪).some(Boolean)) { 设弹窗(null); return }
      设处理中(true)
      const 结果 = await 裁剪图片像素(图.src, 裁剪)
      if (序号 !== 异步序号.current || 文档 !== 当前文档.current) return
      检查目标(图)
      if (原图 !== 图.outerHTML) throw new Error('图片已发生变化，请重新打开裁剪')
      const 宽 = Math.max(1, 初始.宽 * 结果.宽比例), 高 = Math.max(1, 初始.高 * 结果.高比例)
      回调.current.开始修改(); 图.src = 结果.数据; 调整图片尺寸(图, 宽, 高); 回调.current.完成修改(); 更新位置(图); 设弹窗(null)
    } catch (错误) { if (序号 === 异步序号.current) 报错(错误) }
    finally { if (序号 === 异步序号.current) 设处理中(false) }
  }
  const 打开识别 = async () => {
    if (!图片 || 处理中) return
    const 图 = 图片, 文档 = 当前文档.current, 原图 = 图.outerHTML, 序号 = ++异步序号.current
    try {
      检查目标(图); const 变换 = 读取图片变换(图.style.transform); 设处理中(true)
      const 数据 = await 识别用图片(图.src, 变换)
      if (序号 !== 异步序号.current || 文档 !== 当前文档.current) return
      检查目标(图)
      if (原图 !== 图.outerHTML) throw new Error('图片已发生变化，请重新提取文字')
      设识别图片({ ...数据, 名称: 图.alt || '正文图片.png' })
    } catch (错误) { if (序号 === 异步序号.current) 报错(错误) }
    finally { if (序号 === 异步序号.current) 设处理中(false) }
  }
  const 插入识别文字 = (文字: string) => {
    修改(图 => { const 段 = document.createElement('p'); 段.style.whiteSpace = 'pre-wrap'; 段.textContent = 文字; const 原段 = 图.closest('p,h1,h2,h3,h4,h5,h6'); const 锚 = 原段 && 编辑区.current?.contains(原段) ? 原段 : 图; 锚.after(段) })
    设识别图片(null)
  }

  if (只读 || !图片) return null
  let 预览变换 = { 旋转: 0, 水平翻转: false, 垂直翻转: false }
  try { 预览变换 = 读取图片变换(图片.style.transform) } catch { /* 保留原图预览。 */ }
  const 比值 = Math.max(0.01, 图片.width / (图片.height || 1)), 弧度 = 预览变换.旋转 * Math.PI / 180
  const 可用宽 = Math.min(window.innerWidth * 0.8, 880), 可用高 = window.innerHeight * 0.5
  const 预览高 = Math.min(可用宽 / (Math.abs(比值 * Math.cos(弧度)) + Math.abs(Math.sin(弧度))), 可用高 / (Math.abs(比值 * Math.sin(弧度)) + Math.abs(Math.cos(弧度))))
  return createPortal(<>
    {位置 && <div className="seal-image-tools">
      <div className="seal-image-frame" style={{ left: 位置.left, top: 位置.top, width: 位置.width, height: 位置.height, transform: `rotate(${位置.angle}deg)` }}>
        {(Object.keys(手柄名) as 手柄[]).map(边 => <button key={边} type="button" className={`seal-image-handle seal-image-handle--${边}`} aria-label={`从${手柄名[边]}调整图片尺寸`} disabled={处理中} onPointerDown={事件 => 开始缩放(事件, 边)} />)}
        <button type="button" className="seal-image-rotate" aria-label="拖动旋转图片" title="拖动旋转，方向键微调，Shift 按 15° 调整" disabled={处理中} onPointerDown={开始旋转} onKeyDown={事件 => { if (事件.key === 'ArrowLeft' || 事件.key === 'ArrowRight') { 事件.preventDefault(); 修改变换({ 旋转: 预览变换.旋转 + (事件.key === 'ArrowLeft' ? -1 : 1) * (事件.shiftKey ? 15 : 1) }) } }}>↻</button>
      </div>
      {拖动预览 && <div className="seal-image-drag-preview" style={拖动预览}>拖到正文文字的位置</div>}
      <div role="toolbar" aria-label="图片工具" className="seal-image-toolbar" style={{ left: Math.max(8, Math.min(Math.max(位置.right + 12, 位置.left + 位置.width / 2 + Math.sin(位置.angle * Math.PI / 180) * (位置.height / 2 + 26) + 30), window.innerWidth - 156)), top: Math.max((document.querySelector('.wps-titlebar')?.getBoundingClientRect().bottom ?? 0) + 8, Math.min(位置.boundTop, window.innerHeight - 340)) }} onMouseDown={事件 => 事件.preventDefault()}>
        <button type="button" disabled={处理中} onClick={() => 设弹窗('布局')}>布局选项</button>
        <button type="button" disabled={处理中} onClick={() => { 设裁剪({ ...空裁剪 }); 设弹窗('裁剪') }}>图片裁剪</button>
        <button type="button" disabled={处理中} onClick={() => 设弹窗('预览')}>图片预览</button>
        <button type="button" disabled={处理中} onClick={打开旋转}>图片旋转</button>
        <button type="button" disabled={处理中} onClick={打开尺寸}>尺寸</button>
        <button type="button" disabled={处理中} onClick={() => void 打开识别()}>提取文字</button>
        <button type="button" disabled={处理中} aria-pressed={等待位置} onClick={() => 设等待位置(当前 => !当前)}>移动图片</button>
        <Dropdown overlayClassName="seal-image-menu" trigger={['click']} disabled={处理中} menu={{ items: [{ key: 'horizontal', label: '水平翻转' }, { key: 'vertical', label: '垂直翻转' }, { key: 'reset', label: '恢复旋转与翻转' }, { type: 'divider' }, { key: 'delete', label: '删除图片', danger: true }], onClick: ({ key }) => { if (key === 'horizontal') 修改变换({ 水平翻转: !预览变换.水平翻转 }); else if (key === 'vertical') 修改变换({ 垂直翻转: !预览变换.垂直翻转 }); else if (key === 'reset') 修改变换({ 旋转: 0, 水平翻转: false, 垂直翻转: false }); else if (key === 'delete') { 修改(图 => 图.remove()); 设图片(null) } } }}><button type="button">更多功能</button></Dropdown>
        {等待位置 && <span role="status">点击正文中的目标位置</span>}
        {处理中 && <span role="status">正在处理图片…</span>}
      </div>
    </div>}
    <Modal title="布局选项" open={弹窗 === '布局'} footer={null} onCancel={() => 设弹窗(null)} centered width={420}>
      <p>图片随正文排列。下面的对齐操作将图片独立为一段，正文文字保留在前后段落中。</p>
      <div className="seal-image-layout">{(['left', 'center', 'right'] as const).map((对齐, i) => <Button key={对齐} onClick={() => { 修改(图 => 对齐图片(编辑区.current!, 图, 对齐)); 设弹窗(null) }}>{['左对齐', '居中', '右对齐'][i]}</Button>)}</div>
      <p>可以直接拖动图片，或选择“移动图片”后点击正文中的目标位置。</p>
    </Modal>
    <Modal title="图片尺寸" open={弹窗 === '尺寸'} onOk={应用尺寸} onCancel={() => 设弹窗(null)} okText="应用" cancelText="取消" centered width={420}>
      <div className="seal-image-size">
        <label>宽度（厘米）<InputNumber aria-label="图片宽度（厘米）" value={Number.isFinite(尺寸.宽) ? 尺寸.宽 / 每厘米像素 : null} min={1 / 每厘米像素} max={32768 / 每厘米像素} precision={2} step={0.1} onChange={值 => 修改尺寸('宽', 值)} /></label>
        <label>高度（厘米）<InputNumber aria-label="图片高度（厘米）" value={Number.isFinite(尺寸.高) ? 尺寸.高 / 每厘米像素 : null} min={1 / 每厘米像素} max={32768 / 每厘米像素} precision={2} step={0.1} onChange={值 => 修改尺寸('高', 值)} /></label>
        <Checkbox checked={锁定比例} onChange={事件 => { 设锁定比例(事件.target.checked); if (事件.target.checked && 尺寸.宽 > 0 && 尺寸.高 > 0) 比例.current = 尺寸.宽 / 尺寸.高 }}>锁定纵横比</Checkbox>
        <p>四角等比缩放，四边分别调整宽度或高度。顶部圆形手柄可旋转图片。</p>
      </div>
    </Modal>
    <Modal title="图片旋转" open={弹窗 === '旋转'} onOk={应用旋转} onCancel={() => 设弹窗(null)} okText="应用" cancelText="取消" centered width={420}>
      <div className="seal-image-size"><label>旋转角度（度）<InputNumber aria-label="图片旋转角度" value={角度} min={0} max={359.99} precision={2} onChange={设角度} /></label><div className="seal-image-layout"><Button onClick={() => 设角度(规范角度((角度 ?? 0) - 90))}>向左 90°</Button><Button onClick={() => 设角度(规范角度((角度 ?? 0) + 90))}>向右 90°</Button><Button onClick={() => 设角度(0)}>恢复 0°</Button></div></div>
    </Modal>
    <Modal title="图片裁剪" open={弹窗 === '裁剪'} onOk={() => void 应用裁剪()} onCancel={() => { if (!处理中) 设弹窗(null) }} okText="裁剪" cancelText="取消" confirmLoading={处理中} closable={!处理中} maskClosable={!处理中} cancelButtonProps={{ disabled: 处理中 }} centered width={560}>
      <div className="seal-image-crop"><div className="seal-image-crop-source"><img src={图片.src} alt="裁剪原图" /><div className="seal-image-crop-area" style={{ left: `${裁剪.左}%`, top: `${裁剪.上}%`, right: `${裁剪.右}%`, bottom: `${裁剪.下}%` }} /></div></div>
      <div className="seal-image-size">{(Object.keys(空裁剪) as (keyof 图片裁剪)[]).map(边 => <label key={边}>{边}侧裁去（%）<InputNumber aria-label={`裁剪${边}侧百分比`} value={裁剪[边]} min={0} max={99} disabled={处理中} onChange={值 => 设裁剪(当前 => ({ ...当前, [边]: 值 ?? NaN }))} /></label>)}</div>
      <p>保留选框内的原图区域。裁剪会修改图片，可使用文档撤销恢复。</p>
    </Modal>
    <Modal title="图片预览" open={弹窗 === '预览'} footer={null} onCancel={() => 设弹窗(null)} centered width={960}>
      <div className="seal-image-preview" style={{ minHeight: 可用高 }}><img src={图片.src} alt={图片.alt || '正文图片预览'} style={{ width: 预览高 * 比值, height: 预览高, transform: 图片变换样式(预览变换) }} /></div>
    </Modal>
    <Modal title="提取图片文字" open={Boolean(识别图片)} footer={null} onCancel={() => 设识别图片(null)} centered width={620} destroyOnClose>
      {识别图片 && <RecognitionPanel 只读={只读} 导入的图片={识别图片} 插入按钮文本="插入正文" on插入文字={插入识别文字} />}
    </Modal>
  </>, document.body)
}
