import { useEffect, useRef, useState, type RefObject, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { App, Checkbox, InputNumber, Modal } from 'antd'
import { 对齐图片, 图片可用宽度, 移动图片到选区, 调整图片尺寸, 读取图片尺寸 } from './imageEditing'
import './imageTools.css'

interface Props {
  编辑区: RefObject<HTMLDivElement | null>
  文档标识: string
  只读: boolean
  开始修改: () => void
  完成修改: () => void
}
const 每厘米像素 = 96 / 2.54
const 四角 = ['nw', 'ne', 'sw', 'se'] as const

export default function ImageTools({ 编辑区, 文档标识, 只读, 开始修改, 完成修改 }: Props) {
  const { modal } = App.useApp()
  const [图片, 设图片] = useState<HTMLImageElement | null>(null)
  const [位置, 设位置] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [尺寸弹窗, 设尺寸弹窗] = useState(false)
  const [尺寸, 设尺寸] = useState({ 宽: 0, 高: 0 })
  const [锁定比例, 设锁定比例] = useState(true)
  const [等待位置, 设等待位置] = useState(false)
  const 比例 = useRef(1)
  const 拖动图片 = useRef<HTMLImageElement | null>(null)
  const 工具条 = useRef<HTMLDivElement | null>(null)
  const 取消缩放 = useRef<(() => void) | null>(null)
  const 回调 = useRef({ 开始修改, 完成修改 })
  回调.current = { 开始修改, 完成修改 }

  const 报错 = (错误: unknown) => modal.error({ title: '图片调整失败', content: 错误 instanceof Error ? 错误.message : '无法调整图片，请重新选择', okText: '确定' })
  const 更新位置 = () => {
    if (!图片 || !编辑区.current?.contains(图片)) { 设位置(null); return }
    const 矩形 = 图片.getBoundingClientRect()
    const 可视区 = 图片.closest('.wps-editor-stage')?.getBoundingClientRect()
    if (矩形.width <= 0 || 矩形.height <= 0 || 可视区 && 可视区.height > 0 && (矩形.bottom < 可视区.top || 矩形.top > 可视区.bottom)) { 设位置(null); return }
    设位置({ left: 矩形.left, top: 矩形.top, width: 矩形.width, height: 矩形.height })
  }

  useEffect(() => {
    取消缩放.current?.()
    设图片(null); 设尺寸弹窗(false); 设等待位置(false); 拖动图片.current = null
  }, [文档标识, 只读])

  useEffect(() => {
    const 根 = 编辑区.current
    if (!根 || 只读) return
    const 点击 = (事件: MouseEvent) => {
      const 目标 = 事件.target as HTMLElement
      if (等待位置 && 图片 && 目标.tagName !== 'IMG') {
        try {
          const 范围 = document.caretRangeFromPoint(事件.clientX, 事件.clientY)
          if (!范围) throw new Error('无法获取目标位置，请点击正文文字附近')
          回调.current.开始修改()
          移动图片到选区(根, 图片, 范围)
          回调.current.完成修改()
          设等待位置(false)
          更新位置()
        } catch (错误) { 报错(错误) }
        return
      }
      设图片(目标.tagName === 'IMG' ? 目标 as HTMLImageElement : null)
      设等待位置(false)
    }
    const 拖动开始 = (事件: DragEvent) => {
      if (!(事件.target instanceof HTMLImageElement)) return
      拖动图片.current = 事件.target
      设图片(事件.target)
      事件.dataTransfer?.setData('application/x-seal-image', '正文图片')
      if (事件.dataTransfer) 事件.dataTransfer.effectAllowed = 'move'
    }
    const 拖动经过 = (事件: DragEvent) => {
      if (!拖动图片.current) return
      事件.preventDefault()
      if (事件.dataTransfer) 事件.dataTransfer.dropEffect = 'move'
    }
    const 放下 = (事件: DragEvent) => {
      const 图 = 拖动图片.current
      if (!图) return
      事件.preventDefault()
      try {
        const 范围 = document.caretRangeFromPoint(事件.clientX, 事件.clientY)
        if (!范围) throw new Error('无法获取目标位置，请拖到正文文字附近')
        回调.current.开始修改()
        移动图片到选区(根, 图, 范围)
        回调.current.完成修改()
        设图片(图)
      } catch (错误) { 报错(错误) }
      拖动图片.current = null
    }
    const 拖动结束 = () => { 拖动图片.current = null }
    根.addEventListener('click', 点击)
    根.addEventListener('dragstart', 拖动开始)
    根.addEventListener('dragover', 拖动经过)
    根.addEventListener('drop', 放下)
    根.addEventListener('dragend', 拖动结束)
    return () => {
      根.removeEventListener('click', 点击); 根.removeEventListener('dragstart', 拖动开始)
      根.removeEventListener('dragover', 拖动经过); 根.removeEventListener('drop', 放下); 根.removeEventListener('dragend', 拖动结束)
    }
  }, [文档标识, 只读, 图片, 等待位置])

  useEffect(() => {
    if (!图片) { 设位置(null); return }
    const 刷新 = () => {
      if (!编辑区.current?.contains(图片)) { 设图片(null); 设尺寸弹窗(false); 设等待位置(false) }
      else 更新位置()
    }
    const 观察 = new MutationObserver(刷新)
    if (编辑区.current) 观察.observe(编辑区.current, { childList: true, subtree: true, attributes: true })
    const 外部点击 = (事件: MouseEvent) => {
      const 目标 = 事件.target as HTMLElement
      if (!编辑区.current?.contains(目标) && !目标.closest('.seal-image-tools,.ant-modal-root')) { 设图片(null); 设等待位置(false) }
    }
    const 键盘 = (事件: KeyboardEvent) => {
      if (事件.key === 'Escape') { 取消缩放.current?.(); 设等待位置(false); if (!尺寸弹窗) 设图片(null) }
    }
    刷新()
    document.addEventListener('scroll', 刷新, true); window.addEventListener('resize', 刷新)
    document.addEventListener('mousedown', 外部点击); document.addEventListener('keydown', 键盘)
    return () => {
      观察.disconnect(); document.removeEventListener('scroll', 刷新, true); window.removeEventListener('resize', 刷新)
      document.removeEventListener('mousedown', 外部点击); document.removeEventListener('keydown', 键盘)
    }
  }, [图片, 尺寸弹窗])

  useEffect(() => () => { 取消缩放.current?.() }, [])

  const 开始缩放 = (事件: PointerEvent<HTMLButtonElement>, 角: typeof 四角[number]) => {
    if (!图片 || !编辑区.current || 只读) return
    事件.preventDefault(); 事件.stopPropagation()
    try {
      const 初始 = 读取图片尺寸(图片)
      const 最大宽 = 图片可用宽度(编辑区.current, 图片)
      const 矩形 = 图片.getBoundingClientRect()
      const 缩放率 = 矩形.width / 初始.宽
      const 初始位置 = { x: 事件.clientX, y: 事件.clientY }
      const 原属性 = ['style', 'width', 'height'].map(名 => [名, 图片.getAttribute(名)] as const)
      const 图 = 图片
      回调.current.开始修改()
      const 移动 = (移动事件: globalThis.PointerEvent) => {
        const 横向 = (移动事件.clientX - 初始位置.x) * (角.endsWith('w') ? -1 : 1) / 缩放率
        const 纵向 = (移动事件.clientY - 初始位置.y) * (角.startsWith('n') ? -1 : 1) / 缩放率
        const 增量 = Math.abs(横向) >= Math.abs(纵向 * 初始.宽 / 初始.高) ? 横向 : 纵向 * 初始.宽 / 初始.高
        const 宽 = Math.max(1, 初始.宽 / 初始.高, Math.min(最大宽, 32768, 32768 * 初始.宽 / 初始.高, 初始.宽 + 增量))
        调整图片尺寸(图, 宽, 宽 * 初始.高 / 初始.宽)
        更新位置()
      }
      const 清理 = () => {
        document.removeEventListener('pointermove', 移动); document.removeEventListener('pointerup', 完成)
        document.removeEventListener('pointercancel', 取消); window.removeEventListener('blur', 取消)
        取消缩放.current = null
      }
      const 完成 = () => { 清理(); if (编辑区.current?.contains(图)) 回调.current.完成修改(); 更新位置() }
      const 取消 = () => {
        清理()
        for (const [名, 值] of 原属性) { if (值 === null) 图.removeAttribute(名); else 图.setAttribute(名, 值) }
        更新位置()
      }
      取消缩放.current = 取消
      document.addEventListener('pointermove', 移动); document.addEventListener('pointerup', 完成)
      document.addEventListener('pointercancel', 取消); window.addEventListener('blur', 取消)
    } catch (错误) { 报错(错误) }
  }

  const 修改对齐 = (对齐: 'left' | 'center' | 'right') => {
    if (!图片 || !编辑区.current || 只读) return
    try { 回调.current.开始修改(); 对齐图片(编辑区.current, 图片, 对齐); 回调.current.完成修改(); 更新位置() } catch (错误) { 报错(错误) }
  }
  const 打开尺寸 = () => {
    if (!图片) return
    try { const 当前 = 读取图片尺寸(图片); 比例.current = 当前.宽 / 当前.高; 设尺寸(当前); 设锁定比例(true); 设尺寸弹窗(true) } catch (错误) { 报错(错误) }
  }
  const 应用尺寸 = () => {
    if (!图片 || !编辑区.current || 只读) return
    try {
      if (尺寸.宽 > 图片可用宽度(编辑区.current, 图片) + 0.01) throw new Error('图片宽度超过当前正文或单元格可用宽度，请减小尺寸')
      if (![尺寸.宽, 尺寸.高].every(值 => Number.isFinite(值) && 值 >= 1 && 值 <= 32768)) throw new Error('请填写有效的图片宽度和高度')
      回调.current.开始修改(); 调整图片尺寸(图片, 尺寸.宽, 尺寸.高); 回调.current.完成修改()
      设尺寸弹窗(false); 更新位置()
    } catch (错误) { 报错(错误) }
  }
  const 修改尺寸 = (字段: '宽' | '高', 厘米: number | null) => {
    if (厘米 === null) { 设尺寸(当前 => ({ ...当前, [字段]: NaN })); return }
    const 像素 = 厘米 * 每厘米像素
    设尺寸(当前 => ({ ...当前, [字段]: 像素, ...(锁定比例 ? 字段 === '宽' ? { 高: 像素 / 比例.current } : { 宽: 像素 * 比例.current } : {}) }))
  }

  if (只读 || !图片) return null
  return createPortal(<>
    {位置 && <div className="seal-image-tools">
      <div className="seal-image-frame" style={位置}>
        {四角.map(角 => <button key={角} type="button" className={`seal-image-handle seal-image-handle--${角}`} aria-label={`从${{ nw: '左上', ne: '右上', sw: '左下', se: '右下' }[角]}角调整图片尺寸`} onPointerDown={事件 => 开始缩放(事件, 角)} />)}
      </div>
      <div ref={工具条} role="toolbar" aria-label="图片工具" className="seal-image-toolbar" style={{ left: Math.max(8, Math.min(位置.left, window.innerWidth - (工具条.current?.offsetWidth ?? 0) - 8)), top: Math.max((document.querySelector('.wps-titlebar')?.getBoundingClientRect().bottom ?? 0) + 8, 位置.top - (工具条.current?.offsetHeight || 36) - 8) }} onMouseDown={事件 => 事件.preventDefault()}>
        <button type="button" onClick={打开尺寸}>尺寸</button>
        <button type="button" onClick={() => 修改对齐('left')}>左对齐</button>
        <button type="button" onClick={() => 修改对齐('center')}>居中</button>
        <button type="button" onClick={() => 修改对齐('right')}>右对齐</button>
        <button type="button" aria-pressed={等待位置} onClick={() => 设等待位置(当前 => !当前)}>移动图片</button>
        {等待位置 && <span role="status">点击正文中的目标位置</span>}
      </div>
    </div>}
    <Modal title="图片尺寸" open={尺寸弹窗} onOk={应用尺寸} onCancel={() => 设尺寸弹窗(false)} okText="应用" cancelText="取消" centered width={420}>
      <div className="seal-image-size">
        <label>宽度（厘米）<InputNumber aria-label="图片宽度（厘米）" value={Number.isFinite(尺寸.宽) ? 尺寸.宽 / 每厘米像素 : null} min={1 / 每厘米像素} max={32768 / 每厘米像素} precision={2} step={0.1} onChange={值 => 修改尺寸('宽', 值)} /></label>
        <label>高度（厘米）<InputNumber aria-label="图片高度（厘米）" value={Number.isFinite(尺寸.高) ? 尺寸.高 / 每厘米像素 : null} min={1 / 每厘米像素} max={32768 / 每厘米像素} precision={2} step={0.1} onChange={值 => 修改尺寸('高', 值)} /></label>
        <Checkbox checked={锁定比例} onChange={事件 => { 设锁定比例(事件.target.checked); if (事件.target.checked && 尺寸.宽 > 0 && 尺寸.高 > 0) 比例.current = 尺寸.宽 / 尺寸.高 }}>锁定纵横比</Checkbox>
        <p>拖动四角可等比缩放。使用对齐按钮时，图片会独立一行；直接拖动图片或选择“移动图片”，可以调整正文中的位置。</p>
      </div>
    </Modal>
  </>, document.body)
}
