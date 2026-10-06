import { useState } from 'react'
import { App } from 'antd'
import type { 演示文稿 } from '../deck'
import './review.css'

interface Props {
  文稿: 演示文稿
  只读: boolean
  on修改: (文稿: 演示文稿) => void
}

/** 文档定稿：可恢复的只读标记，明确不是加密保护。 */
export default function DocumentSecurityPanel({ 文稿, 只读, on修改 }: Props) {
  const { modal } = App.useApp()
  const [标记人, set标记人] = useState('')
  const 定稿 = 文稿.定稿

  const 标记为定稿 = () => {
    if (只读) return
    const 时间 = new Date().toISOString()
    const 规则 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
    if (!规则.test(时间)) {
      modal.error({ title: '无法标记定稿', content: '本机时间格式无效，请检查系统时间后重试' })
      return
    }
    if (标记人.trim().length > 64) {
      modal.error({ title: '无法标记定稿', content: '标记人最多 64 个字符' })
      return
    }
    on修改({ ...文稿, 定稿: { 时间, ...(标记人.trim() ? { 标记人: 标记人.trim() } : {}) } })
  }

  const 继续编辑 = () => {
    const { 定稿: _已定稿, ...其余 } = 文稿
    on修改(其余 as 演示文稿)
  }

  return (
    <aside className="wps-ppt-properties wps-security" aria-label="文档定稿">
      {定稿 ? (
        <>
          <p>本文稿已标记为定稿，处于只读状态。</p>
          <dl className="wps-security__meta">
            <dt>定稿时间</dt><dd>{定稿.时间}</dd>
            {定稿.标记人 ? <><dt>标记人</dt><dd>{定稿.标记人}</dd></> : null}
          </dl>
          <div className="wps-ppt-properties__actions">
            {/* 定稿本身就意味着只读，因此「继续编辑」必须始终可用，否则无法解除定稿。 */}
            <button type="button" onClick={继续编辑}>继续编辑</button>
          </div>
          <p>「继续编辑」会解除定稿标记，操作可以撤销。</p>
        </>
      ) : (
        <fieldset disabled={只读}>
          <legend>文档定稿</legend>
          <label>标记人（可留空）<input aria-label="标记人" value={标记人} onChange={事件 => set标记人(事件.target.value)} maxLength={64} disabled={只读} /></label>
          <div className="wps-ppt-properties__actions">
            <button type="button" onClick={标记为定稿} disabled={只读}>标记为定稿</button>
          </div>
          <p>定稿只是可恢复的只读标记，用于提示审阅已完成。</p>
        </fieldset>
      )}
      <p className="wps-security__notice">本版本不提供文档密码加密，定稿不是加密保护，任何人都可以解除定稿继续编辑。</p>
    </aside>
  )
}
