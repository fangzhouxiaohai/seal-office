// 手动调整四角：自动裁边在复杂背景下可能误判，用户可拖动四个角点兜底。
// 坐标为处理用图（最长边 ≤ 2400、已旋转）的像素坐标，与流水线一致。
import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from 'antd'
import type { 四角, 点 } from './imageProcessing'
import { 整图四角 } from './imageProcessing'

interface Props {
  打开: boolean
  预览: { 地址: string; 宽: number; 高: number; 自动四角: 四角; 已检测: boolean } | null
  当前四角: 四角 | null
  关闭: () => void
  应用: (四角: 四角) => void
}

const 角名称 = ['左上角', '右上角', '右下角', '左下角']

export default function CornerEditor({ 打开, 预览, 当前四角, 关闭, 应用 }: Props) {
  const [角, 设角] = useState<四角 | null>(null)
  const 画面 = useRef<HTMLDivElement>(null)
  useEffect(() => { if (打开 && 预览) 设角((当前四角 ?? 预览.自动四角).map(点 => ({ ...点 })) as 四角) }, [打开, 预览, 当前四角])

  const 开始拖动 = (序号: number) => (事件: React.PointerEvent<HTMLButtonElement>) => {
    if (!预览 || !画面.current) return
    事件.preventDefault()
    const 区域 = 画面.current.getBoundingClientRect(), 按钮 = 事件.currentTarget
    按钮.setPointerCapture(事件.pointerId)
    const 移动 = (移动事件: PointerEvent) => {
      const x = Math.min(预览.宽, Math.max(0, (移动事件.clientX - 区域.left) / 区域.width * 预览.宽))
      const y = Math.min(预览.高, Math.max(0, (移动事件.clientY - 区域.top) / 区域.height * 预览.高))
      设角(旧 => 旧 ? 旧.map((点, 位置) => 位置 === 序号 ? { x, y } : 点) as 四角 : 旧)
    }
    const 结束 = () => { 按钮.removeEventListener('pointermove', 移动); 按钮.removeEventListener('pointerup', 结束); 按钮.removeEventListener('pointercancel', 结束) }
    按钮.addEventListener('pointermove', 移动); 按钮.addEventListener('pointerup', 结束); 按钮.addEventListener('pointercancel', 结束)
  }

  // 键盘微调：方向键每次移动长边的 1%，便于无障碍操作与精细对齐。
  const 键盘 = (序号: number) => (事件: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!预览) return
    const 步长 = Math.max(预览.宽, 预览.高) / 100, 偏移: Record<string, 点> = { ArrowLeft: { x: -步长, y: 0 }, ArrowRight: { x: 步长, y: 0 }, ArrowUp: { x: 0, y: -步长 }, ArrowDown: { x: 0, y: 步长 } }
    const 量 = 偏移[事件.key]; if (!量) return
    事件.preventDefault()
    设角(旧 => 旧 ? 旧.map((点, 位置) => 位置 === 序号 ? { x: Math.min(预览.宽, Math.max(0, 点.x + 量.x)), y: Math.min(预览.高, Math.max(0, 点.y + 量.y)) } : 点) as 四角 : 旧)
  }

  return <Modal open={打开} title="调整四角" width={720} onCancel={关闭} destroyOnClose
    footer={[
      <Button key="whole" onClick={() => 预览 && 设角(整图四角(预览.宽, 预览.高))}>恢复整图</Button>,
      <Button key="auto" disabled={!预览?.已检测} onClick={() => 预览 && 设角(预览.自动四角.map(点 => ({ ...点 })) as 四角)}>自动识别边缘</Button>,
      <Button key="cancel" onClick={关闭}>取消</Button>,
      <Button key="ok" type="primary" disabled={!角} onClick={() => 角 && 应用(角)}>应用四角</Button>,
    ]}>
    <p className="scan-help">{预览?.已检测 ? '已自动识别文档边缘，可拖动四个角点微调。' : '未能自动识别文档边缘，请拖动四个角点对齐纸张。'}</p>
    {预览 && 角 && <div className="scan-corners" ref={画面} style={{ aspectRatio: `${预览.宽} / ${预览.高}` }}>
      <img src={预览.地址} alt="原图" draggable={false} />
      <svg viewBox={`0 0 ${预览.宽} ${预览.高}`} preserveAspectRatio="none" aria-hidden="true">
        <polygon points={角.map(点 => `${点.x},${点.y}`).join(' ')} />
      </svg>
      {角.map((点, 序号) => <button type="button" key={序号} className="scan-corners__handle" aria-label={角名称[序号]}
        style={{ left: `${点.x / 预览.宽 * 100}%`, top: `${点.y / 预览.高 * 100}%` }}
        onPointerDown={开始拖动(序号)} onKeyDown={键盘(序号)} />)}
    </div>}
  </Modal>
}
