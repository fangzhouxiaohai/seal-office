import { 阅读字号 } from './useMobileReading'

interface Props {
  阅读: boolean
  字号: number
  设置阅读: (开启: boolean) => void
  设置字号: (值: number) => void
  查找: () => void
  目录: () => void
  全屏?: () => void
}

export default function MobileReadingToolbar({ 阅读, 字号, 设置阅读, 设置字号, 查找, 目录, 全屏 }: Props) {
  return <div className="seal-reading-toolbar" role="toolbar" aria-label="文档阅读与编辑" data-reading={阅读 ? 'true' : 'false'}>
    <div className="seal-reading-toolbar__bar" data-reading-row="primary">
      <div className="seal-reading-toolbar__modes" role="group" aria-label="文档模式">
        <button type="button" aria-pressed={阅读} aria-label="阅读" title="阅读" onClick={() => 设置阅读(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22V5.5ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22V5.5Z"/></svg>
          <span>阅读</span>
        </button>
        <button type="button" aria-pressed={!阅读} aria-label="编辑" title="编辑" onClick={() => 设置阅读(false)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4"/></svg>
          <span>编辑</span>
        </button>
      </div>
      {阅读 && <label className="seal-reading-toolbar__size" title="阅读字号">
        <span className="seal-reading-toolbar__size-mark" aria-hidden="true">A</span>
        <select aria-label="阅读字号" value={字号} onChange={event => 设置字号(Number(event.target.value))}>
          {阅读字号.map(值 => <option key={值} value={值}>{值}</option>)}
        </select>
      </label>}
      <span className="seal-reading-toolbar__hint" role="status">{阅读 ? '只读' : '可编辑'}</span>
    </div>
    {阅读 && <div className="seal-reading-toolbar__bar seal-reading-toolbar__actions" data-reading-row="actions" role="group" aria-label="阅读工具">
      <button type="button" title="目录" onClick={目录}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M8 4v4M8 10v4M8 16v4"/></svg>
        <span>目录</span>
      </button>
      <button type="button" title="查找" onClick={查找}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
        <span>查找</span>
      </button>
      {全屏 && <button type="button" title="全屏阅读" onClick={event => { event.currentTarget.focus({ preventScroll: true }); 全屏() }} aria-label="全屏左右翻页阅读">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>
        <span>全屏</span>
      </button>}
    </div>}
  </div>
}
