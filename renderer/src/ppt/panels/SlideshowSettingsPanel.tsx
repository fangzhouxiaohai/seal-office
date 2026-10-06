import React from 'react'
import { App } from 'antd'
import { 修复自定义放映引用, 创建自定义放映, 校验自定义放映, 校验放映设置, 读取放映设置, type 放映设置 } from '../model/show'
import type { 演示文稿 } from '../deck'
import type { 放映偏好 } from '../playback/放映偏好'

interface 显示器项 { 标识: string; 名称: string; 主屏: boolean }

interface Props {
  文稿: 演示文稿
  只读?: boolean
  on修改: (文稿: 演示文稿) => void
  偏好: 放映偏好
  on偏好修改: (偏好: 放映偏好) => void
  /** 主进程返回的真实显示器列表；缺失时只提供主屏/第二屏两个语义选项 */
  显示器?: 显示器项[]
}

/**
 * 放映设置面板：文稿内的放映范围、换片方式与自定义放映；
 * 屏幕、指针与媒体音量属于本机偏好，单独回调，不写入文稿。
 */
export default function 放映设置面板({ 文稿, 只读 = false, on修改, 偏好, on偏好修改, 显示器 }: Props) {
  const { modal } = App.useApp()
  const 设置 = 读取放映设置(文稿)
  const 页面列表 = 文稿.幻灯片列表
  const [新名称, set新名称] = React.useState('')
  /** 范围模式与下拉选择保留本地面板草稿：父级拒绝或尚未回流时，界面仍与用户选择一致 */
  const [范围模式, set范围模式] = React.useState<放映设置['范围']['类型']>(设置.范围.类型)
  const [所选放映草稿, set所选放映草稿] = React.useState(设置.范围.类型 === '自定义放映' ? 设置.范围.放映标识 : (文稿.自定义放映 ?? [])[0]?.id ?? '')
  const [换片草稿, set换片草稿] = React.useState(设置.换片方式)
  React.useEffect(() => { set范围模式(设置.范围.类型) }, [设置.范围.类型, 文稿.id])
  React.useEffect(() => { set换片草稿(设置.换片方式) }, [设置.换片方式, 文稿.id])
  React.useEffect(() => {
    if (设置.范围.类型 === '自定义放映') set所选放映草稿(设置.范围.放映标识)
    else if (!(文稿.自定义放映 ?? []).some((项) => 项.id === 所选放映草稿)) set所选放映草稿((文稿.自定义放映 ?? [])[0]?.id ?? '')
  }, [设置.范围, 文稿.自定义放映, 文稿.id])
  const [页码范围, set页码范围] = React.useState(() => ({
    起始: String(设置.范围.类型 === '页码范围' ? 设置.范围.起始 : 1),
    结束: String(设置.范围.类型 === '页码范围' ? 设置.范围.结束 : Math.max(1, 页面列表.length)),
  }))
  const [范围错误, set范围错误] = React.useState<string | null>(null)

  const 计划放映 = (范围: 放映设置['范围']): void => {
    const 新设置: 放映设置 = { ...设置, 范围 }
    try {
      校验放映设置(新设置)
      if (范围.类型 === '页码范围' && 范围.起始 > 页面列表.length) throw new Error(`放映页码范围超出幻灯片数量（当前共 ${页面列表.length} 页）`)
      set范围错误(null)
      提交({ 放映设置: 新设置 })
    } catch (错误) {
      set范围错误(错误 instanceof Error ? 错误.message : '放映范围无效')
    }
  }

  const 提交 = (修改: Partial<演示文稿>): void => {
    if (只读) return
    try {
      const 新稿 = { ...文稿, ...修改 }
      校验放映设置(读取放映设置(新稿))
      if (新稿.自定义放映 !== undefined) 校验自定义放映(新稿.自定义放映, new Set(页面列表.map((页) => 页.id)))
      on修改(新稿)
    } catch (错误) {
      modal.error({ title: '放映设置失败', content: 错误 instanceof Error ? 错误.message : '放映设置无效' })
    }
  }

  const 改放映 = (标识: string, 变更: (放映: { id: string; 名称: string; 页面标识列表: string[] }) => { id: string; 名称: string; 页面标识列表: string[] }): void => {
    const 新放映 = (文稿.自定义放映 ?? []).map((放映) => (放映.id === 标识 ? 变更(放映) : 放映))
    提交(修复自定义放映引用({ ...文稿, 自定义放映: 新放映 }))
  }

  const 移动页面 = (放映标识: string, 位置: number, 方向: -1 | 1): void => {
    改放映(放映标识, (放映) => {
      if (位置 + 方向 < 0 || 位置 + 方向 >= 放映.页面标识列表.length) return 放映
      const 列表 = [...放映.页面标识列表]
      ;[列表[位置], 列表[位置 + 方向]] = [列表[位置 + 方向], 列表[位置]]
      return { ...放映, 页面标识列表: 列表 }
    })
  }

  const 显示器选项: 显示器项[] = 显示器 && 显示器.length > 0 ? 显示器 : [{ 标识: '主屏', 名称: '主显示器', 主屏: true }, { 标识: '第二屏', 名称: '第二台显示器', 主屏: false }]
  const 屏幕取值 = 显示器选项.some((项) => 项.标识 === 偏好.屏幕)
    ? 偏好.屏幕
    : (显示器选项.find((项) => 项.主屏)?.标识 ?? 显示器选项[0].标识)

  return <aside className="wps-ppt-properties wps-show-settings" role="complementary" aria-label="放映设置">
    <h2 className="wps-ppt-properties__title">放映设置</h2>
    {只读 ? <p className="wps-show-settings__readonly">当前演示文稿为只读状态，放映设置不可修改；可继续使用本机放映偏好预览。</p> : null}

    <fieldset disabled={只读}>
      <legend>放映范围</legend>
      <label>范围<select aria-label="放映范围" value={范围模式} onChange={(事件) => {
        const 类型 = 事件.target.value as 放映设置['范围']['类型']
        set范围模式(类型)
        if (类型 === '全部') 计划放映({ 类型: '全部' })
        else if (类型 === '自定义放映') {
          const 首个 = (文稿.自定义放映 ?? []).find((项) => 项.id === 所选放映草稿) ?? (文稿.自定义放映 ?? [])[0]
          if (!首个) { set范围错误('尚未创建自定义放映，请先新建自定义放映'); return }
          set所选放映草稿(首个.id)
          计划放映({ 类型: '自定义放映', 放映标识: 首个.id })
        } else 计划放映({ 类型: '页码范围', 起始: Number(页码范围.起始), 结束: Number(页码范围.结束) })
      }}>
        <option value="全部">全部幻灯片</option>
        <option value="自定义放映">自定义放映</option>
        <option value="页码范围">页码范围</option>
      </select></label>
      {范围模式 === '自定义放映' ? <label>自定义放映<select aria-label="所选自定义放映" value={所选放映草稿} onChange={(事件) => { set所选放映草稿(事件.target.value); 计划放映({ 类型: '自定义放映', 放映标识: 事件.target.value }) }}>
        {(文稿.自定义放映 ?? []).map((放映) => <option key={放映.id} value={放映.id}>{放映.名称}</option>)}
      </select></label> : null}
      {范围模式 === '页码范围' ? <>
        <label>起始页<input aria-label="起始页" type="number" min="1" value={页码范围.起始} onChange={(事件) => {
          const 起 = 事件.target.value
          set页码范围((当前) => ({ ...当前, 起始: 起 }))
          const 起数 = Number(起)
          if (!Number.isInteger(起数) || 起数 < 1) { set范围错误('起始页必须是大于 0 的整数'); return }
          计划放映({ 类型: '页码范围', 起始: 起数, 结束: Number(页码范围.结束) })
        }}/></label>
        <label>结束页<input aria-label="结束页" type="number" min="1" value={页码范围.结束} onChange={(事件) => {
          const 止 = 事件.target.value
          set页码范围((当前) => ({ ...当前, 结束: 止 }))
          计划放映({ 类型: '页码范围', 起始: Number(页码范围.起始), 结束: Number(止) })
        }}/></label>
      </> : null}
      {范围错误 ? <p className="wps-show-settings__error" role="alert">{范围错误}</p> : null}
      <p className="wps-show-settings__note">自定义放映会显式包含其中被隐藏的页面；常规放映跳过隐藏页。</p>
    </fieldset>

    <fieldset disabled={只读}>
      <legend>换片与循环</legend>
      <label>换片方式<select aria-label="换片方式" value={换片草稿} onChange={(事件) => { const 值 = 事件.target.value as 放映设置['换片方式']; set换片草稿(值); 提交({ 放映设置: { 范围: 设置.范围, 换片方式: 值 } }) }}>
        <option value="使用计时">使用计时（按各页自动换片时间）</option>
        <option value="手动">手动（忽略计时）</option>
      </select></label>
      <label className="wps-animation-check"><input aria-label="循环放映" type="checkbox" checked={!!文稿.循环放映} onChange={(事件) => 提交({ 循环放映: 事件.target.checked })}/>循环放映</label>
    </fieldset>

    <fieldset disabled={只读}>
      <legend>自定义放映</legend>
      <label>新自定义放映名称<input aria-label="新自定义放映名称" value={新名称} onChange={(事件) => set新名称(事件.target.value)}/></label>
      <button type="button" onClick={() => {
        try {
          const 新放映 = 创建自定义放映(文稿, 新名称, 页面列表.map((页) => 页.id))
          提交({ 自定义放映: [...(文稿.自定义放映 ?? []), 新放映] })
          set新名称('')
        } catch (错误) { modal.error({ title: '无法新建自定义放映', content: 错误 instanceof Error ? 错误.message : '自定义放映无效' }) }
      }}>新建自定义放映</button>
      {(文稿.自定义放映 ?? []).length === 0 ? <p>尚未创建自定义放映。</p> : null}
      <ol className="wps-show-settings__shows">
        {(文稿.自定义放映 ?? []).map((放映, 序号) => <li key={放映.id}>
          <label>放映名称 {序号 + 1}<input aria-label={`放映名称 ${序号 + 1}`} value={放映.名称} onChange={(事件) => 改放映(放映.id, (当前) => ({ ...当前, 名称: 事件.target.value }))}/></label>
          <ol className="wps-show-settings__pages">
            {放映.页面标识列表.map((页标识, 位置) => <li key={页标识}>
              <span>{位置 + 1}. {页面列表.find((页) => 页.id === 页标识)?.title ?? '已删除页面'}</span>
              <button type="button" aria-label={`第 ${位置 + 1} 页上移`} disabled={位置 === 0} onClick={() => 移动页面(放映.id, 位置, -1)}>上移</button>
              <button type="button" aria-label={`第 ${位置 + 1} 页下移`} disabled={位置 === 放映.页面标识列表.length - 1} onClick={() => 移动页面(放映.id, 位置, 1)}>下移</button>
              <button type="button" aria-label={`移除第 ${位置 + 1} 页`} onClick={() => 改放映(放映.id, (当前) => ({ ...当前, 页面标识列表: 当前.页面标识列表.filter((标识) => 标识 !== 页标识) }))}>移除</button>
            </li>)}
          </ol>
          <button type="button" onClick={() => 改放映(放映.id, (当前) => ({ ...当前, 页面标识列表: [...当前.页面标识列表, ...页面列表.filter((页) => !当前.页面标识列表.includes(页.id)).map((页) => 页.id)] }))}>添加未包含页</button>
          <button type="button" aria-label={`删除自定义放映 ${序号 + 1}`} onClick={() => 提交(修复自定义放映引用({ ...文稿, 自定义放映: (文稿.自定义放映 ?? []).filter((项) => 项.id !== 放映.id) }))}>删除自定义放映</button>
        </li>)}
      </ol>
    </fieldset>

    <fieldset>
      <legend>本机放映偏好</legend>
      <label>演讲者屏<select aria-label="演讲者屏" value={屏幕取值} onChange={(事件) => on偏好修改({ ...偏好, 屏幕: 事件.target.value })}>
        {显示器选项.map((项) => <option key={项.标识} value={项.标识}>{项.名称}</option>)}
      </select></label>
      {显示器选项.filter((项) => !项.主屏).length === 0 ? <p className="wps-show-settings__note">本机只检测到一台显示器：演讲者视图与观众画面在同一台显示器上，切换查看时观众会看到演讲者窗口。</p> : null}
      <label>放映指针<select aria-label="放映指针" value={偏好.指针} onChange={(事件) => on偏好修改({ ...偏好, 指针: 事件.target.value as 放映偏好['指针'] })}>
        <option value="箭头">箭头</option>
        <option value="激光笔">激光笔</option>
        <option value="隐藏">隐藏指针</option>
      </select></label>
      <label>媒体音量<input aria-label="媒体音量" type="range" min="0" max="100" value={偏好.媒体音量} onChange={(事件) => on偏好修改({ ...偏好, 媒体音量: Number(事件.target.value) })}/></label>
      <p className="wps-show-settings__note">屏幕、指针与音量属于本机偏好，不写入演示文稿，也不产生未保存标记。</p>
    </fieldset>
  </aside>
}
