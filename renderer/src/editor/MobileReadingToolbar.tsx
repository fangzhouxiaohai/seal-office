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
    <div className="seal-reading-toolbar__modes" role="group" aria-label="文档模式">
      <button type="button" aria-pressed={阅读} onClick={() => 设置阅读(true)}>阅读</button>
      <button type="button" aria-pressed={!阅读} onClick={() => 设置阅读(false)}>编辑</button>
    </div>
    {阅读 && <>
      <label className="seal-reading-toolbar__size">字号
        <select aria-label="阅读字号" value={字号} onChange={event => 设置字号(Number(event.target.value))}>
          {阅读字号.map(值 => <option key={值} value={值}>{值}</option>)}
        </select>
      </label>
      <button type="button" onClick={目录}>目录</button>
      <button type="button" onClick={查找}>查找</button>
      {全屏&&<button type="button" onClick={event=>{event.currentTarget.focus({preventScroll:true});全屏()}} aria-label="全屏左右翻页阅读">全屏阅读</button>}
    </>}
    <span className="seal-reading-toolbar__hint" role="status">{阅读 ? '只读浏览' : '编辑模式'}</span>
  </div>
}
