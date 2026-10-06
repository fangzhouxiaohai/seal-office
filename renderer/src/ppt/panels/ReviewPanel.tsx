import { useState } from 'react'
import { App } from 'antd'
import { 更新幻灯片, type 幻灯片, type 演示文稿 } from '../deck'
import { 应用检查修正, 可自动修正, 执行本机检查, 忽略检查项, 类型清单, type 检查项 } from '../model/proofing'
import { 差异片段, 单字表规模, 转换幻灯片, 转换简繁词组, 词组表规模, type 转换方向 } from '../model/langConvert'
import ComparePanel from './ComparePanel'
import DocumentSecurityPanel from './DocumentSecurityPanel'
import './review.css'

interface Props {
  文稿: 演示文稿
  页: 幻灯片
  只读: boolean
  区域: '检查' | '转换' | '定稿' | '比对'
  转换方向: 转换方向
  当前路径?: string
  on区域变化: (区域: '检查' | '转换' | '定稿' | '比对') => void
  on方向变化: (方向: 转换方向) => void
  on修改: (文稿: 演示文稿) => void
}

const 类型提示: Record<string, string> = {
  重复词: '紧接重复的词组', 常见错字: '常见错别字', 标点: '标点用法', 空白: '多余空白',
  格式: '字号设置', 文字溢出: '文字可能超出文本框', 缺失资源: '对象引用的资源缺失', 链接: '链接协议不安全',
}

const 区域名称: Array<{ 值: Props['区域']; 文案: string }> = [
  { 值: '检查', 文案: '排版检查' },
  { 值: '转换', 文案: '繁简转换' },
  { 值: '定稿', 文案: '文档定稿' },
  { 值: '比对', 文案: '文档比对' },
]

/** 审阅面板：本机排版检查、繁简转换、文档定稿与文档比对；智能语义校对属于模型服务，不在此冒充。 */
export default function ReviewPanel({ 文稿, 页, 只读, 区域, 转换方向, 当前路径, on区域变化, on方向变化, on修改 }: Props) {
  const { modal } = App.useApp()
  const [忽略集, set忽略集] = useState<Set<string>>(new Set())
  const [范围, set范围] = useState<'当前页' | '全部页'>('当前页')
  const 检查项列表 = 执行本机检查(文稿, { 忽略: 忽略集 })
  const 失败 = (标题: string, 错误: unknown) => modal.error({ title: 标题, content: 错误 instanceof Error ? 错误.message : '操作失败' })
  const 修正 = (项: 检查项) => {
    if (只读) return
    try { on修改(应用检查修正(文稿, 项)) } catch (错误) { 失败('修正失败', 错误) }
  }
  const 目标页 = 范围 === '当前页' ? [页] : 文稿.幻灯片列表
  const 预览 = 目标页.map(页项 => ({
    页项,
    条目: 页项.文本框列表.map(框 => {
      const 结果 = 转换简繁词组(框.text ?? '', 转换方向)
      return { 框, 结果, 片段: 差异片段(框.text ?? '', 结果.文本) }
    }).filter(条目 => 条目.结果.文本 !== (条目.框.text ?? '')),
  })).filter(项 => 项.条目.length > 0)
  const 改动数 = 预览.reduce((累计, 项) => 累计 + 项.条目.length, 0)
  const 应用转换 = () => {
    if (只读) return
    try {
      if (范围 === '当前页') on修改(更新幻灯片(文稿, 页.id, { 文本框列表: 转换幻灯片(页, 转换方向).文本框列表 }))
      else on修改({ ...文稿, 幻灯片列表: 文稿.幻灯片列表.map(页项 => 转换幻灯片(页项, 转换方向)) })
    } catch (错误) { 失败('繁简转换失败', 错误) }
  }
  return <aside className="wps-ppt-properties wps-ppt-review" aria-label="审阅">
    <h2>审阅</h2>
    <div className="wps-ppt-properties__actions">
      {区域名称.map(项 => <button key={项.值} type="button" aria-pressed={区域 === 项.值} onClick={() => on区域变化(项.值)}>{项.文案}</button>)}
    </div>
    {区域 === '检查'
      ? <fieldset><legend>本机排版检查（{检查项列表.length}）</legend>
          <p>本机规则只检查{类型清单.map(类型 => 类型提示[类型] ?? 类型).join('、')}。语义与表达校对需要配置模型服务，不在此冒充智能分析。</p>
          {检查项列表.length === 0 && <p>未发现问题。</p>}
          <ol className="wps-review-list">
            {检查项列表.map(项 => {
              const 序号 = 文稿.幻灯片列表.findIndex(页项 => 页项.id === 项.页标识) + 1
              return <li key={项.id}>
                <p className="wps-review-list__meta">第 {序号} 页 · {项.类型}：{项.说明}</p>
                <p className="wps-review-list__text">{项.原文}{项.建议 ? ` → ${项.建议}` : ''}</p>
                <div className="wps-ppt-properties__actions">
                  <button type="button" disabled={只读 || !可自动修正(项)} onClick={() => 修正(项)}>修正</button>
                  <button type="button" onClick={() => set忽略集(集合 => 忽略检查项(集合, 项))}>忽略</button>
                </div>
              </li>
            })}
          </ol>
        </fieldset>
      : 区域 === '转换'
        ? <fieldset disabled={只读}><legend>繁简转换差异预览</legend>
            <label>方向<select aria-label="转换方向" value={转换方向} onChange={事件 => on方向变化(事件.target.value as 转换方向)}><option value="繁">简转繁</option><option value="简">繁转简</option></select></label>
            <label>范围<select aria-label="转换范围" value={范围} onChange={事件 => set范围(事件.target.value as '当前页' | '全部页')}><option value="当前页">当前页</option><option value="全部页">全部页</option></select></label>
            <p>本机词组转换覆盖 {词组表规模} 个词组和 {单字表规模} 个单字；未收录的字词保持原样，不会猜测替换。转换保留段落与片段格式，应用后可用一次撤销还原。</p>
            {改动数 === 0 && <p>没有可转换的文本框。</p>}
            <ol className="wps-review-list">
              {预览.flatMap(({ 页项, 条目 }) => 条目.map(({ 框, 结果, 片段 }) => <li key={`${页项.id}-${框.id}`}>
                <p className="wps-review-list__meta">第 {文稿.幻灯片列表.findIndex(候选 => 候选.id === 页项.id) + 1} 页 · {框.text.slice(0, 12) || '空文本'}</p>
                <p className="wps-review-list__text">{片段.map((段, 索引) => 段.改变 ? <mark key={索引}>{段.文本}</mark> : <span key={索引}>{段.文本}</span>)}</p>
                <p className="wps-review-list__meta">共 {结果.转换数} 处转换</p>
              </li>))}
            </ol>
            <div className="wps-ppt-properties__actions"><button type="button" disabled={只读 || 改动数 === 0} onClick={应用转换}>应用转换</button></div>
          </fieldset>
        : 区域 === '定稿'
          ? <DocumentSecurityPanel 文稿={文稿} 只读={只读} on修改={on修改} />
          : <ComparePanel 当前路径={当前路径} />}
  </aside>
}
