import React from 'react'
import { App, Modal } from 'antd'
import type { 演示文稿 } from '../deck'
import { 默认备注设置, 默认讲义设置, 校验备注设置, 校验讲义设置, type 备注设置, type 讲义设置 } from '../model/handout'
import './tools.css'

interface Props {
  文稿: 演示文稿
  只读: boolean
  on修改: (文稿: 演示文稿) => void
  打开?: boolean
  on关闭?: () => void
}

/** 讲义母版与备注母版设置：每页张数、页眉页脚、日期与页码。 */
export default function HandoutPanel({ 文稿, 只读, on修改, 打开 = false, on关闭 }: Props) {
  const { modal } = App.useApp()
  const [讲义, set讲义] = React.useState<讲义设置>(() => 文稿.讲义设置 ?? 默认讲义设置)
  const [备注, set备注] = React.useState<备注设置>(() => 文稿.备注设置 ?? 默认备注设置)

  React.useEffect(() => {
    if (!打开) return
    set讲义(文稿.讲义设置 ?? 默认讲义设置)
    set备注(文稿.备注设置 ?? 默认备注设置)
  }, [打开, 文稿.讲义设置, 文稿.备注设置])

  const 提交 = (新讲义: 讲义设置, 新备注: 备注设置) => {
    if (只读) return
    try {
      校验讲义设置(新讲义)
      校验备注设置(新备注)
    } catch (错误) {
      modal.error({ title: '母版设置无效', content: 错误 instanceof Error ? 错误.message : '请检查讲义与备注设置' })
      return
    }
    on修改({ ...文稿, 讲义设置: 新讲义, 备注设置: 新备注 })
  }

  return (
    <Modal title="讲义母版与备注母版" open={打开} onCancel={on关闭} footer={null} width={520} destroyOnHidden>
      <fieldset disabled={只读} className="wps-tools__group">
        <legend>讲义母版</legend>
        <label>每页张数
          <select aria-label="讲义每页张数" value={讲义.每页张数} onChange={事件 => 提交({ ...讲义, 每页张数: Number(事件.target.value) as 讲义设置['每页张数'] }, 备注)}>
            {[1, 2, 3, 4, 6, 9].map(张数 => <option key={张数} value={张数}>{张数} 张</option>)}
          </select>
        </label>
        <label>页眉<input aria-label="讲义页眉" value={讲义.页眉} maxLength={120} onChange={事件 => set讲义({ ...讲义, 页眉: 事件.target.value })} onBlur={() => 提交(讲义, 备注)} /></label>
        <label>页脚<input aria-label="讲义页脚" value={讲义.页脚} maxLength={120} onChange={事件 => set讲义({ ...讲义, 页脚: 事件.target.value })} onBlur={() => 提交(讲义, 备注)} /></label>
        <p className="wps-tools__hint">页眉页脚支持 &lt;页码&gt; 与 &lt;日期&gt; 占位符。</p>
        <label><input type="checkbox" checked={讲义.显示日期} onChange={事件 => 提交({ ...讲义, 显示日期: 事件.target.checked }, 备注)} />显示日期</label>
        <label><input type="checkbox" checked={讲义.显示页码} onChange={事件 => 提交({ ...讲义, 显示页码: 事件.target.checked }, 备注)} />显示页码</label>
      </fieldset>
      <fieldset disabled={只读} className="wps-tools__group">
        <legend>备注母版</legend>
        <label>备注排版
          <select aria-label="备注排版" value={备注.排版} onChange={事件 => 提交(讲义, { ...备注, 排版: 事件.target.value as 备注设置['排版'] })}>
            <option value="幻灯片加备注">幻灯片加备注</option>
            <option value="仅备注">仅备注</option>
          </select>
        </label>
        <label>备注页眉<input aria-label="备注页眉" value={备注.页眉} maxLength={120} onChange={事件 => set备注({ ...备注, 页眉: 事件.target.value })} onBlur={() => 提交(讲义, 备注)} /></label>
        <label>备注页脚<input aria-label="备注页脚" value={备注.页脚} maxLength={120} onChange={事件 => set备注({ ...备注, 页脚: 事件.target.value })} onBlur={() => 提交(讲义, 备注)} /></label>
        <label><input type="checkbox" checked={备注.显示日期} onChange={事件 => 提交(讲义, { ...备注, 显示日期: 事件.target.checked })} />备注显示日期</label>
        <label><input type="checkbox" checked={备注.显示页码} onChange={事件 => 提交(讲义, { ...备注, 显示页码: 事件.target.checked })} />备注显示页码</label>
      </fieldset>
      <p className="wps-tools__hint">设置随演示文稿保存；导出 PDF 时会按这里的张数、页眉页脚、日期与页码排版。</p>
    </Modal>
  )
}
