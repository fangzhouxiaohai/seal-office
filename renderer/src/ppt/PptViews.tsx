import { useRef, useState, useLayoutEffect } from 'react'
import { SlideObjects, 背景样式, type 图片地址表 } from './render/SlideObjects'
import { 画布宽, 画布高, type 幻灯片, type 演示文稿 } from './deck'
import { 读取有效页脚, 读取页面尺寸, type 背景填充, type 页脚设置, type 页面尺寸 } from './model/themes'
import { 解析页面背景 } from './model/masters'

/** 使用画布原始坐标生成只读缩略预览；默认按文稿页面尺寸渲染。 */
export function SlidePreview({ 幻灯片, 图片地址 = {}, 页面尺寸, 背景, 页脚, 页序号 = 0 }: { 幻灯片: 幻灯片; 图片地址?: 图片地址表; 页面尺寸?: 页面尺寸; 背景?: 背景填充; 页脚?: 页脚设置 | null; 页序号?: number }) {
  const 容器 = useRef<HTMLDivElement>(null)
  const [缩放, set缩放] = useState(1)
  const 尺寸 = 页面尺寸 ?? { 宽: 画布宽, 高: 画布高 }
  useLayoutEffect(() => {
    const 更新 = () => { const 宽 = 容器.current?.getBoundingClientRect().width; if (宽) set缩放(宽 / 尺寸.宽) }
    更新()
    const 观察器 = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(更新)
    if (容器.current) 观察器?.observe(容器.current)
    return () => 观察器?.disconnect()
  }, [尺寸.宽])
  return <div ref={容器} className="wps-ppt-preview" style={背景样式(背景, 图片地址, 幻灯片.背景色)}><div style={{ position: 'absolute', width: 尺寸.宽, height: 尺寸.高, transform: `scale(${缩放})`, transformOrigin: 'top left' }}><SlideObjects 幻灯片={幻灯片} 图片地址={图片地址} 页脚={页脚} 页序号={页序号} 页面尺寸={尺寸} /></div></div>
}

/** 按文稿解析单页背景与页脚，供缩略图与备注页共用。 */
export function 预览页属性(文稿: 演示文稿, 幻灯片: 幻灯片, 序号: number) {
  return { 页面尺寸: 读取页面尺寸(文稿), 背景: 解析页面背景(文稿, 幻灯片), 页脚: 读取有效页脚(文稿, 幻灯片, 序号), 页序号: 序号 }
}
interface 浏览属性 {
  只读?: boolean
  图片地址?: 图片地址表
  文稿: 演示文稿
  on选中: (索引: number) => void
  on重排: (来源索引: number, 目标索引: number) => void
  on打开: () => void
}

export function SlideSorterView({ 文稿, on选中, on重排, on打开, 图片地址, 只读 = false }: 浏览属性) {
  const 拖动来源 = useRef<number | null>(null)
  return <section className="wps-ppt-sorter" aria-label="幻灯片浏览视图">
    <header className="wps-ppt-sorter__header">
      <div>
        <h2>幻灯片浏览</h2>
        <p>共 {文稿.幻灯片列表.length} 张。拖动页面调整顺序，双击打开编辑。</p>
      </div>
    </header>
    <div className="wps-ppt-sorter__grid">
      {文稿.幻灯片列表.map((页, 索引) => <div
        key={页.id}
        className={`wps-ppt-sorter__card${索引 === 文稿.当前索引 ? ' wps-ppt-sorter__card--active' : ''}`}
        draggable={!只读}
        onDragStart={(事件) => {
          拖动来源.current = 索引
          事件.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(事件) => { 事件.preventDefault(); 事件.dataTransfer.dropEffect = 'move' }}
        onDrop={(事件) => {
          事件.preventDefault()
          if (只读) return
          const 来源 = 拖动来源.current
          拖动来源.current = null
          if (来源 !== null) on重排(来源, 索引)
        }}
        onDragEnd={() => { 拖动来源.current = null }}
      >
        <button className="wps-ppt-sorter__select" type="button"
          aria-label={`第 ${索引 + 1} 张：${页.title}`}
          onClick={() => on选中(索引)}
          onDoubleClick={() => { on选中(索引); on打开() }}
        ><SlidePreview 幻灯片={页} 图片地址={图片地址} {...预览页属性(文稿, 页, 索引)} /></button>
        <div className="wps-ppt-sorter__footer">
          <span>第 {索引 + 1} 张{页.隐藏 ? ' 已隐藏' : ''}</span>
          <div className="wps-ppt-sorter__actions">
            <button type="button" disabled={只读 || 索引 === 0} aria-label={`第 ${索引 + 1} 张上移`}
              onClick={(事件) => { 事件.stopPropagation(); on重排(索引, 索引 - 1) }}>上移</button>
            <button type="button" disabled={只读 || 索引 === 文稿.幻灯片列表.length - 1} aria-label={`第 ${索引 + 1} 张下移`}
              onClick={(事件) => { 事件.stopPropagation(); on重排(索引, 索引 + 1) }}>下移</button>
          </div>
        </div>
      </div>)}
    </div>
  </section>
}

interface 备注属性 {
  只读?: boolean
  图片地址?: 图片地址表
  幻灯片: 幻灯片
  索引: number
  文稿?: 演示文稿
  on编辑: (内容: string) => void
}

export function NotesView({ 幻灯片, 索引, on编辑, 图片地址, 文稿, 只读 = false }: 备注属性) {
  const 输入标识 = `wps-ppt-notes-${幻灯片.id}`
  return <section className="wps-ppt-notes" aria-label="备注页视图">
    <header className="wps-ppt-notes__header">
      <h2>第 {索引 + 1} 张幻灯片</h2>
      <span>备注页</span>
    </header>
    <div className="wps-ppt-notes__content">
      <div className="wps-ppt-notes__preview"><SlidePreview 幻灯片={幻灯片} 图片地址={图片地址} {...(文稿 ? 预览页属性(文稿, 幻灯片, 索引) : {})} /></div>
      <div className="wps-ppt-notes__editor">
        <label htmlFor={输入标识}>当前页备注</label>
        <textarea id={输入标识} readOnly={只读} value={幻灯片.备注 ?? ''} onChange={(事件) => { if (!只读) on编辑(事件.target.value) }}
          placeholder="输入放映时的演讲提示" spellCheck={false} />
      </div>
    </div>
  </section>
}
