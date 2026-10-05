import ChartDataPanel from './ChartDataPanel'
import { useState } from 'react'
import { App as AntdApp } from 'antd'
import type { 演示对象 } from '../deck'
import { 修改单元格, 合并单元格, 取消单元格合并, 调整表格结构, type 单元格 } from '../model/elements'
import './elements.css'
export default function ElementContentPanel({ 对象, 禁用, on替换 }: { 对象: 演示对象; 禁用: boolean; on替换: (对象: 演示对象) => void }) {
  const { modal } = AntdApp.useApp()
  const [行, set行] = useState(0), [列,set列] = useState(0), [行数,set行数] = useState(1), [列数,set列数] = useState(2)
  const 操作 = (执行: () => 演示对象) => { try { on替换(执行()) } catch (错) { modal.error({ title: '对象编辑失败', content: 错 instanceof Error ? 错.message : '对象内容无效' }) } }
  if (对象.图表) return <ChartDataPanel 对象={对象} 禁用={禁用} on替换={on替换}/>
  if (对象.形状 && !对象.连接) {
    const 形 = 对象.形状
    return <fieldset className="wps-ppt-element" disabled={禁用}><legend>{形.种类 === '艺术字' ? '艺术字' : '图形内容'}</legend>
      <label>文字<textarea aria-label="图形文字" value={形.文本} onChange={e => on替换({ ...对象, 形状: { ...形, 文本: e.target.value } })}/></label>
      <div className="wps-ppt-element__grid">{(['填充','线条','颜色'] as const).map(键 => <label key={键}>{键}<input type="color" aria-label={`图形${键}`} value={形[键]} onChange={e => on替换({ ...对象, 形状: { ...形, [键]: e.target.value } })}/></label>)}
      <label>字号<input type="number" min={1} aria-label="图形字号" value={形.字号} onChange={e => { const 值 = Number(e.target.value); if (值 > 0) on替换({ ...对象, 形状: { ...形, 字号: 值 } }) }}/></label></div>
      <label><input type="checkbox" checked={形.加粗} onChange={e => on替换({ ...对象, 形状: { ...形, 加粗: e.target.checked } })}/>加粗</label>
    </fieldset>
  }
  const 表 = 对象.表格
  if (!表) return null
  const r = Math.min(行, 表.行高.length-1), c = Math.min(列,表.列宽.length-1)
  const 并 = 表.合并.find(项 => r >= 项.行 && r < 项.行+项.行数 && c >= 项.列 && c < 项.列+项.列数)
  const 格 = 表.单元格[并?.行 ?? r][并?.列 ?? c]
  const 修改 = (值: Partial<单元格>) => 操作(() => 修改单元格(对象,并?.行 ?? r,并?.列 ?? c,值))
  return <fieldset className="wps-ppt-element" disabled={禁用}><legend>单元格与结构</legend>
    <div className="wps-ppt-element__grid"><label>行<select aria-label="表格当前行" value={r} onChange={e => set行(Number(e.target.value))}>{表.行高.map((_,i) => <option key={i} value={i}>{i+1}</option>)}</select></label><label>列<select aria-label="表格当前列" value={c} onChange={e => set列(Number(e.target.value))}>{表.列宽.map((_,i) => <option key={i} value={i}>{i+1}</option>)}</select></label></div>
    <label>内容<textarea aria-label="单元格内容" value={格.文本} onChange={e => 修改({ 文本: e.target.value })}/></label>
    {并 && <p>当前为合并单元格，编辑作用于第 {并.行+1} 行第 {并.列+1} 列。</p>}
    <div className="wps-ppt-element__grid"><label>背景<input aria-label="单元格背景" type="color" value={格.背景} onChange={e => 修改({ 背景: e.target.value })}/></label><label>文字颜色<input aria-label="单元格文字颜色" type="color" value={格.颜色} onChange={e => 修改({ 颜色: e.target.value })}/></label><label>字号<input aria-label="单元格字号" type="number" min={1} value={格.字号} onChange={e => 修改({ 字号: Number(e.target.value) })}/></label><label>对齐<select aria-label="单元格对齐" value={格.对齐} onChange={e => 修改({ 对齐: e.target.value as 单元格['对齐'] })}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label></div>
    <label><input type="checkbox" checked={格.加粗} onChange={e => 修改({ 加粗: e.target.checked })}/>单元格加粗</label>
    <div className="wps-ppt-element__grid">{(['行','列'] as const).flatMap(方向 => (['插入','删除'] as const).map(动 => <button key={方向+动} type="button" onClick={() => 操作(() => 调整表格结构(对象,方向,方向 === '行' ? r : c,动))}>{动}{方向}</button>))}</div>
    <p>合并从当前单元格开始；调整行列前需取消合并。</p>
    <div className="wps-ppt-element__grid"><label>合并行数<input aria-label="合并行数" type="number" min={1} value={行数} onChange={e => set行数(Number(e.target.value))}/></label><label>合并列数<input aria-label="合并列数" type="number" min={1} value={列数} onChange={e => set列数(Number(e.target.value))}/></label><button type="button" onClick={() => 操作(() => 合并单元格(对象,r,c,行数,列数))}>合并单元格</button><button type="button" onClick={() => 操作(() => 取消单元格合并(对象,r,c))}>取消合并</button></div>
  </fieldset>
}
