// 图标按钮（2.8.1 第六节）：真实按钮，可 Tab 到达、回车或空格执行一次；读屏名称与悬停/聚焦提示写明动作和对象，
// 例如“重命名项目：我的脑图”。桌面点击区不小于 32×32、触屏不小于 44×44；危险动作悬停或聚焦时使用危险色，
// 最终后果由确认框写明。名称由调用方按当前界面语言生成，用户命名原样插入。
import { useRef, useState } from 'react'
import { Button, Tooltip } from 'antd'
import Icon from './Icon'

interface Props {
  icon: string
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  /** 忙碌时禁止重复提交 */
  loading?: boolean
  /** 禁用时的原因：提示改为说明原因，读屏通过描述读出 */
  disabledReason?: string
  className?: string
}

export default function IconAction({ icon, label, onClick, danger, disabled, loading, className, disabledReason }: Props) {
  // 执行后立即收起提示，避免提示停留在随后打开的确认框上
  // 悬停延时计时可能在点击后才到点，因此点击后直到指针移开或焦点离开都不再弹出
  const [提示, set提示] = useState(false), 已执行 = useRef(false)
  return <Tooltip title={disabled && disabledReason ? disabledReason : label} trigger={['hover', 'focus']} mouseEnterDelay={0.4} destroyOnHidden open={提示} onOpenChange={next => { if (!(next && 已执行.current)) set提示(next) }}>
    <Button type="text" className={['seal-icon-action', danger ? 'seal-icon-action--danger' : '', className].filter(Boolean).join(' ')}
      aria-label={label} title={disabled && disabledReason ? disabledReason : undefined} data-ui-language-ignore="true" disabled={disabled} loading={loading}
      icon={<Icon name={icon} size={17} variant="outline" />} onPointerLeave={() => { 已执行.current = false }} onBlur={() => { 已执行.current = false }}
      onClick={event => { event.stopPropagation(); 已执行.current = true; set提示(false); onClick() }} />
  </Tooltip>
}
