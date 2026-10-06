import { useState } from 'react'
import { 符号字体表, 符号分类表, 搜索符号, 统计符号数量 } from '../model/symbols'

interface Props {
  只读: boolean
  on插入: (字符: string, 字体: string) => void
}

/** 符号面板：分类、字体选择、搜索与插入；符号按普通文字写入，可继续编辑。 */
export default function SymbolPanel({ 只读, on插入 }: Props) {
  const [分类, set分类] = useState('全部')
  const [关键词, set关键词] = useState('')
  const [字体, set字体] = useState(符号字体表[0])
  const 结果 = 搜索符号(关键词, 分类)
  return (
    <aside className="wps-ppt-properties" aria-label="符号设置">
      <fieldset disabled={只读}><legend>符号</legend>
        <div className="wps-ppt-element__grid">
          <label>分类<select aria-label="符号分类" value={分类} onChange={e => set分类(e.target.value)}><option value="全部">全部</option>{符号分类表.map(项 => <option key={项.名称} value={项.名称}>{项.名称}</option>)}</select></label>
          <label>字体<select aria-label="符号字体" value={字体} onChange={e => set字体(e.target.value)}>{符号字体表.map(项 => <option key={项} value={项}>{项}</option>)}</select></label>
        </div>
        <label>搜索<input aria-label="搜索符号" value={关键词} onChange={e => set关键词(e.target.value)} placeholder="按字符或名称搜索"/></label>
        <p>共 {统计符号数量()} 个内置符号，当前筛选出 {结果.length} 个。插入后是普通文字，可继续编辑与设置字体。</p>
        <div className="wps-ppt-symbol-grid">
          {结果.map(项 => <button key={`${项.字符}-${项.名称}`} type="button" aria-label={`插入符号 ${项.名称}`} title={项.名称} style={{ fontFamily: 字体 }} onClick={() => on插入(项.字符, 字体)}>{项.字符}</button>)}
        </div>
        {结果.length === 0 && <p>没有匹配的符号，请更换关键词或分类。</p>}
      </fieldset>
    </aside>
  )
}
