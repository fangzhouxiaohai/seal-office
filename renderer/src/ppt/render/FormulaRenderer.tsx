import React from 'react'
import type { 演示对象 } from '../deck'
import { 解析公式节点, type 公式节点 } from '../model/formulas'
import { 读取附件风险, 格式化字节数 } from '../model/attachments'
import './renderExtras.css'

// 公式按解析后的节点树渲染上下标、分数与根号；不使用图片，编辑区与放映共用同一实现。
function 节点内容({ 节点, 键 }: { 节点: 公式节点; 键: string }): React.ReactElement {
  if (节点.类型 === '文本') return <span key={键}>{节点.文本}</span>
  if (节点.类型 === '上标') return <span key={键}>{节点列表(节点.底, `${键}-底`)}<sup className="wps-ppt-formula__sup">{节点列表(节点.幂, `${键}-幂`)}</sup></span>
  if (节点.类型 === '下标') return <span key={键}>{节点列表(节点.底, `${键}-底`)}<sub className="wps-ppt-formula__sub">{节点列表(节点.下, `${键}-下`)}</sub></span>
  if (节点.类型 === '上下标') return <span key={键}>{节点列表(节点.底, `${键}-底`)}<span className="wps-ppt-formula__scripts"><sup className="wps-ppt-formula__sup">{节点列表(节点.幂, `${键}-幂`)}</sup><sub className="wps-ppt-formula__sub">{节点列表(节点.下, `${键}-下`)}</sub></span></span>
  if (节点.类型 === '分数') return <span key={键} className="wps-ppt-formula__frac"><span className="wps-ppt-formula__num">{节点列表(节点.分子, `${键}-分子`)}</span><span className="wps-ppt-formula__den">{节点列表(节点.分母, `${键}-分母`)}</span></span>
  if (节点.类型 === '根号') return <span key={键} className="wps-ppt-formula__root"><span className="wps-ppt-formula__radical">√</span><span className="wps-ppt-formula__radicand">{节点列表(节点.内容, `${键}-内容`)}</span></span>
  return <span key={键} />
}

function 节点列表(列表: 公式节点[] | undefined, 前缀: string): React.ReactNode {
  return (列表 ?? []).map((节点, 序号) => 节点内容({ 节点, 键: `${前缀}-${序号}` }))
}

export function 公式内容({ 对象 }: { 对象: 演示对象 }) {
  const 公式 = 对象.公式
  if (!公式) return null
  let 节点: 公式节点[]
  try { 节点 = 解析公式节点(公式.表达式) } catch { return <span className="wps-ppt-formula__broken">公式数据损坏：{公式.表达式}</span> }
  return <span className="wps-ppt-formula" style={{ fontSize: 公式.字号, color: 公式.颜色 }} aria-label={`公式 ${公式.表达式}`}>{节点列表(节点, 对象.id)}</span>
}

export function 附件内容({ 对象 }: { 对象: 演示对象 }) {
  const 附件 = 对象.附件
  if (!附件) return null
  const 风险 = 读取附件风险(附件.文件名)
  return (
    <span className="wps-ppt-attachment">
      <span className="wps-ppt-attachment__badge">附件</span>
      <span className="wps-ppt-attachment__name">{附件.显示名称}</span>
      <span className="wps-ppt-attachment__meta">{附件.文件名} · {格式化字节数(附件.字节数)}</span>
      {风险.宏风险 && <span className="wps-ppt-attachment__risk">可能包含宏，本机不执行</span>}
    </span>
  )
}

export function 图示内容({ 对象 }: { 对象: 演示对象 }) {
  const 图示 = 对象.图示
  if (!图示) return null
  return (
    <span className="wps-ppt-diagram">
      <span className="wps-ppt-diagram__badge">原生图示</span>
      <span className="wps-ppt-diagram__text">{图示.显示文本 || '（无文字）'}</span>
      <span className="wps-ppt-diagram__meta">本机只保留原生部件与位置尺寸，不提供语义编辑</span>
    </span>
  )
}
