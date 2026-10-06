import { useState } from 'react'
import { App } from 'antd'
import type { 幻灯片, 演示文稿 } from '../deck'
import {
  添加批注, 回复批注, 修改批注内容, 设置批注解决, 删除批注, 读取页面批注, 批注导航, 批注对象失效, 批注统计,
  默认批注作者, type 批注位置,
} from '../model/comments'

interface Props {
  文稿: 演示文稿
  页: 幻灯片
  只读: boolean
  /** 当前画布选中的对象标识；用于把批注挂到对象上 */
  选中?: string | null
  显示批注: boolean
  on显示变化: (显示: boolean) => void
  on修改: (文稿: 演示文稿) => void
  跳转?: (位置: 批注位置) => void
  /** 在审阅工作区内切换到排版检查或繁简转换，避免只能通过功能区返回 */
  on切换区域?: (区域: '检查' | '转换') => void
}

/** 批注面板：完整线程、作者、时间、回复、解决与删除，与逐页备注相互独立。 */
export default function CommentsPanel({ 文稿, 页, 只读, 选中, 显示批注, on显示变化, on修改, 跳转, on切换区域 }: Props) {
  const { message, modal } = App.useApp()
  const [作者, set作者] = useState(默认批注作者)
  const [内容, set内容] = useState('')
  const [回复草稿, set回复草稿] = useState<Record<string, string>>({})
  const [编辑草稿, set编辑草稿] = useState<Record<string, string>>({})
  const 本页批注 = 读取页面批注(文稿, 页.id)
  const 统计 = 批注统计(文稿)
  const 执行 = (操作: () => 演示文稿) => {
    if (只读) return
    try { on修改(操作()) } catch (错误) { modal.error({ title: '批注操作失败', content: 错误 instanceof Error ? 错误.message : '批注数据无效' }) }
  }
  const 提交新批注 = () => {
    try {
      const 结果 = 添加批注(文稿, { 页标识: 页.id, 对象标识: 选中 ?? undefined, 内容, 作者 })
      on修改(结果.文稿)
      set内容('')
    } catch (错误) { modal.error({ title: '批注添加失败', content: 错误 instanceof Error ? 错误.message : '批注数据无效' }) }
  }
  const 导航 = (方向: -1 | 1) => {
    const 位置 = 批注导航(文稿, 页.id, 方向)
    if (!位置) { message.info(方向 === 1 ? '已经是最后一条批注' : '已经是第一条批注'); return }
    if (位置.页标识 === 页.id) message.info('该批注在当前页')
    跳转?.(位置)
  }
  return <aside className="wps-ppt-properties wps-ppt-review" aria-label="批注">
    <h2>批注{统计.总数 > 0 ? `（未解决 ${统计.未解决} / 共 ${统计.总数}）` : ''}</h2>
    {on切换区域 && <div className="wps-ppt-properties__actions">
      <button type="button" onClick={() => on切换区域('检查')}>排版检查</button>
      <button type="button" aria-pressed onClick={() => on切换区域('转换')}>繁简转换</button>
    </div>}
    <fieldset><legend>显示与导航</legend>
      <label className="wps-animation-check"><input type="checkbox" aria-label="显示批注标记" checked={显示批注} onChange={事件 => on显示变化(事件.target.checked)} />在画布上显示批注标记</label>
      <div className="wps-ppt-properties__actions">
        <button type="button" onClick={() => 导航(-1)}>上一条批注</button>
        <button type="button" onClick={() => 导航(1)}>下一条批注</button>
      </div>
      <p>显示开关与逐条导航只改变查看状态，不会修改文稿或产生未保存标记。</p>
      <p>批注正文、作者与时间写入原生批注部件；回复、解决状态与对象锚点保存在本机扩展部件中，其他办公软件另存该文件后这些扩展信息可能丢失，批注正文仍会保留。</p>
    </fieldset>
    <fieldset disabled={只读}><legend>新建批注{选中 ? '（关联选中对象）' : '（整页）'}</legend>
      <label>作者<input aria-label="批注作者" value={作者} onChange={事件 => set作者(事件.target.value)} /></label>
      <label>内容<textarea aria-label="批注内容" value={内容} disabled={只读} onChange={事件 => set内容(事件.target.value)} /></label>
      <div className="wps-ppt-properties__actions"><button type="button" disabled={只读} onClick={提交新批注}>添加批注</button></div>
    </fieldset>
    <fieldset><legend>本页批注（{本页批注.length}）</legend>
      {本页批注.length === 0 && <p>当前页没有批注。选择对象后添加可以关联到该对象。</p>}
      <ol className="wps-comment-list">
        {本页批注.map(批注 => {
          const 失效 = 批注对象失效(文稿, 批注)
          return <li key={批注.id}>
            <p className="wps-comment-list__meta">{批注.作者} · {批注.时间}{批注.已解决 ? ' · 已解决' : ''}{批注.对象标识 && !失效 ? ' · 已关联对象' : ''}</p>
            <p className="wps-comment-list__text">{批注.内容}</p>
            {失效 && <p className="wps-comment-list__stale">对象已删除，批注仍然保留，可以继续回复或删除。</p>}
            {(批注.回复 ?? []).map(回复 => <p key={回复.id} className="wps-comment-list__reply">{回复.作者} 回复：{回复.内容}</p>)}
            <label>修改内容<input aria-label="修改批注内容" disabled={只读} value={编辑草稿[批注.id] ?? ''} placeholder={批注.内容} onChange={事件 => set编辑草稿(草稿 => ({ ...草稿, [批注.id]: 事件.target.value }))} /></label>
            <label>回复<input aria-label="批注回复" disabled={只读} value={回复草稿[批注.id] ?? ''} onChange={事件 => set回复草稿(草稿 => ({ ...草稿, [批注.id]: 事件.target.value }))} /></label>
            <div className="wps-ppt-properties__actions">
              <button type="button" disabled={只读 || !(编辑草稿[批注.id] ?? '').trim()} onClick={() => { 执行(() => 修改批注内容(文稿, 批注.id, 编辑草稿[批注.id] ?? '')); set编辑草稿(草稿 => ({ ...草稿, [批注.id]: '' })) }}>保存修改</button>
              <button type="button" disabled={只读} onClick={() => { 执行(() => 回复批注(文稿, 批注.id, 回复草稿[批注.id] ?? '', 作者)); set回复草稿(草稿 => ({ ...草稿, [批注.id]: '' })) }}>回复</button>
              <button type="button" disabled={只读} onClick={() => 执行(() => 设置批注解决(文稿, 批注.id, !批注.已解决))}>{批注.已解决 ? '取消解决' : '标记解决'}</button>
              <button type="button" disabled={只读} onClick={() => 执行(() => 删除批注(文稿, 批注.id))}>删除批注</button>
            </div>
          </li>
        })}
      </ol>
    </fieldset>
  </aside>
}
