import { memo, useMemo, useState, isValidElement, type ReactNode } from 'react'
import { App as AntdApp, Button } from 'antd'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { common, createLowlight } from 'lowlight'
import powershell from 'highlight.js/lib/languages/powershell'
import type { Element, RootContent } from 'hast'
import Icon from '../components/Icon'
import { 桥接 } from '../ipc/bridge'

const highlighter = createLowlight(common)
highlighter.register({ powershell })
const markdownParser = unified().use(remarkParse).use(remarkGfm)
const 文本语言 = new Set(['text', 'txt', 'plaintext', 'plain'])
const 排版语言 = new Set(['md', 'markdown'])
const 语言名称: Record<string, string> = { js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', py: 'Python', python: 'Python', html: 'HTML', xml: 'XML', css: 'CSS', json: 'JSON', sql: 'SQL', bash: 'Bash', sh: 'Shell', shell: 'Shell', powershell: 'PowerShell', ps1: 'PowerShell', java: 'Java', cpp: 'C++', c: 'C', csharp: 'C#', cs: 'C#', go: 'Go', rust: 'Rust', ruby: 'Ruby', php: 'PHP', yaml: 'YAML', yml: 'YAML' }

/** Only strip a fence when the entire reply is one block. CommonMark handles mixed/nested blocks. */
export function 单一代码块(内容: string): { 语言: string; 内容: string } | null {
  const 开头 = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n/.exec(内容)
  if (!开头 || (开头[1][0] === '`' && 开头[2].includes('`'))) return null
  const 正文 = 内容.slice(开头[0].length)
  const 关闭 = new RegExp(`^ {0,3}${开头[1][0]}{${开头[1].length},}[ \\t]*\\r?$`, 'm').exec(正文)
  if (关闭 && 正文.slice(关闭.index + 关闭[0].length).trim()) return null
  return { 语言: 开头[2].trim().split(/\s/)[0].toLowerCase(), 内容: 关闭 ? 正文.slice(0, 关闭.index).replace(/\r?\n$/, '') : 正文 }
}

export function 是Markdown(内容: string): boolean {
  function 含排版(节点: { type: string; children?: readonly { type: string }[] }): boolean {
    if (节点.type === 'root' || 节点.type === 'paragraph') return 节点.children?.some(含排版) ?? false
    // Literal HTML stays visible as TXT unless there is actual Markdown syntax.
    return 节点.type !== 'text' && 节点.type !== 'html'
  }
  return 含排版(markdownParser.parse(内容))
}

function 高亮节点(节点: RootContent, 键: number): ReactNode {
  if (节点.type === 'text') return 节点.value
  if (节点.type !== 'element') return null
  const 元素 = 节点 as Element
  return <span key={键} className={Array.isArray(元素.properties.className) ? 元素.properties.className.join(' ') : undefined}>{元素.children.map(高亮节点)}</span>
}

function 复制按钮({ 内容, 名称 }: { 内容: string; 名称: string }) {
  const { message } = AntdApp.useApp()
  const [复制中, set复制中] = useState(false)
  const 复制 = async () => {
    if (复制中) return
    set复制中(true)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('剪贴板不可用')
      await navigator.clipboard.writeText(内容)
      message.success('已复制')
    } catch { message.error('复制失败，请选中内容手动复制') }
    finally { set复制中(false) }
  }
  return <Button type="text" size="small" icon={<Icon name="copy" size={14} />} aria-label={`复制${名称}`} title={`复制${名称}`} loading={复制中} onClick={() => void 复制()}>复制</Button>
}

function 内容面板({ 类型, 名称, 原文, children }: { 类型: string; 名称: string; 原文: string; children: ReactNode }) {
  return <section className={`assistant-result assistant-result--${类型}`} aria-label={`${名称}内容`} data-content-type={类型}>
    <div className="assistant-result__heading"><span>{名称}</span></div>
    <div className="assistant-result__content">{children}</div>
    <footer className="assistant-result__footer"><复制按钮 内容={原文} 名称={名称 === 'TXT' ? '文本' : 名称 === 'Markdown' ? 'Markdown 原文' : 名称 === '代码' ? '代码' : `${名称}代码`} /></footer>
  </section>
}

