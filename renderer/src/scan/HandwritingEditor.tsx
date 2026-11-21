import { useRef, useState, type PointerEvent } from 'react'
import { Button, Modal } from 'antd'
import type { 点 } from './imageProcessing'
import type { 擦除笔画设置 } from './scanTransforms'

interface 参数 { 预览: string; 宽: number; 高: number; 关闭: () => void; 应用: (笔画: 擦除笔画设置[]) => void }
export default function HandwritingEditor({ 预览, 宽, 高, 关闭, 应用 }: 参数) {
  const [笔画, 设笔画] = useState<擦除笔画设置[]>([])
  const [粗细, 设粗细] = useState(1.5)
  const 在画 = useRef<number | null>(null)
  const 位置 = (事件: PointerEvent<SVGSVGElement>): 点 => {
    const 框 = 事件.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (事件.clientX - 框.left) / 框.width)), y: Math.max(0, Math.min(1, (事件.clientY - 框.top) / 框.height)) }
  }
  return <Modal open title="擦除手写字迹" okText="应用修改" cancelText="取消" onCancel={关闭} okButtonProps={{ disabled: !笔画.length }} onOk={() => 应用(笔画)}>
    <p>在字迹上滑动可擦除黑笔或彩笔，误擦时可撤销。</p>
    <label className="scan-field">笔刷粗细 <input type="range" aria-label="笔刷粗细" min="0.4" max="5" step="0.2" value={粗细} onChange={e => 设粗细(Number(e.target.value))} /></label>
    <Button disabled={!笔画.length} onClick={() => 设笔画(当前 => 当前.slice(0, -1))}>撤销上一笔</Button>
    <svg className="scan-erase-preview" viewBox={`0 0 ${宽} ${高}`} aria-label="在图片上擦除手写字迹"
      onPointerDown={e => { if (在画.current !== null) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); 在画.current = e.pointerId; const 点 = 位置(e); 设笔画(旧 => [...旧, { 半径: 粗细 / 100, 路径: [点] }]) }}
      onPointerMove={e => { if (在画.current !== e.pointerId) return; const 点 = 位置(e); 设笔画(旧 => 旧.map((笔, i) => i === 旧.length - 1 ? { ...笔, 路径: [...笔.路径, 点] } : 笔)) }}
      onPointerUp={() => { 在画.current = null }} onPointerCancel={() => { 在画.current = null }}>
      <image href={预览} width={宽} height={高} />
      {笔画.map((笔, i) => 笔.路径.length === 1
        ? <circle key={i} cx={笔.路径[0].x * 宽} cy={笔.路径[0].y * 高} r={笔.半径 * Math.min(宽, 高)} fill="white" />
        : <polyline key={i} points={笔.路径.map(点 => `${点.x * 宽},${点.y * 高}`).join(' ')} fill="none" stroke="white" strokeWidth={笔.半径 * 2 * Math.min(宽, 高)} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  </Modal>
}
