import type { 目录项 } from './toc'

interface Props {
  标题: 目录项[]
  onClose: () => void
  onSelect: (序号: number) => void
}

const NavigationPane = ({ 标题, onClose, onSelect }: Props) => (
  <aside className="wps-editor-navigation" aria-label="文档导航">
    <div className="wps-editor-navigation__header">
      <strong>文档导航</strong>
      <button type="button" aria-label="关闭导航窗格" onClick={onClose}>关闭</button>
    </div>
    {标题.length === 0
      ? <p className="wps-editor-navigation__empty">暂无标题。为段落应用标题样式后，可在此快速定位。</p>
      : <nav aria-label="文档标题">
          {标题.map((项, 序号) => (
            <button
              type="button"
              className={`wps-editor-navigation__item wps-editor-navigation__item--level-${Math.min(5, 项.级别)}`}
              key={`${项.序号}-${项.文本}`}
              onClick={() => onSelect(序号)}
            >
              {项.文本}
            </button>
          ))}
        </nav>}
  </aside>
)

export default NavigationPane
