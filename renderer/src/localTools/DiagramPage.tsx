import { useEffect, useRef, useState } from 'react'
import { App as AntdApp, Button, Input } from 'antd'
import { 解析图数据, 生成图形文件, 新建图, type 图数据, type 图类型 } from './diagramData'
import { 下载本地内容 } from './download'
import './localTools.css'

interface Props { 类型: 图类型 }
const 存储键 = (类型: 图类型) => 类型 === '脑图' ? 'seal-local-mindmap-v1' : 'seal-local-flow-v1'
const 标识 = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export default function DiagramPage({ 类型 }: Props) {
  const { message, modal } = AntdApp.useApp()
  const [图, 设图] = useState<图数据 | null>(null)
  const 图引用 = useRef<图数据 | null>(null)
  const [读取错误, 设读取错误] = useState<string | null>(null)
  const [选中标识, 设选中标识] = useState<string | null>(null)
  const [编辑文本, 设编辑文本] = useState('')
  const [连线目标, 设连线目标] = useState('')
  const 导入引用 = useRef<HTMLInputElement | null>(null)
  const 拖动 = useRef<{ id: string; 起始X: number; 起始Y: number; 原X: number; 原Y: number; 原图: 图数据 } | null>(null)

  useEffect(() => {
    try {
      const 原文 = localStorage.getItem(存储键(类型))
      const 结果 = 原文 === null ? 新建图(类型) : 解析图数据(原文)
      设图(结果)
      图引用.current = 结果
      设选中标识(结果.节点[0]?.id ?? null)
      设读取错误(null)
    } catch (错误) {
      const 原因 = 错误 instanceof Error ? 错误.message : '本机图形数据无法读取'
      设图(null)
      设读取错误(原因)
      modal.error({ title: `读取${类型}失败`, content: `${原因}。原数据已保留，请先检查备份或手动清除。` })
    }
  }, [类型, modal])

  const 当前节点 = 图?.节点.find((项) => 项.id === 选中标识) ?? null
  useEffect(() => { 设编辑文本(当前节点?.文本 ?? '') }, [当前节点?.id, 当前节点?.文本])

  const 保存图 = (新图: 图数据, 成功提示?: string): boolean => {
    try {
      const 已校验 = 解析图数据(JSON.stringify(新图))
      localStorage.setItem(存储键(类型), JSON.stringify(已校验))
      设图(已校验)
      图引用.current = 已校验
      if (成功提示) message.success(成功提示)
      return true
    } catch (错误) {
      modal.error({ title: `保存${类型}失败`, content: 错误 instanceof Error ? 错误.message : '本机存储不可写，请检查空间和权限' })
      return false
    }
  }

  const 新增节点 = () => {
    if (!图) return
    const 参照 = 当前节点 ?? 图.节点[0]
    const 新节点 = { id: 标识(), 文本: 类型 === '脑图' ? '新分支' : '新步骤', x: 参照 ? Math.min(2800, 参照.x + 240) : 100, y: 参照 ? Math.min(2800, 参照.y + 72) : 100 }
    const 新图 = { 节点: [...图.节点, 新节点], 连线: 参照 && 类型 === '脑图' ? [...图.连线, { id: 标识(), 起点: 参照.id, 终点: 新节点.id }] : 图.连线 }
    if (保存图(新图, '节点已添加')) 设选中标识(新节点.id)
  }

  const 删除节点 = () => {
    if (!图 || !当前节点) return
    if (类型 === '脑图' && 图.节点[0]?.id === 当前节点.id) { modal.info({ title: '无法删除中心主题', content: '请编辑中心主题内容，或新建一张脑图。' }); return }
    modal.confirm({ title: '删除节点', content: `确认删除「${当前节点.文本}」及其连线？`, okText: '删除', okType: 'danger', cancelText: '取消', onOk: () => {
      const 新图 = { 节点: 图.节点.filter((项) => 项.id !== 当前节点.id), 连线: 图.连线.filter((项) => 项.起点 !== 当前节点.id && 项.终点 !== 当前节点.id) }
      if (保存图(新图)) 设选中标识(新图.节点[0]?.id ?? null)
    } })
  }

  const 更新文字 = () => {
    if (!图 || !当前节点 || !编辑文本.trim()) { modal.error({ title: '节点内容无效', content: '节点文字不能为空' }); return }
    保存图({ ...图, 节点: 图.节点.map((项) => 项.id === 当前节点.id ? { ...项, 文本: 编辑文本.trim() } : 项) }, '节点已更新')
  }

  const 添加连线 = () => {
    if (!图 || !当前节点 || !连线目标 || 连线目标 === 当前节点.id) return
    if (图.连线.some((项) => 项.起点 === 当前节点.id && 项.终点 === 连线目标)) { message.info('这两个节点已经连接'); return }
    if (保存图({ ...图, 连线: [...图.连线, { id: 标识(), 起点: 当前节点.id, 终点: 连线目标 }] }, '连线已添加')) 设连线目标('')
  }

  const 导入图 = async (文件: File) => {
    try {
      const 内容 = 解析图数据(await 文件.text())
      modal.confirm({ title: `导入${类型}`, content: '导入会替换当前画布，请先导出可编辑备份。', okText: '确认导入', okType: 'danger', cancelText: '取消', onOk: () => { if (保存图(内容, '图形已导入')) 设选中标识(内容.节点[0]?.id ?? null) } })
    } catch (错误) { modal.error({ title: `导入${类型}失败`, content: 错误 instanceof Error ? 错误.message : '无法读取图形文件' }) }
  }

  const 重建图 = () => modal.confirm({ title: `新建${类型}`, content: '当前画布将被新图替换，请先导出可编辑备份。', okText: '新建', okType: 'danger', cancelText: '取消', onOk: () => {
    const 新图数据 = 新建图(类型)
    if (保存图(新图数据, `已新建${类型}`)) { 设选中标识(新图数据.节点[0].id); 设读取错误(null) }
  } })

  const 清除损坏数据 = () => modal.confirm({ title: `清除损坏的${类型}数据`, content: '将删除本机保存的图形数据，无法撤销。', okText: '确认清除', okType: 'danger', cancelText: '取消', onOk: () => {
    try { localStorage.removeItem(存储键(类型)); const 新图数据 = 新建图(类型); 设图(新图数据); 图引用.current = 新图数据; 设选中标识(新图数据.节点[0].id); 设读取错误(null) }
    catch (错误) { modal.error({ title: '清除失败', content: 错误 instanceof Error ? 错误.message : '本机存储不可写' }) }
  } })

  const 导出原始数据 = () => {
    try {
      const 原文 = localStorage.getItem(存储键(类型))
      if (原文 === null) throw new Error('本机没有可导出的图形数据')
      下载本地内容(`${类型}原始备份.json`, 原文, 'application/json;charset=utf-8')
    } catch (错误) {
      modal.error({ title: '导出原始数据失败', content: 错误 instanceof Error ? 错误.message : '无法读取原始图形数据' })
    }
  }

  const 导出图数据 = () => {
    if (!图) return
    try {
      下载本地内容(`${类型}.json`, JSON.stringify(图, null, 2), 'application/json;charset=utf-8')
    } catch (错误) {
      modal.error({ title: `导出${类型}数据失败`, content: 错误 instanceof Error ? 错误.message : '无法生成可编辑数据文件' })
    }
  }

  const 结束拖动 = (事件: React.PointerEvent<HTMLButtonElement>) => {
    const 状态 = 拖动.current
    if (!状态) return
    拖动.current = null
    事件.currentTarget.releasePointerCapture?.(事件.pointerId)
    const 横移 = 事件.clientX - 状态.起始X
    const 纵移 = 事件.clientY - 状态.起始Y
    if (Math.abs(横移) + Math.abs(纵移) < 3) return
    const 新图 = { ...状态.原图, 节点: 状态.原图.节点.map((项) => 项.id === 状态.id ? { ...项, x: Math.max(0, Math.min(3000, 状态.原X + 横移)), y: Math.max(0, Math.min(3000, 状态.原Y + 纵移)) } : 项) }
    if (!保存图(新图)) { 设图(状态.原图); 图引用.current = 状态.原图 }
  }

  return <div className="local-page">
    <header className="local-page__header"><div><h1>{类型}</h1><p>在本机编辑节点与连线；自动保存，支持导入、导出可编辑数据和图片。</p></div><div className="local-page__actions"><Button onClick={重建图}>新建</Button><Button onClick={() => 导入引用.current?.click()} disabled={读取错误 !== null}>导入数据</Button><Button onClick={导出图数据} disabled={!图}>导出数据</Button><Button type="primary" onClick={() => { if (图) { try { 下载本地内容(`${类型}.svg`, 生成图形文件(图, 类型), 'image/svg+xml;charset=utf-8') } catch (错误) { modal.error({ title: '导出图片失败', content: 错误 instanceof Error ? 错误.message : '无法生成图片' }) } } }} disabled={!图}>导出图片</Button></div></header>
    <input ref={导入引用} type="file" accept=".json,application/json" hidden onChange={(事件) => { const 文件 = 事件.target.files?.[0]; if (文件) void 导入图(文件); 事件.target.value = '' }} />
    {读取错误 ? <div className="local-page__error"><strong>{类型}暂不可编辑</strong><p>{读取错误}</p><Button onClick={导出原始数据}>导出原始数据</Button><Button danger onClick={清除损坏数据}>清除损坏数据</Button></div> : 图 ? <div className="diagram-layout"><div className="diagram-workspace"><div className="diagram-toolbar"><Button onClick={新增节点} disabled={图.节点.length >= 100}>添加节点</Button><span>选中节点后可拖动位置；{类型 === '脑图' ? '新节点接到当前选中节点。' : '在右侧连接步骤。'}</span></div><div className="diagram-scroll"><div className="diagram-board" role="group" aria-label={`${类型}画布`}><svg className="diagram-lines" width="3200" height="3200" aria-hidden="true"><defs><marker id="local-flow-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0 0 L8 3 L0 6" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>{图.连线.map((线) => { const 起点 = 图.节点.find((项) => 项.id === 线.起点); const 终点 = 图.节点.find((项) => 项.id === 线.终点); return 起点 && 终点 ? <line key={线.id} x1={起点.x + 90} y1={起点.y + 26} x2={终点.x + 90} y2={终点.y + 26} markerEnd={类型 === '流程图' ? 'url(#local-flow-arrow)' : undefined} /> : null })}</svg>{图.节点.map((节点) => <button key={节点.id} type="button" className={`diagram-node${选中标识 === 节点.id ? ' diagram-node--selected' : ''}`} style={{ left: 节点.x, top: 节点.y }} onClick={() => 设选中标识(节点.id)} onPointerDown={(事件) => { 拖动.current = { id: 节点.id, 起始X: 事件.clientX, 起始Y: 事件.clientY, 原X: 节点.x, 原Y: 节点.y, 原图: 图 }; 事件.currentTarget.setPointerCapture?.(事件.pointerId); 设选中标识(节点.id) }} onPointerMove={(事件) => { const 状态 = 拖动.current; if (!状态 || 状态.id !== 节点.id) return; const 临时图 = { ...状态.原图, 节点: 状态.原图.节点.map((项) => 项.id === 状态.id ? { ...项, x: Math.max(0, Math.min(3000, 状态.原X + 事件.clientX - 状态.起始X)), y: Math.max(0, Math.min(3000, 状态.原Y + 事件.clientY - 状态.起始Y)) } : 项) }; 设图(临时图); 图引用.current = 临时图 }} onPointerUp={结束拖动} onPointerCancel={() => { if (拖动.current) { 设图(拖动.current.原图); 图引用.current = 拖动.current.原图; 拖动.current = null } }}>{节点.文本}</button>)}</div></div></div><aside className="diagram-inspector"><h2>节点编辑</h2>{当前节点 ? <><label>文字<Input value={编辑文本} maxLength={200} onChange={(事件) => 设编辑文本(事件.target.value)} onPressEnter={更新文字} /></label><Button type="primary" onClick={更新文字}>保存文字</Button><div className="diagram-inspector__position"><label>横向位置<input type="number" min="0" max="3000" value={Math.round(当前节点.x)} onChange={(事件) => { const 值 = Number(事件.target.value); if (图 && Number.isFinite(值)) 保存图({ ...图, 节点: 图.节点.map((项) => 项.id === 当前节点.id ? { ...项, x: Math.max(0, Math.min(3000, 值)) } : 项) }) }} /></label><label>纵向位置<input type="number" min="0" max="3000" value={Math.round(当前节点.y)} onChange={(事件) => { const 值 = Number(事件.target.value); if (图 && Number.isFinite(值)) 保存图({ ...图, 节点: 图.节点.map((项) => 项.id === 当前节点.id ? { ...项, y: Math.max(0, Math.min(3000, 值)) } : 项) }) }} /></label></div>{类型 === '流程图' ? <div className="diagram-inspector__connect"><label>连接到<select value={连线目标} onChange={(事件) => 设连线目标(事件.target.value)}><option value="">选择目标节点</option>{图.节点.filter((项) => 项.id !== 当前节点.id).map((项) => <option key={项.id} value={项.id}>{项.文本}</option>)}</select></label><Button onClick={添加连线} disabled={!连线目标}>添加连线</Button></div> : null}<Button danger onClick={删除节点}>删除节点</Button></> : <p className="local-page__muted">选择画布上的节点。</p>}{图.连线.length > 0 ? <div className="diagram-inspector__edges"><h3>连线</h3>{图.连线.map((线) => <div key={线.id}><span>{图.节点.find((项) => 项.id === 线.起点)?.文本} 至 {图.节点.find((项) => 项.id === 线.终点)?.文本}</span><Button size="small" danger onClick={() => 保存图({ ...图, 连线: 图.连线.filter((项) => 项.id !== 线.id) }, '连线已删除')}>删除</Button></div>)}</div> : null}</aside></div> : null}
  </div>
}
