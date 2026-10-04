import DiagramStructurePanel from './DiagramStructurePanel'
import { useState } from 'react'
import ElementContentPanel from './ElementContentPanel'
import type { 幻灯片, 演示对象 } from '../deck'
import type { 几何修改 } from '../model/objectOperations'
interface Props { 页: 幻灯片; 选中: string[]; 只读: boolean; on修改: (修改: 几何修改) => void; on操作: (命令: string) => void; on替换?: (对象: 演示对象) => void; on选中?: (标识: string[]) => void }
function 数值项({ 名称, 值, 禁用, on提交 }: { 名称: string; 值: number; 禁用: boolean; on提交: (值: number) => void }) {
  const [草稿, set草稿] = useState<string | null>(null)
  const 提交 = () => { if (草稿 !== null) { on提交(草稿.trim() === '' ? NaN : Number(草稿)); set草稿(null) } }
  return <label>{名称}<input aria-label={名称} type="number" step="0.1" disabled={禁用} value={草稿 ?? 值} onChange={事件 => set草稿(事件.target.value)} onBlur={提交} onKeyDown={事件 => { if (事件.key === 'Enter') 事件.currentTarget.blur(); if (事件.key === 'Escape') set草稿(null) }} /></label>
}
export default function ObjectPropertiesPanel({ 页, 选中, 只读, on修改, on操作, on替换, on选中 }: Props) {
  const 对象 = 页.对象列表?.find(项 => 项.id === 选中[0])
  if (!对象) return null
  const 禁用 = 只读 || !!对象.锁定, 裁剪 = 对象.裁剪 ?? { 左: 0, 上: 0, 右: 0, 下: 0 }
  const 操作按钮 = (命令: string, 名称: string, 不可用 = 禁用) => <button key={命令} type="button" disabled={不可用} onClick={() => on操作(命令)}>{名称}</button>
  return <aside className="wps-ppt-properties" aria-label="对象属性">
    <h2>{选中.length > 1 ? `已选 ${选中.length} 个对象` : `${对象.类型}属性`}</h2>
    <fieldset disabled={禁用}><legend>位置和尺寸（像素）</legend><div className="wps-ppt-properties__fields">{(['x','y','width','height','旋转'] as const).map((键,i) => <数值项 key={`${对象.id}-${键}`} 名称={['水平位置','垂直位置','宽度','高度','旋转角度'][i]} 值={对象[键] ?? 0} 禁用={禁用 || (键 === '旋转' && (对象.类型 === '组合' || 对象.类型 === '表格' || !!对象.连接))} on提交={值 => on修改({ [键]: 值 })} />)}</div></fieldset>
    {对象.类型 === '图片' && 选中.length === 1 && <fieldset disabled={禁用}><legend>裁剪（百分比）</legend><div className="wps-ppt-properties__fields">{(['左','上','右','下'] as const).map(边 => <数值项 key={`${对象.id}-${边}`} 名称={`${边}裁剪`} 值={裁剪[边] * 100} 禁用={禁用} on提交={值 => on修改({ 裁剪: { ...裁剪, [边]: 值 / 100 } })} />)}</div></fieldset>}
    {on替换 && 选中.length === 1 && <ElementContentPanel key={`内容-${对象.id}`} 对象={对象} 禁用={禁用} on替换={on替换}/>}
    {对象.语义类型 && <DiagramStructurePanel key={`结构-${对象.id}`} 页={页} 组={对象} 禁用={禁用} on操作={on操作}/>}
    {对象.子对象标识 && <fieldset className="wps-ppt-element-members"><legend>组合成员</legend><div className="wps-ppt-properties__actions">{对象.子对象标识.map(id => { const 子 = 页.对象列表?.find(项 => 项.id === id); return <button key={id} title={子?.形状?.文本 || 子?.类型} type="button" disabled={只读} onClick={() => on选中?.([id])}>{子?.形状?.文本 || 子?.形状?.种类 || 子?.类型}</button> })}</div>{对象.语义类型 && <p>外部软件中为可编辑形状与文本组合，本机保留{对象.语义类型}连接结构。</p>}</fieldset>}
    <fieldset><legend>排列</legend><div className="wps-ppt-properties__actions">{['左','水平居中','右','上','垂直居中','下'].map(方向 => 操作按钮(`对齐:${方向}`, 方向, 禁用 || 选中.length < 2))}{['水平','垂直'].map(方向 => 操作按钮(`分布:${方向}`, `${方向}分布`, 禁用 || 选中.length < 3))}{['置顶','置底','上移','下移'].map(方向 => 操作按钮(`图层:${方向}`, 方向))}</div></fieldset>
    <div className="wps-ppt-properties__actions">{操作按钮('组合', '组合', 禁用 || 选中.length < 2)}{操作按钮('取消组合', '取消组合', 禁用 || 对象.类型 !== '组合')}{操作按钮(对象.锁定 ? '解锁' : '锁定', 对象.锁定 ? '解锁' : '锁定', 只读)}{操作按钮('删除', '删除')}</div>
  </aside>
}
