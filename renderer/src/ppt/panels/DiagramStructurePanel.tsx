import { useState } from 'react'
import type { 幻灯片, 演示对象 } from '../deck'
export default function DiagramStructurePanel({ 页, 组, 禁用, on操作 }: { 页: 幻灯片; 组: 演示对象; 禁用: boolean; on操作: (命令: string) => void }) {
  const [起点,set起点] = useState(''), [终点,set终点] = useState('')
  const 节点 = 页.对象列表?.filter(项 => 组.子对象标识?.includes(项.id) && 项.形状 && !项.连接) ?? []
  return <fieldset className="wps-ppt-element" disabled={禁用}><legend>语义图结构</legend><button type="button" onClick={() => on操作('新增节点')}>添加节点</button><label>起点<select aria-label="连线起点" value={起点} onChange={e => set起点(e.target.value)}><option value="">选择起点</option>{节点.map(项 => <option key={项.id} value={项.id}>{项.形状!.文本 || 项.形状!.种类}</option>)}</select></label><label>终点<select aria-label="连线终点" value={终点} onChange={e => set终点(e.target.value)}><option value="">选择终点</option>{节点.map(项 => <option key={项.id} value={项.id}>{项.形状!.文本 || 项.形状!.种类}</option>)}</select></label><button type="button" disabled={禁用 || !起点 || !终点} onClick={() => on操作(`新增连线:${起点},${终点}`)}>添加连线</button></fieldset>
}
