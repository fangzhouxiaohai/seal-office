import './loadingState.css'

/** 统一的网络加载状态：品牌渐变环 + 三点律动，颜色随当前皮肤变化，减少动态效果时静止显示。 */
export default function LoadingState({ 文字 = '正在加载…', 紧凑 = false }: { 文字?: string; 紧凑?: boolean }) {
  return <div className={`seal-loading${紧凑 ? ' seal-loading--compact' : ''}`} role="status" aria-live="polite" aria-busy="true">
    <span className="seal-loading__mark" aria-hidden="true"><i /><b><em /><em /><em /></b></span>
    <span className="seal-loading__text">{文字}</span>
  </div>
}
