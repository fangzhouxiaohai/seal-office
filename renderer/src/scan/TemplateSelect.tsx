import { Select } from 'antd'
import { useState } from 'react'
import { 单据模板列表, 扫描模板列表 } from './templates'

export default function TemplateSelect({ receipts = false, value, change }: { receipts?: boolean; value?: string; change: (id: string) => void }) {
  const [query,setQuery] = useState('')
  const terms = query.normalize('NFKC').toLowerCase().trim().split(/\s+/)
  const label = receipts ? '单据类型' : '识别模板'
  const options = (receipts ? 单据模板列表 : 扫描模板列表).filter(t => {
    const words = [t.名称,t.英文名,t.行业,t.分类,t.标识,...[...t.表头字段,...t.明细字段].flatMap(f => [...f.别名,f.英文名])].join(' ').toLowerCase()
    return terms.every(term => words.includes(term))
  }).sort((a,b) => Number(b.名称 === query) - Number(a.名称 === query))
  const groups = [...new Set(options.map(t => t.行业))].map(label => ({ label, options: options.filter(t => t.行业 === label).map(t => ({ value:t.标识,label:t.名称 })) }))
  return <Select aria-label={label} placeholder={'搜索' + label} style={{minWidth:160}} showSearch filterOption={false}
    value={value} searchValue={query} onSearch={setQuery} onDropdownVisibleChange={open => { if (!open) setQuery('') }}
    onChange={id => { change(id); setQuery('') }} options={!receipts && terms.every(t => '万能扫描'.includes(t)) ? [{value:'',label:'万能扫描'},...groups] : groups}/>
}
