import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Input, Tag } from 'antd'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cloudCall } from './CloudProvider'
import Icon from '../components/Icon'
import { useSettings } from '../store/settingsStore'
import './zoteroDocs.css'

interface 目录项 { title: string; route: string; summary: string }
interface 正文 { route: string; markdown: string; source: string }

/** 按一级/二级标题切段，供知识库引用与提问复用。 */
export function 切分段落(markdown: string): { location: string; text: string }[] {
  const 行 = markdown.split(/\r?\n/)
  const 段: { location: string; text: string }[] = []
  let 标题 = '', 缓冲: string[] = []
  const 提交 = () => {
    const 正文 = 缓冲.join('\n').trim()
    if (正文) 段.push({ location: 标题 || '正文', text: 正文 })
    缓冲 = []
  }
  for (const 行内容 of 行) {
    const 匹配 = /^(#{1,3})\s+(.+)$/.exec(行内容)
    if (匹配) { 提交(); 标题 = 匹配[2].trim() }
    缓冲.push(行内容)
  }
  提交()
  return 段
}

export default function ZoteroDocs({ 提问 }: { 提问: (来源: { 名称: string; 段落: { location: string; text: string }[] }) => void }) {
  const { message, modal } = App.useApp()
  const { 语言 } = useSettings()
  const en = 语言 === 'en-US', t = (zh: string, english: string) => en ? english : zh
  const [目录, 设目录] = useState<目录项[]>([])
  const [关键词, 设关键词] = useState('')
  const [加载中, 设加载中] = useState(true)
  const [错误, 设错误] = useState('')
  const [当前, 设当前] = useState<正文 | null>(null)
  const [读取中, 设读取中] = useState(false)
  const 项目 = useRef(0)

  const 载入目录 = async () => {
    设加载中(true); 设错误('')
    try {
      const result = await cloudCall<{ items: 目录项[] }>('zoteroIndex')
      设目录(Array.isArray(result?.items) ? result.items : [])
    } catch (error) {
      设错误(error instanceof Error ? error.message : t('读取资料目录失败', 'Could not load the index'))
    } finally { 设加载中(false) }
  }
  useEffect(() => { void 载入目录() }, [])

  const 打开 = async (项: 目录项) => {
    const 序号 = ++项目.current
    设读取中(true); 设当前(null)
    try {
      const result = await cloudCall<正文>('zoteroRead', { route: 项.route })
      if (序号 !== 项目.current) return
      设当前(result)
    } catch (error) {
      if (序号 === 项目.current) modal.error({ title: t('打开资料失败', 'Could not open the article'), content: error instanceof Error ? error.message : t('请稍后重试', 'Please try again') })
    } finally { if (序号 === 项目.current) 设读取中(false) }
  }

  const 筛选后 = useMemo(() => {
    const 词 = 关键词.trim().toLocaleLowerCase()
    if (!词) return 目录
    return 目录.filter(项 => (项.title + ' ' + 项.summary + ' ' + 项.route).toLocaleLowerCase().includes(词))
  }, [目录, 关键词])

  const 加入问答 = () => {
    if (!当前) return
    const 段落 = 切分段落(当前.markdown)
    if (!段落.length) { message.warning(t('这篇资料没有可用正文', 'This article has no body text')); return }
    const 标题 = 目录.find(项 => 项.route === 当前.route)?.title || 当前.route
    提问({ 名称: 'Zotero 百科 · ' + 标题, 段落 })
  }

  return <section className="seal-zotero" aria-label={t('Zotero 百科', 'Zotero encyclopedia')}>
    <div className="seal-zotero__intro">
      <Icon name="knowledge" size={20} />
      <div>
        <strong>{t('Zotero 百科', 'Zotero encyclopedia')}</strong>
        <p>{t('来自 Zotero 中文社区的开源中文文档。可以按标题浏览，也可以像知识库文档一样引用并提问。', 'Community-maintained Chinese documentation. Browse by title, or cite it and ask questions like any knowledge base document.')}</p>
      </div>
      <Button loading={加载中} onClick={() => void 载入目录()} icon={<Icon name="retry" size={16} />}>{t('刷新目录', 'Refresh')}</Button>
    </div>
    <Input allowClear prefix={<Icon name="search" size={16} />} aria-label={t('搜索资料标题', 'Search article titles')} placeholder={t('搜索标题或关键词，例如「茉莉花」「同步」「引文」', 'Search titles or keywords')} value={关键词} onChange={event => 设关键词(event.target.value)} />
    {错误 ? <p className="seal-zotero__error" role="status">{错误}</p> : null}
    <div className="seal-zotero__body">
      <ul className="seal-zotero__list" aria-label={t('资料目录', 'Article index')}>
        {加载中 && !目录.length ? <li className="seal-zotero__empty">{t('正在读取目录…', 'Loading index…')}</li> : null}
        {!加载中 && !筛选后.length ? <li className="seal-zotero__empty">{t('没有匹配的资料', 'No matching articles')}</li> : null}
        {筛选后.map(项 => <li key={项.route}>
          <button type="button" aria-pressed={当前?.route === 项.route} onClick={() => void 打开(项)}>
            <strong>{项.title}</strong>
            {项.summary ? <span>{项.summary}</span> : null}
          </button>
        </li>)}
      </ul>
      <article className="seal-zotero__article">
        {读取中 ? <p className="seal-zotero__empty" role="status">{t('正在读取资料…', 'Loading article…')}</p>
          : 当前 ? <>
            <div className="seal-zotero__toolbar">
              <Tag color="blue">{t('Zotero 中文社区', 'Zotero Chinese community')}</Tag>
              <span className="seal-zotero__route" translate="no">{当前.route}</span>
              <Button size="small" icon={<Icon name="ai" size={15} />} onClick={加入问答}>{t('引用并提问', 'Cite and ask')}</Button>
              <Button size="small" type="text" icon={<Icon name="share" size={15} />} onClick={() => { void navigator.clipboard.writeText(当前.source).then(() => message.success(t('原文链接已复制', 'Source link copied'))).catch(() => message.error(t('复制失败，请手动打开原文', 'Copy failed; open the source manually'))) }}>{t('原文链接', 'Source')}</Button>
            </div>
            <div className="seal-zotero__markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}
                urlTransform={url => /^https?:\/\//i.test(url) ? url : defaultUrlTransform(url)}
                components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>, img: ({ alt, src }) => <img alt={alt || t('资料插图', 'Illustration')} src={src} loading="lazy" referrerPolicy="no-referrer" /> }}>
                {当前.markdown}
              </ReactMarkdown>
            </div>
          </>
            : <p className="seal-zotero__empty">{t('从左侧选择一篇资料开始阅读。', 'Pick an article on the left to start reading.')}</p>}
      </article>
    </div>
  </section>
}
