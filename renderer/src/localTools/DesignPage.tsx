import { useState } from 'react'
import { App, Button, InputNumber } from 'antd'
import { useAppStore } from '../store'
import { createDesign, designTemplates } from './designTemplates'
import './workspaceTools.css'
export default function DesignPage() {
  const { createDoc } = useAppStore(), { modal } = App.useApp(), [width,setWidth] = useState(1080), [height,setHeight] = useState(1080)
  const open = (id: string, custom = false) => { try { createDoc('ppt', createDesign(id, custom ? width : undefined, custom ? height : undefined)) } catch (error) { modal.error({ title: '创建设计失败', content: error instanceof Error ? error.message : '尺寸或模板无效' }) } }
  return <div className="local-page workspace-tool" data-tool="design"><header className="local-page__header"><div><h1>设计</h1><p>制作海报、方图、横幅与信息长图。进入画布后可编辑文字、形状、图片和图层，并保存可编辑文件。</p></div></header>
    <section className="tool-card design-custom"><h2>空白画布</h2><label>宽度<InputNumber aria-label="设计宽度" min={200} max={2400} precision={0} value={width} onChange={n => setWidth(n ?? 1080)}/></label><span>×</span><label>高度<InputNumber aria-label="设计高度" min={200} max={2400} precision={0} value={height} onChange={n => setHeight(n ?? 1080)}/></label><Button onClick={() => { setWidth(height); setHeight(width) }}>交换宽高</Button><Button type="primary" onClick={() => open('blank', true)}>创建设计</Button></section>
    <div className="design-template-grid">{designTemplates.map(t => <article className="tool-card" key={t.id}><div className="design-template-preview" style={{ background: t.paper, color: t.color }}><small>{t.label}</small><strong>{t.title}</strong><span>{t.subtitle}</span><i aria-hidden="true"/></div><div className="design-template-details"><h2>{t.name}</h2><p>{t.width} × {t.height}</p><Button onClick={() => open(t.id)}>使用设计</Button></div></article>)}</div>
  </div>
}
