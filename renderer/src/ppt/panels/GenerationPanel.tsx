import React from 'react'
import { App } from 'antd'
import { 桥接, type 生成页面项, type 生成提纲项, type 生成图形节点, type 生成图形连线, type 美化建议项, type 导入提纲结果 } from '../../ipc/bridge'
import { 读取当前幻灯片, type 幻灯片, type 演示文稿 } from '../deck'
import { 应用提纲生成, 应用单页生成, 应用美化建议, 页面版本表, 构建生成图形, 插入生成对象 } from '../model/generation'
import './review.css'

interface Props {
  文稿: 演示文稿
  页: 幻灯片
  只读: boolean
  on修改: (文稿: 演示文稿) => void
}

type 视图 = '提纲' | '单页' | '美化' | '图形' | '导入'

const 视图列表: Array<{ 值: 视图; 文案: string }> = [
  { 值: '提纲', 文案: '提纲与文稿' },
  { 值: '单页', 文案: '封面与单页' },
  { 值: '美化', 文案: '智能美化' },
  { 值: '图形', 文案: '智能图形' },
  { 值: '导入', 文案: '文档生成' },
]

let 序号 = 0
const 新请求标识 = () => `gen-${Date.now()}-${(序号 += 1)}`

/** 生成面板：全部内容先预览再应用；未配置模型时给出配置引导而不是空结果。 */
export default function GenerationPanel({ 文稿, 页, 只读, on修改 }: Props) {
  const { modal, message } = App.useApp()
  const [视图, set视图] = React.useState<视图>('提纲')
  const [运行中, set运行中] = React.useState(false)
  const [主题, set主题] = React.useState('')
  const [受众, set受众] = React.useState('')
  const [页数, set页数] = React.useState(6)
  const [风格, set风格] = React.useState('')
  const [提纲, set提纲] = React.useState<生成提纲项[] | null>(null)
  const [正文, set正文] = React.useState<生成页面项[] | null>(null)
  const [单页内容, set单页内容] = React.useState('')
  const [单页候选, set单页候选] = React.useState<生成页面项 | null>(null)
  const [建议, set建议] = React.useState<美化建议项[] | null>(null)
  const [图形主题, set图形主题] = React.useState('')
  const [图形类型, set图形类型] = React.useState<'流程' | '层级' | '循环' | '脑图'>('流程')
  const [图形候选, set图形候选] = React.useState<{ 节点: 生成图形节点[]; 连线: 生成图形连线[] } | null>(null)
  const [导入结果, set导入Result] = React.useState<导入提纲结果 | null>(null)

  const 失败 = (标题: string, 错误: unknown) => modal.error({ title: 标题, content: 错误 instanceof Error ? 错误.message : '操作失败' })
  const 执行 = async (标题: string, 任务: () => Promise<void>) => {
    if (只读) return
    set运行中(true)
    try { await 任务() }
    catch (错误) { 失败(标题, 错误) }
    finally { set运行中(false) }
  }

  const 生成提纲 = () => 执行('提纲生成失败', async () => {
    const 结果 = await 桥接.presentationGeneration.outline({ 请求标识: 新请求标识(), 主题, 受众: 受众 || undefined, 页数, 风格: 风格 || undefined })
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '提纲生成失败')
    set提纲(结果.数据.提纲)
    set正文(null)
  })

  const 生成正文 = () => 执行('正文生成失败', async () => {
    if (!提纲) throw new Error('请先生成并确认提纲')
    const 结果 = await 桥接.presentationGeneration.pages({ 请求标识: 新请求标识(), 提纲 })
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '正文生成失败')
    set正文(结果.数据.页面)
  })

  const 插入正文 = () => 执行('插入生成结果失败', async () => {
    if (!正文) throw new Error('请先生成正文')
    const 位置 = Math.min(文稿.当前索引 + 1, 文稿.幻灯片列表.length)
    on修改(应用提纲生成(文稿, 正文, { 插入位置: 位置 }))
    set提纲(null); set正文(null)
    message.success(`已插入 ${正文.length} 页`)
  })

  const 生成单页 = () => 执行('单页生成失败', async () => {
    const 结果 = await 桥接.presentationGeneration.singlePage({ 请求标识: 新请求标识(), 内容: 单页内容 })
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '单页生成失败')
    set单页候选(结果.数据.页面)
  })

  const 插入单页 = () => 执行('插入单页失败', async () => {
    if (!单页候选) throw new Error('请先生成单页候选')
    const 版本表 = 页面版本表(文稿)
    on修改(应用单页生成(文稿, 单页候选, { 版本表 }))
    set单页候选(null)
    message.success('已插入 1 页')
  })

  const 生成美化 = () => 执行('智能美化失败', async () => {
    const 页面列表 = 文稿.幻灯片列表.map((项) => ({ 页标识: 项.id, 版式: 项.版式 }))
    const 结果 = await 桥接.presentationGeneration.beautify({ 请求标识: 新请求标识(), 页面列表, 主题摘要: 文稿.主题?.名称 })
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '智能美化失败')
    set建议(结果.数据.建议)
  })

  const 应用美化 = () => 执行('应用美化失败', async () => {
    if (!建议) throw new Error('请先生成美化建议')
    const 版本表 = 页面版本表(文稿)
    const 核对 = await 桥接.presentationGeneration.validateCandidates(
      建议,
      文稿.幻灯片列表.map((项) => ({ 页标识: 项.id, 版本: 版本表[项.id] })),
      版本表,
    )
    if (!核对.成功) throw new Error(核对.错误 ?? '候选核对失败')
    on修改(应用美化建议(文稿, 建议, 版本表))
    set建议(null)
    message.success('已应用美化建议，可用一次撤销还原')
  })

  const 生成图形 = () => 执行('智能图形生成失败', async () => {
    const 结果 = await 桥接.presentationGeneration.diagram({ 请求标识: 新请求标识(), 主题: 图形主题, 类型: 图形类型 })
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '智能图形生成失败')
    set图形候选(结果.数据)
  })

  const 插入图形 = () => 执行('插入图形失败', async () => {
    if (!图形候选) throw new Error('请先生成图形候选')
    const 目标 = 读取当前幻灯片(文稿) ?? 页
    if (!目标) throw new Error('没有可插入图形的页面')
    const 对象 = 构建生成图形(图形类型, 图形候选.节点, 图形候选.连线)
    const 新页 = 插入生成对象(目标, 对象)
    on修改({ ...文稿, 幻灯片列表: 文稿.幻灯片列表.map((项) => (项.id === 目标.id ? 新页 : 项)) })
    set图形候选(null)
    message.success('已插入可编辑图形')
  })

  const 导入文档 = () => 执行('文档导入失败', async () => {
    const 路径 = await 桥接.showOpenDialog('word' as const)
    if (!路径) return
    const 读取 = await 桥接.readFile(路径)
    if (!读取.成功 || !读取.内容) throw new Error(读取.错误 ?? '文档读取失败')
    const 结果 = await 桥接.presentationGeneration.readOutline({ 名称: 路径.split(/[\\/]/).pop() ?? '文档', 数据: 读取.内容 })
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '提纲解析失败')
    set导入Result(结果.数据)
  })

  return <aside className="wps-ppt-properties wps-generation" aria-label="智能生成">
    <h2>智能生成</h2>
    <div className="wps-ppt-properties__actions">
      {视图列表.map((项) => <button key={项.值} type="button" aria-pressed={视图 === 项.值} onClick={() => set视图(项.值)}>{项.文案}</button>)}
    </div>
    <p className="wps-generation__hint">所有内容先预览再应用；缺少模型配置时会说明原因，不会返回空结果。</p>

    {视图 === '提纲' && <fieldset disabled={只读 || 运行中}>
      <legend>提纲与文稿生成</legend>
      <label>主题<input aria-label="演示主题" value={主题} onChange={(事件) => set主题(事件.target.value)} /></label>
      <label>受众<input aria-label="演示受众" value={受众} onChange={(事件) => set受众(事件.target.value)} /></label>
      <label>页数<input aria-label="演示页数" type="number" min={1} max={60} value={页数} onChange={(事件) => set页数(Number(事件.target.value))} /></label>
      <label>风格<input aria-label="演示风格" value={风格} onChange={(事件) => set风格(事件.target.value)} /></label>
      <div className="wps-ppt-properties__actions">
        <button type="button" onClick={生成提纲} disabled={!主题.trim()}>生成提纲</button>
        <button type="button" onClick={生成正文} disabled={!提纲}>生成正文</button>
        <button type="button" onClick={插入正文} disabled={!正文}>插入到文稿</button>
      </div>
      {提纲 && <ol className="wps-review-list">{提纲.map((项) => <li key={项.页标识}>
        <p className="wps-review-list__meta">{项.版式}</p>
        <p className="wps-review-list__text">{项.标题}</p>
        {项.要点.length > 0 && <p className="wps-review-list__meta">{项.要点.join('；')}</p>}
      </li>)}</ol>}
      {正文 && <div><h3>正文预览（{正文.length} 页）</h3><ol className="wps-review-list">{正文.map((项) => <li key={项.页标识}>
        <p className="wps-review-list__meta">{项.版式 ?? '标题和内容'}</p>
        <p className="wps-review-list__text">{项.标题}</p>
        <p className="wps-review-list__meta">{[项.正文, ...项.要点].filter(Boolean).join(' / ')}</p>
      </li>)}</ol></div>}
    </fieldset>}

    {视图 === '单页' && <fieldset disabled={只读 || 运行中}>
      <legend>封面与单页生成</legend>
      <label>内容<input aria-label="单页内容" value={单页内容} onChange={(事件) => set单页内容(事件.target.value)} /></label>
      <div className="wps-ppt-properties__actions">
        <button type="button" onClick={生成单页} disabled={!单页内容.trim()}>生成封面</button>
        <button type="button" onClick={插入单页} disabled={!单页候选}>插入到当前页之后</button>
      </div>
      {单页候选 && <div>
        <p className="wps-review-list__text">{单页候选.标题}</p>
        <p className="wps-review-list__meta">{[单页候选.正文, ...单页候选.要点].filter(Boolean).join(' / ')}</p>
      </div>}
    </fieldset>}

    {视图 === '美化' && <fieldset disabled={只读 || 运行中}>
      <legend>智能美化</legend>
      <p>模型会分析内容与主题后给出结构化布局建议，应用前核对原内容版本，可用一次撤销还原。</p>
      <div className="wps-ppt-properties__actions">
        <button type="button" onClick={生成美化} disabled={文稿.幻灯片列表.length === 0}>分析并生成建议</button>
        <button type="button" onClick={应用美化} disabled={!建议}>应用建议</button>
      </div>
      {建议 && <ol className="wps-review-list">{建议.map((项) => <li key={项.页标识}>
        <p className="wps-review-list__meta">第 {文稿.幻灯片列表.findIndex((页项) => 页项.id === 项.页标识) + 1} 页 · {项.对齐} · {项.字号建议} 号 · {项.背景建议}</p>
        {项.说明 && <p className="wps-review-list__text">{项.说明}</p>}
      </li>)}</ol>}
    </fieldset>}

    {视图 === '图形' && <fieldset disabled={只读 || 运行中}>
      <legend>智能图形与思维导图</legend>
      <label>主题<input aria-label="图形主题" value={图形主题} onChange={(事件) => set图形主题(事件.target.value)} /></label>
      <label>类型<select aria-label="图形类型" value={图形类型} onChange={(事件) => set图形类型(事件.target.value as typeof 图形类型)}>
        <option value="流程">流程</option><option value="层级">层级</option><option value="循环">循环</option><option value="脑图">脑图</option>
      </select></label>
      <div className="wps-ppt-properties__actions">
        <button type="button" onClick={生成图形} disabled={!图形主题.trim()}>生成结构</button>
        <button type="button" onClick={插入图形} disabled={!图形候选}>插入可编辑图形</button>
      </div>
      {图形候选 && <ol className="wps-review-list">
        {图形候选.节点.map((项) => <li key={项.标识}><p className="wps-review-list__text">{项.文本}</p></li>)}
      </ol>}
    </fieldset>}

    {视图 === '导入' && <fieldset disabled={只读 || 运行中}>
      <legend>文档生成 PPT</legend>
      <p>支持 DOCX、TXT、MD；图片与表格不会自动导入，会在遗漏中如实说明。</p>
      <div className="wps-ppt-properties__actions">
        <button type="button" onClick={导入文档}>选择文档并解析提纲</button>
      </div>
      {导入结果 && <div>
        <p className="wps-review-list__meta">来源：{导入结果.来源.名称}（{Math.round(导入结果.来源.字节数 / 1024)} KB）</p>
        {导入结果.遗漏.length > 0 && <ul className="wps-review-list">{导入结果.遗漏.map((项, 索引) => <li key={索引}><p className="wps-review-list__text">{项.说明}</p></li>)}</ul>}
        <ol className="wps-review-list">{导入结果.提纲.map((节, 索引) => <li key={索引}>
          <p className="wps-review-list__text">{节.标题}</p>
          <p className="wps-review-list__meta">{节.要点.join('；')}</p>
        </li>)}</ol>
      </div>}
    </fieldset>}
  </aside>
}
