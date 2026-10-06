import React, { useEffect, useRef, useState } from 'react'
import type { 幻灯片, 演示对象 } from './deck'
import { 文本内容, 文本样式, 对象内容, 对象样式, 读取绘制对象, 背景样式, 页脚图层, type 图片地址表 } from './render/SlideObjects'
import { 吸附位置, 修改对象, 对象可以移动, type 几何修改 } from './model/objectOperations'
import { 默认页面尺寸, type 背景填充, type 页脚设置, type 页面尺寸 } from './model/themes'
interface Props {
  幻灯片: 幻灯片; 选中框标识: string | null; 缩放: number; 编辑框标识: string | null; 编辑值: string; 显示网格线: boolean
  图片地址?: 图片地址表; 选中对象?: string[]; 只读?: boolean; 显示标尺?: boolean; 吸附?: boolean
  参考线?: { 垂直: number[]; 水平: number[] }
  /** 页面实际尺寸与解析后的背景、页脚；缺省时按 16:9 基准画布渲染 */
  页面尺寸?: 页面尺寸
  背景?: 背景填充
  页脚?: 页脚设置 | null
  页序号?: number
  on参考线?: (线: { 垂直: number[]; 水平: number[] }) => void
  on选中对象?: (标识: string[]) => void; on对象提交?: (修改: Record<string, 几何修改>) => void
  on图片输入?: (文件: File[]) => void; on适应缩放?: (比例: number) => void
  on选中框: (标识: string | null) => void; on双击框: (标识: string) => void
  on编辑值变化: (值: string) => void; on提交编辑: () => void
  on拖动框: (标识: string, x: number, y: number) => void
  on文本选择: (标识: string, 起始: number, 结束: number) => void
  onContextMenu?: (x: number, y: number) => void
  /** 批注标记位置；是否显示由上层根据显示开关决定 */
  批注标记?: Array<{ 键: string; 序号: number; x: number; y: number; 标题: string }>
}
export default function SlideCanvas(属性: Props) {
  const { 幻灯片: 页, 缩放, 图片地址 = {}, 选中对象 = [], 只读 = false } = 属性
  const 尺寸 = 属性.页面尺寸 ?? 默认页面尺寸
  const 容器 = useRef<HTMLDivElement>(null)
  const [预览, set预览] = useState<Record<string, 几何修改>>({})
  const 拖动 = useRef<{ x: number; y: number; 对象: 演示对象[]; 尺寸: boolean; 修改: Record<string, 几何修改> } | null>(null)
  const 最新 = useRef(属性); 最新.current = 属性
  const 尺寸引用 = useRef(尺寸); 尺寸引用.current = 尺寸
  useEffect(() => {
    const 更新 = () => { const rect = 容器.current?.getBoundingClientRect(); if (rect?.width && rect.height) 最新.current.on适应缩放?.(Math.min((rect.width - 96) / 尺寸引用.current.宽, (rect.height - 96) / 尺寸引用.current.高)) }
    更新()
    const 观察 = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(更新)
    if (容器.current) 观察?.observe(容器.current)
    return () => 观察?.disconnect()
  }, [])
  useEffect(() => {
    const 移动 = (事件: MouseEvent) => {
      const 状态 = 拖动.current, 当前 = 最新.current
      if (!状态) return
      if (当前.只读 || 状态.对象.some(项 => !当前.幻灯片.文本框列表.some(框 => 框.id === 项.id) && !对象可以移动(当前.幻灯片,项.id))) { 拖动.current = null; set预览({}); return }
      let dx = (事件.clientX - 状态.x) / 当前.缩放, dy = (事件.clientY - 状态.y) / 当前.缩放
      if (Math.abs(dx) + Math.abs(dy) < 2 && !Object.keys(状态.修改).length) return
      const 修改: Record<string, 几何修改> = {}
      if (当前.吸附 && !状态.尺寸 && 状态.对象.length) {
        const 已选 = new Set(状态.对象.map(项 => 项.id))
        const 展开 = (id: string) => { for (const 子 of 当前.幻灯片.对象列表?.find(项 => 项.id === id)?.子对象标识 ?? []) { 已选.add(子); 展开(子) } }
        状态.对象.forEach(项 => 展开(项.id))
        const 其他 = [...当前.幻灯片.对象列表 ?? [], ...当前.幻灯片.文本框列表].filter(项 => !已选.has(项.id))
        const 左 = Math.min(...状态.对象.map(项 => 项.x)), 上 = Math.min(...状态.对象.map(项 => 项.y)), 宽 = Math.max(...状态.对象.map(项 => 项.x + 项.width)) - 左, 高 = Math.max(...状态.对象.map(项 => 项.y + 项.height)) - 上
        const 位置 = 吸附位置(左 + dx, 上 + dy, 宽, 高, 当前.缩放, [0,尺寸引用.current.宽/2,尺寸引用.current.宽,...当前.参考线?.垂直 ?? [],...其他.flatMap(项 => [项.x,项.x+项.width/2,项.x+项.width])], [0,尺寸引用.current.高/2,尺寸引用.current.高,...当前.参考线?.水平 ?? [],...其他.flatMap(项 => [项.y,项.y+项.height/2,项.y+项.height])])
        dx = 位置.x - 左; dy = 位置.y - 上
      }
      for (const 对象 of 状态.对象) {
        const 弧度 = (对象.旋转 ?? 0) * Math.PI / 180
        修改[对象.id] = 状态.尺寸 ? { width: Math.max(8, 对象.width + dx * Math.cos(弧度) + dy * Math.sin(弧度)), height: Math.max(8, 对象.height - dx * Math.sin(弧度) + dy * Math.cos(弧度)) } : { x: 对象.x + dx, y: 对象.y + dy }
      }
      状态.修改 = 修改; set预览(修改)
    }
    const 结束 = () => {
      const 状态 = 拖动.current; 拖动.current = null; set预览({})
      if (!状态 || !Object.keys(状态.修改).length || 最新.current.只读) return
      if (状态.对象.some(项 => !最新.current.幻灯片.文本框列表.some(框 => 框.id === 项.id) && !对象可以移动(最新.current.幻灯片,项.id))) return
      const 文本 = 状态.对象.filter(项 => 最新.current.幻灯片.文本框列表.some(框 => 框.id === 项.id))
      for (const 框 of 文本) { const 改 = 状态.修改[框.id]; 最新.current.on拖动框(框.id, 改.x ?? 框.x, 改.y ?? 框.y) }
      const 修改 = Object.fromEntries(Object.entries(状态.修改).filter(([id]) => !文本.some(框 => 框.id === id)))
      if (Object.keys(修改).length) 最新.current.on对象提交?.(修改)
    }
    window.addEventListener('mousemove', 移动); window.addEventListener('mouseup', 结束)
    return () => { window.removeEventListener('mousemove', 移动); window.removeEventListener('mouseup', 结束) }
  }, [])
  const 开始 = (事件: React.MouseEvent, 对象: 演示对象, 尺寸 = false) => {
    事件.stopPropagation()
    if (只读 || 事件.button !== 0) return
    const 文本 = 页.文本框列表.some(框 => 框.id === 对象.id)
    let 标识 = 选中对象
    if (文本) { 属性.on选中框(对象.id); 属性.on选中对象?.([]) }
    else {
      属性.on选中框(null)
      标识 = 事件.ctrlKey || 事件.shiftKey ? (选中对象.includes(对象.id) ? 选中对象.filter(id => id !== 对象.id) : [...选中对象, 对象.id]) : 选中对象.includes(对象.id) ? 选中对象 : [对象.id]
      属性.on选中对象?.(标识)
    }
    if (对象.锁定 || (!文本 && 标识.some(id => !对象可以移动(页,id))) || 属性.编辑框标识 === 对象.id) return
    事件.preventDefault()
    拖动.current = { x: 事件.clientX, y: 事件.clientY, 对象: 文本 || 尺寸 ? [对象] : (页.对象列表 ?? []).filter(项 => 标识.includes(项.id) && 对象可以移动(页, 项.id)), 尺寸, 修改: {} }
  }
  const 父表 = new Map((页.对象列表 ?? []).flatMap(项 => (项.子对象标识 ?? []).map(id => [id, 项.id] as const)))
  const 顶层 = (id: string): string => 父表.has(id) ? 顶层(父表.get(id)!) : id
  const 预览页 = Object.entries(预览).reduce((当前, [id, 值]) => 修改对象(当前, [id], 值), 页)
  const 绘制列表 = [...读取绘制对象(预览页.对象列表 ?? []), ...预览页.对象列表?.filter(项 => 项.类型 === '组合') ?? []]
  return <div ref={容器} tabIndex={0} className="wps-ppt-stage" onDragOver={事件 => { if (!只读) 事件.preventDefault() }} onDrop={事件 => { if (只读) return; 事件.preventDefault(); 属性.on图片输入?.(Array.from(事件.dataTransfer.files)) }}>
    <div className="wps-ppt-canvas-space" style={{ width: 尺寸.宽 * 缩放, height: 尺寸.高 * 缩放 }}>
      {属性.显示标尺 && <><div className="wps-ppt-ruler wps-ppt-ruler--horizontal" onDoubleClick={事件 => { const rect = 事件.currentTarget.getBoundingClientRect(); 属性.on参考线?.({ 垂直: [...属性.参考线?.垂直 ?? [], (事件.clientX - rect.left) / 缩放], 水平: 属性.参考线?.水平 ?? [] }) }}>{Array.from({ length: Math.max(1, Math.round(尺寸.宽 / 100)) + 1 }, (_,i) => <span key={i} style={{ left: `${i * 100 / 尺寸.宽 * 100}%` }}>{i * 100}</span>)}</div><div className="wps-ppt-ruler wps-ppt-ruler--vertical" onDoubleClick={事件 => { const rect = 事件.currentTarget.getBoundingClientRect(); 属性.on参考线?.({ 水平: [...属性.参考线?.水平 ?? [], (事件.clientY - rect.top) / 缩放], 垂直: 属性.参考线?.垂直 ?? [] }) }}>{Array.from({ length: Math.max(1, Math.round(尺寸.高 / 100)) + 1 }, (_,i) => <span key={i} style={{ top: `${i * 100 / 尺寸.高 * 100}%` }}>{i * 100}</span>)}</div></>}
      <div className={`wps-ppt-canvas${属性.显示网格线 ? ' wps-ppt-canvas--gridlines' : ''}`} style={{ width: 尺寸.宽, height: 尺寸.高, ...背景样式(属性.背景, 图片地址, 页.背景色), transform: `scale(${缩放})`, transformOrigin: 'top left' }} onClick={() => { 属性.on选中框(null); 属性.on选中对象?.([]) }} onContextMenu={事件 => { 事件.preventDefault(); 属性.onContextMenu?.(事件.clientX, 事件.clientY) }}>{/* 页脚图层与正文共用同一渲染规则 */}
        <页脚图层 页脚={属性.页脚} 页序号={属性.页序号} 尺寸={尺寸} />
        {页.文本框列表.map(框 => <div key={框.id} data-框标识={框.id} className={`wps-ppt-box${框.id === 属性.选中框标识 ? ' wps-ppt-box--selected' : ''}`} style={{ ...文本样式(框), ...预览[框.id] }} onClick={事件 => 事件.stopPropagation()} onMouseDown={事件 => 开始(事件, { ...框, 类型: '图形' })} onDoubleClick={事件 => { 事件.stopPropagation(); if (!只读) 属性.on双击框(框.id) }}>
          {框.id === 属性.编辑框标识 && !只读 ? <textarea className="wps-ppt-box__editor" value={属性.编辑值} autoFocus style={{ textAlign: 框.对齐 }} onMouseDown={事件 => 事件.stopPropagation()} onSelect={事件 => 属性.on文本选择(框.id, 事件.currentTarget.selectionStart, 事件.currentTarget.selectionEnd)} onChange={事件 => 属性.on编辑值变化(事件.target.value)} onBlur={属性.on提交编辑} /> : <文本内容 框={框} />}
        </div>)}
        {绘制列表.map(对象 => {
          if (!['图片','组合','图形','表格','图表'].includes(对象.类型)) return null
          const 根 = 页.对象列表!.find(项 => 项.id === 顶层(对象.id))!, 选中 = 选中对象.includes(对象.id), 几何 = { ...对象, ...预览[对象.id] }
          if (对象.类型 === '组合' && !选中) return null
          return <div key={对象.id} data-对象标识={对象.id} className={`wps-ppt-image${选中 ? ' wps-ppt-image--selected' : ''}`} style={{ ...对象样式(几何), pointerEvents: 对象.类型 === '组合' ? 'none' : 'auto' }} onClick={事件 => 事件.stopPropagation()} onMouseDown={事件 => 开始(事件, 选中对象.includes(对象.id) ? 对象 : 根)}>
            {对象.类型 !== '组合' && <对象内容 对象={几何} 图片地址={图片地址} />}
            {选中 && !只读 && 对象可以移动(页, 对象.id) && <button type="button" className="wps-ppt-resize" aria-label="调整对象尺寸" onMouseDown={事件 => 开始(事件, 对象, true)} />}
          </div>
        })}
        {属性.参考线?.垂直.map((x,i) => <div key={`竖${i}`} className="wps-ppt-guide wps-ppt-guide--vertical" style={{ left: x }} />)}
        {属性.参考线?.水平.map((y,i) => <div key={`横${i}`} className="wps-ppt-guide wps-ppt-guide--horizontal" style={{ top: y }} />)}
        {属性.批注标记?.map(标记 => <div key={标记.键} data-批注标记={标记.键} className="wps-ppt-comment-marker" title={标记.标题} aria-label={`批注 ${标记.序号}：${标记.标题}`} style={{ left: 标记.x, top: 标记.y }}>{标记.序号}</div>)}
      </div>
    </div>
  </div>
}
