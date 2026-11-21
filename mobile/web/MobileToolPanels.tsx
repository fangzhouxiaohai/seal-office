import { useState } from 'react'
import { Button, Drawer, Input } from 'antd'
import Icon from '../../renderer/src/components/Icon'
import { lookupEntry, quickCreateGroups, type ToolEntry } from './toolCatalog'
import './toolCatalog.css'

export function ToolTile({entry,onOpen,primary=true}:{entry:ToolEntry;onOpen:(entry:ToolEntry)=>void;primary?:boolean}) {
  const { action, label, icon } = entry
  const nav = action.kind === 'navigate' ? action.key : action.kind === 'scan' && action.mode === '文件扫描' ? 'scan' : undefined
  return <button type="button" className="seal-tool-tile" aria-label={label} data-tool-id={entry.id} data-nav-key={primary?nav:undefined} data-document-type={action.kind==='document'?action.type:undefined} onClick={()=>onOpen(entry)}>
    <span className="seal-tool-icon" aria-hidden="true"><Icon name={icon} size={25}/></span>
    <span>{label}</span>
  </button>
}
export function QuickCreate({open,onClose,onOpen}:{open:boolean;onClose:()=>void;onOpen:(entry:ToolEntry)=>void}) {
  return <Drawer title="快速创建" placement="bottom" open={open} onClose={onClose} height="min(84dvh, 720px)" rootClassName="seal-quick-create-sheet" destroyOnClose>
    {quickCreateGroups.map((group,index)=><section key={group.title} className="seal-create-group" aria-label={group.title}>
      {index>0&&<h3>{group.title}</h3>}
      <div className={index===0?'seal-create-featured':'seal-mobile-create seal-tool-grid'}>
        {group.ids.map(id=><ToolTile key={id} entry={lookupEntry(id)} onOpen={entry=>{onClose();onOpen(entry)}}/>)}
      </div>
    </section>)}
  </Drawer>
}

export function AssistantStarter({task,onBack}:{task:'智能文档'|'智能表格'|'智能演示';onBack:()=>void}) {
  const [topic,setTopic]=useState('')
  const start=()=>{
    const text=topic.trim()
    if (!text) return
    const goal={智能文档:'创建可编辑的文字文档',智能表格:'创建可编辑的表格工作簿',智能演示:'创建可编辑的演示文稿'}[task]
    window.dispatchEvent(new CustomEvent('seal-assistant-ask',{detail:{文本:'请根据以下要求'+goal+'，并提供文档创建预览。\n'+text}}))
  }
  return <section className="seal-assistant-starter"><Button onClick={onBack}>返回</Button><h1>{task}</h1>
    <label htmlFor="seal-create-topic">希望创建什么内容？</label>
    <Input.TextArea id="seal-create-topic" value={topic} onChange={event=>setTopic(event.target.value)} rows={5} maxLength={3000} placeholder="输入主题、用途以及需要包含的内容"/>
    <Button type="primary" disabled={!topic.trim()} onClick={start}>交给助手生成</Button>
  </section>
}
