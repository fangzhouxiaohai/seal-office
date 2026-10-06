import { useState } from 'react'
import type { 演示对象 } from '../deck'
import { 读取附件风险, 格式化字节数, 更新附件显示名称 } from '../model/attachments'

interface Props {
  对象?: 演示对象
  只读: boolean
  on选择文件: (文件: File) => void
  on导出: (对象: 演示对象) => void
  on替换: (对象: 演示对象) => void
}

/** 附件面板：选择文件嵌入、查看真实字节信息、导出原附件；本机不执行附件内容。 */
export default function AttachmentPanel({ 对象, 只读, on选择文件, on导出, on替换 }: Props) {
  const 选中附件 = 对象?.类型 === '附件' ? 对象 : undefined
  const [显示名称, set显示名称] = useState(选中附件?.附件?.显示名称 ?? '')
  const 风险 = 选中附件?.附件 ? 读取附件风险(选中附件.附件.文件名) : null
  return (
    <aside className="wps-ppt-properties" aria-label="附件设置">
      <fieldset disabled={只读}><legend>附件</legend>
        <label className="wps-ppt-attachment-picker">选择并嵌入文件
          <input type="file" aria-label="选择附件文件" onChange={e => { const 文件 = e.target.files?.[0]; if (文件) on选择文件(文件); e.target.value = '' }}/>
        </label>
        {选中附件?.附件 ? (
          <>
            <div className="wps-ppt-element__grid">
              <label>显示名称<input aria-label="附件显示名称" value={显示名称 || 选中附件.附件.显示名称} onChange={e => set显示名称(e.target.value)}/></label>
            </div>
            <p>原文件名：{选中附件.附件.文件名}<br/>字节数：{格式化字节数(选中附件.附件.字节数)}（保存为 ppt/embeddings 原生部件）</p>
            {风险 && <p className={风险.宏风险 ? 'wps-ppt-attachment-warning' : undefined}>{风险.说明}</p>}
            <div className="wps-ppt-properties__actions">
              <button type="button" onClick={() => on替换(更新附件显示名称(选中附件, 显示名称 || 选中附件.附件!.显示名称))}>保存显示名称</button>
              <button type="button" onClick={() => on导出(选中附件)}>导出原附件</button>
            </div>
          </>
        ) : <p>在画布选择附件对象后可以重命名或导出；插入时会校验真实字节，不会执行附件内容。</p>}
      </fieldset>
    </aside>
  )
}
