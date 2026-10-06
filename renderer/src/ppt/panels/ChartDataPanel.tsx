import { useEffect, useState } from 'react'
import { App as AntdApp } from 'antd'
import type { 演示对象 } from '../deck'
import { 修改图表, 图表配色, type 图表数据, type 图表动态 } from '../model/elements'
import './elements.css'
type 草稿图表 = Omit<图表数据,'系列'> & { 系列: { id:string; 名称:string; 颜色:string; 数值:string[] }[] }
const 草稿化 = (图: 图表数据): 草稿图表 => ({...图,分类:[...图.分类],系列:图.系列.map(项=>({...项,数值:项.数值.map(String)}))})
export default function ChartDataPanel({ 对象, 禁用, on替换 }: { 对象: 演示对象; 禁用: boolean; on替换: (对象: 演示对象) => void }) {
  const {modal}=AntdApp.useApp(),[草稿,set草稿]=useState(()=>草稿化(对象.图表!))
  useEffect(()=>set草稿(草稿化(对象.图表!)),[对象.图表])
  const 修改=(值:Partial<草稿图表>)=>set草稿(旧=>({...旧,...值}))
  const 设置动态=(值:string)=>set草稿(旧=>{
    if (值 === '不启用') { const { 动态: _省略, ...其余 } = 旧; return 其余 as 草稿图表 }
    return { ...旧, 动态: { 步进: 值 as 图表动态['步进'], 每步毫秒: 旧.动态?.每步毫秒 ?? 500 } }
  })
  const 应用=()=>{
    if (禁用) return
    try {
      const 图:图表数据={...草稿,系列:草稿.系列.map(项=>({...项,数值:项.数值.map((值,i)=>{
        if (!值.trim() || !Number.isFinite(Number(值))) throw new Error(`${项.名称}第${i+1}行请输入有效数值`)
        return Number(值)
      })}))}
      on替换(修改图表(对象,图))
    }catch(错){modal.error({title:'图表编辑失败',content:错 instanceof Error?错.message:'图表数据无效'})}
  }
  return <fieldset className="wps-ppt-element wps-ppt-chart-panel" disabled={禁用}><legend>图表数据与样式</legend>
    <label>图表标题<input aria-label="图表标题" value={草稿.标题} onChange={e=>修改({标题:e.target.value})}/></label>
    <div className="wps-ppt-element__grid"><label>类型<select aria-label="图表类型" value={草稿.种类} onChange={e=>修改({种类:e.target.value as 图表数据['种类']})}>{['柱状图','折线图','饼图'].map(项=><option key={项}>{项}</option>)}</select></label><label>图例<select aria-label="图表图例" value={草稿.图例} onChange={e=>修改({图例:e.target.value as 图表数据['图例']})}>{['下','右','无'].map(项=><option key={项}>{项}</option>)}</select></label></div>
    <label>数值格式<select aria-label="图表数值格式" value={草稿.数值格式} onChange={e=>修改({数值格式:e.target.value as 图表数据['数值格式']})}>{[['0','整数'],['0.00','两位小数'],['#,##0','千位分隔'],['0%','百分比'],['0.00%','百分比两位小数']].map(([值,名])=><option key={值} value={值}>{名}</option>)}</select></label>
    {草稿.种类!=='饼图' && <div className="wps-ppt-element__grid">{(['横','纵'] as const).map(轴=><div key={轴}><label>{轴}轴标题<input aria-label={`${轴}轴标题`} value={草稿[`${轴}轴标题`]} onChange={e=>修改({[`${轴}轴标题`]:e.target.value})}/></label><label><input type="checkbox" checked={草稿[`显示${轴}轴`]} onChange={e=>修改({[`显示${轴}轴`]:e.target.checked})}/>显示{轴}轴</label></div>)}</div>}
    <div className="wps-ppt-element__grid"><label>动态播放<select aria-label="动态播放" value={草稿.动态?.步进 ?? '不启用'} onChange={e=>设置动态(e.target.value)}>{['不启用','按系列','按分类','按系列与数据点'].map(项=><option key={项}>{项}</option>)}</select></label>{草稿.动态 && <label>每步时长（秒）<input type="number" min="0.1" max="60" step="0.1" aria-label="每步时长（秒）" value={草稿.动态.每步毫秒/1000} onChange={e=>修改({动态:{步进:草稿.动态!.步进,每步毫秒:Math.round(Number(e.target.value)*1000)}})}/></label>}</div>
    {草稿.动态 && <p>动态播放按图表数据分步呈现；放映时需要在「切换与动画」面板为这个图表添加「图表分步」动画，静态导出始终使用最终状态。</p>}
    <div className="wps-ppt-chart-panel__table" tabIndex={0} aria-label="图表数据表"><table><thead><tr><th scope="col">分类</th>{草稿.系列.map((项,s)=><th scope="col" key={项.id}><input aria-label={`第${s+1}系列名称`} value={项.名称} onChange={e=>修改({系列:草稿.系列.map((子,i)=>i===s?{...子,名称:e.target.value}:子)})}/><input type="color" aria-label={`第${s+1}系列颜色`} value={项.颜色} onChange={e=>修改({系列:草稿.系列.map((子,i)=>i===s?{...子,颜色:e.target.value}:子)})}/><button type="button" disabled={禁用||草稿.系列.length===1} onClick={()=>修改({系列:草稿.系列.filter(子=>子.id!==项.id)})}>删除系列{s+1}</button></th>)}<th scope="col">操作</th></tr></thead>
      <tbody>{草稿.分类.map((名,r)=><tr key={r}><td><input aria-label={`第${r+1}行分类`} value={名} onChange={e=>修改({分类:草稿.分类.map((子,i)=>i===r?e.target.value:子)})}/></td>{草稿.系列.map((项,s)=><td key={项.id}><input inputMode="decimal" aria-label={`第${r+1}行第${s+1}系列数值`} value={项.数值[r]} onChange={e=>修改({系列:草稿.系列.map((子,i)=>i===s?{...子,数值:子.数值.map((数,j)=>j===r?e.target.value:数)}:子)})}/></td>)}<td><button type="button" aria-label={`删除第${r+1}行`} disabled={禁用||草稿.分类.length===1} onClick={()=>修改({分类:草稿.分类.filter((_,i)=>i!==r),系列:草稿.系列.map(项=>({...项,数值:项.数值.filter((_,i)=>i!==r)}))})}>删除</button></td></tr>)}</tbody></table></div>
    <div className="wps-ppt-element__grid"><button type="button" disabled={禁用||草稿.分类.length>=(草稿.种类==='饼图'?12:100)} onClick={()=>修改({分类:[...草稿.分类,`分类${草稿.分类.length+1}`],系列:草稿.系列.map(项=>({...项,数值:[...项.数值,'0']}))})}>添加分类</button><button type="button" disabled={禁用||草稿.种类==='饼图'||草稿.系列.length>=12} onClick={()=>{const 编号=Math.max(...草稿.系列.map(项=>Number(项.id.slice(7))))+1;修改({系列:[...草稿.系列,{id:`series-${编号}`,名称:`系列${编号+1}`,颜色:图表配色[草稿.系列.length%图表配色.length],数值:草稿.分类.map(()=>'0')}]})}}>添加系列</button></div>
    <p>修改后点击应用。最多100项分类、12个系列；饼图仅支持一个非负系列、12项分类。</p>
    <button type="button" className="wps-ppt-chart-panel__apply" onClick={应用}>应用图表数据</button>
  </fieldset>
}
