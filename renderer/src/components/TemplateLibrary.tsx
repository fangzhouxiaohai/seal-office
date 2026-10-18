// 模板库：分类、键盘可用的模板预览及新建入口。
import { useState } from 'react'
import { Alert, Button, Drawer, Empty, Input, Tag } from 'antd'
import { ALL_TEMPLATES, 生成演示模板文稿, type 模板项 } from '../data/templates'
import { restoreTemplatePhotos } from '../data/presentationTemplates/photos'
import { PresentationTemplatePreview } from './templatePreviews/PresentationTemplatePreview'
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
  const [搜索, set搜索] = useState(''), [场景, set场景] = useState('all'), [仅推荐, set仅推荐] = useState(false)
  const [预览模板, set预览模板] = useState<模板项 | null>(null)
  const [正在创建, set正在创建] = useState<string | null>(null)
  const [创建错误, set创建错误] = useState('')
  const 关键词 = 搜索.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const 过滤模板 = ALL_TEMPLATES.filter(项 => (当前分类 === 'all' || 项.分类 === 当前分类) && (!仅推荐 || 项.推荐) && (场景 === 'all' || 项.场景 === 场景) && 关键词.every(词 => [项.名称, 项.描述, 项.场景, ...(项.标签 || [])].join(' ').normalize('NFKC').toLocaleLowerCase().includes(词)))
  const 场景列表 = [...new Set(ALL_TEMPLATES.flatMap(项 => 项.场景 ? [项.场景] : []))]

  const 关闭模板库 = () => {
    set预览模板(null)
    set创建错误('')
    关闭?.()
  }

  const 使用模板 = async (模板: 模板项) => {
    if (!onSelect) { set预览模板(模板); return }
    if (正在创建) return
    set创建错误('')
    set正在创建(模板.id)
    try {
      if (模板.分类 === 'ppt') await restoreTemplatePhotos(生成演示模板文稿(模板))
      await onSelect(模板)
      set预览模板(null)
    } catch (error) {
      set创建错误(error instanceof Error ? error.message : '模板创建失败，请重试')
    } finally { set正在创建(null) }
  }

  return (
    <Drawer
      title={预览模板 ? '模板预览' : '模板库'}
      placement="right"
      width={预览模板 ? 'min(600px, 100vw)' : 'min(800px, 100vw)'}
      open={打开}
      onClose={关闭模板库}
      extra={预览模板 ? <Button type="primary" loading={正在创建 === 预览模板.id} disabled={!!正在创建} onClick={() => { void 使用模板(预览模板) }}>使用此模板</Button> : undefined}
    >
      {创建错误 && <Alert className="template-library__error" type="error" showIcon message={创建错误} />}
      {预览模板 ? <div className="template-library__detail">
        <Button type="link" onClick={() => set预览模板(null)}>返回模板库</Button>
        <h3>{预览模板.名称}</h3>
        <p>{预览模板.描述}</p>
        {预览模板.分类 === 'ppt' ? <>
          <p>9 页完整示例，含主题摄影、图表、流程、行动表格与页码。文字和图表数据均可编辑，示例数据请按实际情况替换。</p>
          <PresentationTemplatePreview template={预览模板} all />
        </> : <div className="template-library__document" dangerouslySetInnerHTML={{ __html: 净化富文本(预览模板.内容) }} />}
      </div> : <div className="template-library">
        <div className="template-library__search"><Input.Search aria-label="搜索模板" placeholder="搜索名称、用途或标签" allowClear value={搜索} onChange={event => set搜索(event.target.value)} /><Button type={仅推荐 ? 'primary' : 'default'} aria-pressed={仅推荐} onClick={() => { set仅推荐(!仅推荐); set当前分类('all'); set场景('all') }}>精选推荐</Button></div>
        <div className="template-library__filters" role="group" aria-label="模板分类">
          {分类列表.map(({ 键, 名称 }) => (
            <Button key={键} type={当前分类 === 键 ? 'primary' : 'default'} aria-pressed={当前分类 === 键} onClick={() => { set当前分类(键); set场景('all'); set仅推荐(false) }}>{名称}</Button>
          ))}
        </div>
        <div className="template-library__filters" role="group" aria-label="模板用途"><Button type={场景 === 'all' ? 'primary' : 'default'} aria-pressed={场景 === 'all'} onClick={() => set场景('all')}>全部用途</Button>{场景列表.map(项 => <Button key={项} type={场景 === 项 ? 'primary' : 'default'} aria-pressed={场景 === 项} onClick={() => { set场景(项); set当前分类('ppt'); set仅推荐(false) }}>{项}</Button>)}</div>
        <p className="template-library__count" role="status">找到 {过滤模板.length} 个模板 · 内置模板无需联网，示例数据可修改</p>
        <div className="template-library__grid">
          {过滤模板.map((模板) => (
            <article className="template-library__card" key={模板.id}>
              <div className={`template-library__thumb template-library__thumb--${模板.分类}`} aria-hidden="true">
                {模板.分类 === 'ppt' ? <PresentationTemplatePreview template={模板} /> : <div dangerouslySetInnerHTML={{ __html: 净化富文本(模板.内容) }} />}
              </div>
              <div className="template-library__tags"><Tag>{分类名称[模板.分类]}</Tag>{模板.标签?.map((标签) => <Tag key={标签}>{标签}</Tag>)}</div>
              <button type="button" className="template-library__preview-trigger" onClick={() => set预览模板(模板)} aria-label={`预览${模板.名称}`}>
                <strong>{模板.名称}</strong>
                <span>{模板.描述}</span>
              </button>
              <Button type="primary" loading={正在创建 === 模板.id} disabled={!!正在创建} onClick={() => { void 使用模板(模板) }}>使用模板</Button>
            </article>
          ))}
        </div>
        {!过滤模板.length ? <Empty description="没有匹配的模板"><Button onClick={() => { set搜索(''); set当前分类('all'); set场景('all'); set仅推荐(false) }}>重置筛选</Button></Empty> : null}
      </div>}
    </Drawer>
  )
}

export default TemplateLibrary