const 代码面板 = memo(function 代码面板({ 语言, 内容 }: { 语言: string; 内容: string }) {
  const 高亮 = useMemo(() => {
    // Keep large or unknown blocks readable; never execute model-provided markup/code.
    if (内容.length > 100000) return null
    try {
      if (语言 && highlighter.registered(语言)) return highlighter.highlight(语言, 内容)
      if (!语言 && 内容.length <= 16000) {
        const 自动 = highlighter.highlightAuto(内容)
        return (自动.data?.relevance ?? 0) >= 5 ? 自动 : null
      }
    } catch { /* Invalid/unfinished syntax remains plain code while streaming. */ }
    return null
  }, [语言, 内容])
  const 名称 = 语言名称[语言 || 高亮?.data?.language || ''] || 语言 || '代码'
  return <内容面板 类型="code" 名称={名称} 原文={内容}><pre tabIndex={0} aria-label={`${名称}代码正文`}><code className="hljs">{高亮 ? 高亮.children.map(高亮节点) : 内容}</code></pre></内容面板>
})

function Markdown正文({ 内容 }: { 内容: string }) {
  const { message } = AntdApp.useApp()
  return <div className="assistant-markdown assistant-message__body"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
    pre: ({ children }) => {
      const 代码 = isValidElement<{ children?: ReactNode; className?: string }>(children) ? children.props : null
      const 语言 = /language-(\S+)/.exec(代码?.className ?? '')?.[1]?.toLowerCase() ?? ''
      const 原文 = String(代码?.children ?? '').replace(/\n$/, '')
      return 文本语言.has(语言) ? <内容面板 类型="text" 名称="TXT" 原文={原文}><div className="assistant-plaintext">{原文}</div></内容面板> : <代码面板 语言={语言} 内容={原文} />
    },
    table: ({ children }) => <div className="assistant-markdown__table" tabIndex={0} aria-label="Markdown 表格"><table>{children}</table></div>,
    a: ({ href, children }) => href && /^(https?:|mailto:)/i.test(href) ? <a href={href} onClick={(事件) => {
      事件.preventDefault()
      void 桥接.openExternal(href).then((结果) => { if (!结果.成功) message.error('无法打开链接，请复制地址后在浏览器打开') }).catch(() => message.error('无法打开链接，请复制地址后在浏览器打开'))
    }}>{children}</a> : <span>{children}</span>,
    // Remote images must not silently send a request when opening a saved reply.
    img: ({ alt }) => <span className="assistant-markdown__image">[图片：{alt || '未命名图片'}]</span>,
  }}>{内容}</Markdown></div>
}

export default memo(function AssistantContent({ 内容 }: { 内容: string }) {
  const 代码块 = useMemo(() => 单一代码块(内容), [内容])
  const 排版 = useMemo(() => 代码块 && !排版语言.has(代码块.语言) ? false : 是Markdown(代码块?.内容 ?? 内容), [内容, 代码块])
  if (代码块 && !排版语言.has(代码块.语言)) return 文本语言.has(代码块.语言)
    ? <内容面板 类型="text" 名称="TXT" 原文={代码块.内容}><div className="assistant-plaintext assistant-message__body">{代码块.内容}</div></内容面板>
    : <代码面板 {...代码块} />
  const 正文 = 代码块?.内容 ?? 内容
  return 代码块 || 排版
    ? <内容面板 类型="markdown" 名称="Markdown" 原文={正文}><Markdown正文 内容={正文} /></内容面板>
    : <内容面板 类型="text" 名称="TXT" 原文={正文}><div className="assistant-plaintext assistant-message__body">{正文}</div></内容面板>
})
