// 编辑器功能区标签行的云端保存状态徽标：圆角长方形、只显示简短状态，
// 取代原先独占一行、带“立即同步”按钮的提示条。点击徽标可在出错时重试同步。
import Icon from '../components/Icon'
import { use云端状态, 触发云端重试 } from './cloudStatus'

export default function CloudStatusPill() {
  const 状态 = use云端状态()
  if (!状态) return null
  const 可重试 = 状态.可重试
  const 提示 = 状态.详情 ? `${状态.详情}${可重试 ? '\n点击重试同步' : ''}` : (可重试 ? `${状态.文本}，点击重试同步` : 状态.文本)
  return (
    <button
      type="button"
      className={`seal-cloud-pill seal-cloud-pill--${状态.级别}`}
      title={提示}
      aria-label={可重试 ? `云端状态：${状态.文本}，点击重试同步` : `云端状态：${状态.文本}`}
      aria-live="polite"
      onClick={可重试 ? () => 触发云端重试() : undefined}
      tabIndex={可重试 ? 0 : -1}
    >
      <Icon name="cloud" size={14} />
      <span className="seal-cloud-pill__text">{状态.文本}</span>
    </button>
  )
}
