// 模板库：分类、键盘可用的模板预览及新建入口。
import { useState } from 'react'
import { Button, Drawer, Tag } from 'antd'
import { ALL_TEMPLATES, type 模板项 } from '../data/templates'
import { 净化富文本 } from '../editor/sanitizeHtml'
import './templateLibrary.css'

interface 模板库Props {
  打开?: boolean
  关闭?: () => void
  onSelect?: (模板: 模板项) => void
}

type 分类键 = 'all' | 模板项['分类']
const 分类列表: Array<{ 键: 分类键; 名称: string }> = [
  { 键: 'all', 名称: '全部' },
  { 键: 'word', 名称: '文字' },
  { 键: 'table', 名称: '表格' },
  { 键: 'ppt', 名称: '演示' },
]
const 分类名称: Record<模板项['分类'], string> = { word: '文字', table: '表格', ppt: '演示' }

const TemplateLibrary = ({ 打开 = false, 关闭, onSelect }: 模板库Props) => {
  const [当前分类, set当前分类] = useState<分类键>('all')
  const [预览模板, set预览模板] = useState<模板项 | null>(null)
  const 过滤模板 = 当前分类 === 'all' ? ALL_TEMPLATES : ALL_TEMPLATES.filter((项) => 项.分类 === 当前分类)

  const 关闭模板库 = () => {
    set预览模板(null)
    关闭?.()
  }

  const 使用模板 = (模板: 模板项) => {
    if (onSelect) onSelect(模板)
    else set预览模板(模板)
  }

  return (
    <Drawer
      title={预览模板 ? '模板预览' : '模板库'}
      placement="right"
      width={预览模板 ? 'min(600px, 100vw)' : 'min(800px, 100vw)'}
      open={打开}
      onClose={关闭模板库}
      extra={预览模板 ? <Button type="primary" onClick={() => { 使用模板(预览模板); set预览模板(null) }}>使用此模板</Button> : undefined}
    >
      {预览模板 ? <div className="template-library__detail">
        <Button type="link" onClick={() => set预览模板(null)}>返回模板库</Button>
        <h3>{预览模板.名称}</h3>
        <p>{预览模板.描述}</p>
        {预览模板.分类 === 'ppt' && <p>使用后将创建含封面、内容和行动页的可编辑演示文稿。</p>}
        <div className="template-library__document" dangerouslySetInnerHTML={{ __html: 净化富文本(预览模板.内容) }} />
      </div> : <div className="template-library">
        <div className="template-library__filters" role="group" aria-label="模板分类">
          {分类列表.map(({ 键, 名称 }) => (
            <Button key={键} type={当前分类 === 键 ? 'primary' : 'default'} aria-pressed={当前分类 === 键} onClick={() => set当前分类(键)}>{名称}</Button>
          ))}
        </div>
        <div className="template-library__grid">
          {过滤模板.map((模板) => (
            <article className="template-library__card" key={模板.id}>
              <div className={`template-library__thumb template-library__thumb--${模板.分类}`} aria-hidden="true">
                <div dangerouslySetInnerHTML={{ __html: 净化富文本(模板.内容) }} />
              </div>
              <div className="template-library__tags"><Tag>{分类名称[模板.分类]}</Tag>{模板.标签?.map((标签) => <Tag key={标签}>{标签}</Tag>)}</div>
              <button type="button" className="template-library__preview-trigger" onClick={() => set预览模板(模板)} aria-label={`预览${模板.名称}`}>
                <strong>{模板.名称}</strong>
                <span>{模板.描述}</span>
              </button>
              <Button type="primary" onClick={() => 使用模板(模板)}>使用模板</Button>
            </article>
          ))}
        </div>
      </div>}
    </Drawer>
  )
}

export default TemplateLibrary
