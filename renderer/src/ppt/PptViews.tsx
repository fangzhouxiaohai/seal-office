import { useRef } from 'react'
import { 画布宽, 画布高, type 幻灯片, type 演示文稿 } from './deck'

/** 使用画布原始坐标生成只读缩略预览。 */
export function SlidePreview({ 幻灯片 }: { 幻灯片: 幻灯片 }) {
  return <div className="wps-ppt-preview" style={{ backgroundColor: 幻灯片.背景色 }}>
    {幻灯片.文本框列表.map((框) => <div
      key={框.id}
      className="wps-ppt-preview__box"
      style={{
        left: `${框.x / 画布宽 * 100}%`,
        top: `${框.y / 画布高 * 100}%`,
        width: `${框.width / 画布宽 * 100}%`,
        height: `${框.height / 画布高 * 100}%`,
        color: 框.颜色,
        fontSize: `${框.字号 / 画布宽 * 100}cqw`,
        fontFamily: 框.字体,
        fontWeight: 框.加粗 ? 600 : 400,
        fontStyle: 框.斜体 ? 'italic' : 'normal',
        textAlign: 框.对齐,
        textDecoration: 框.下划线 ? 'underline' : 'none',
      }}
    >{框.text}</div>)}
  </div>
}

interface 浏览属性 {
  文稿: 演示文稿
  on选中: (索引: number) => void
  on重排: (来源索引: number, 目标索引: number) => void
  on打开: () => void
}

export function SlideSorterView({ 文稿, on选中, on重排, on打开 }: 浏览属性) {
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
        draggable
        onDragStart={(事件) => {
          拖动来源.current = 索引
          事件.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(事件) => { 事件.preventDefault(); 事件.dataTransfer.dropEffect = 'move' }}
        onDrop={(事件) => {
          事件.preventDefault()
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
        ><SlidePreview 幻灯片={页} /></button>
        <div className="wps-ppt-sorter__footer">
          <span>第 {索引 + 1} 张</span>
          <div className="wps-ppt-sorter__actions">
            <button type="button" disabled={索引 === 0} aria-label={`第 ${索引 + 1} 张上移`}
              onClick={(事件) => { 事件.stopPropagation(); on重排(索引, 索引 - 1) }}>上移</button>
            <button type="button" disabled={索引 === 文稿.幻灯片列表.length - 1} aria-label={`第 ${索引 + 1} 张下移`}
              onClick={(事件) => { 事件.stopPropagation(); on重排(索引, 索引 + 1) }}>下移</button>
          </div>
        </div>
      </div>)}
    </div>
  </section>
}

interface 备注属性 {
  幻灯片: 幻灯片
  索引: number
  on编辑: (内容: string) => void
}

export function NotesView({ 幻灯片, 索引, on编辑 }: 备注属性) {
  const 输入标识 = `wps-ppt-notes-${幻灯片.id}`
  return <section className="wps-ppt-notes" aria-label="备注页视图">
    <header className="wps-ppt-notes__header">
      <h2>第 {索引 + 1} 张幻灯片</h2>
      <span>备注页</span>
    </header>
    <div className="wps-ppt-notes__content">
      <div className="wps-ppt-notes__preview"><SlidePreview 幻灯片={幻灯片} /></div>
      <div className="wps-ppt-notes__editor">
        <label htmlFor={输入标识}>当前页备注</label>
        <textarea id={输入标识} value={幻灯片.备注 ?? ''} onChange={(事件) => on编辑(事件.target.value)}
          placeholder="输入放映时的演讲提示" spellCheck={false} />
      </div>
    </div>
  </section>
}
