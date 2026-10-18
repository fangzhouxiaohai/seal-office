import { Button, Input, Select } from 'antd'
import { 提取修订 } from './review'
export type RevisionView = 'markup' | 'final' | 'original'
const names: Record<string, string> = { ins: '插入', del: '删除', moveFrom: '移动来源', moveTo: '移动目的', rPrChange: '字符格式', pPrChange: '段落格式', sectPrChange: '节格式', tblPrChange: '表格格式', tblPrExChange: '表格属性', trPrChange: '行格式', tcPrChange: '单元格格式' }
export default function RevisionPanel({ html, author, setAuthor, view, setView, busy, readOnly, resolve }: { html: string; author: string; setAuthor: (value: string) => void; view: RevisionView; setView: (value: RevisionView) => void; busy: boolean; readOnly: boolean; resolve: (action: 'accept' | 'reject', id?: string, part?: string) => void }) {
  const entries = 提取修订(html)
  return <aside className="seal-revisions" aria-label="修订历史">
    <div className="seal-revisions__tools"><strong>修订历史（{entries.length}）</strong><label>审阅作者<Input aria-label="审阅作者" value={author} maxLength={512} onChange={event => setAuthor(event.target.value)} /></label><Select aria-label="修订显示" value={view} onChange={setView} options={[{ value: 'markup', label: '全部标记' }, { value: 'final', label: '最终正文' }, { value: 'original', label: '原始正文' }]} />
    <Button disabled={readOnly || !entries.length} loading={busy} onClick={() => resolve('accept')}>接受全部</Button><Button disabled={readOnly || !entries.length} loading={busy} onClick={() => resolve('reject')}>拒绝全部</Button></div>
    <ol>{entries.map(entry => <li key={`${entry.部件}:${entry.标识}`}><div><b>{names[entry.类型] || entry.类型}</b> · {entry.作者 || '作者未记录'} {entry.时间 ? <time dateTime={entry.时间}>{new Date(entry.时间).toLocaleString()}</time> : '时间未记录'}{entry.部件 !== 'word/document.xml' && <small> · {entry.部件}</small>}</div><p>{entry.文本.slice(0, 240) || '原生结构历史；审阅后会重新呈现文档'}</p><Button disabled={readOnly} loading={busy} onClick={() => resolve('accept', entry.标识, entry.部件)} aria-label={`接受修订${entry.标识}`}>接受</Button><Button disabled={readOnly} loading={busy} onClick={() => resolve('reject', entry.标识, entry.部件)} aria-label={`拒绝修订${entry.标识}`}>拒绝</Button></li>)}</ol>
    {!entries.length && <p>文档中没有未审阅的修订。</p>}
  </aside>
}
