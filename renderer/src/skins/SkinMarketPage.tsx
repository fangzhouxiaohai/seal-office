import { useEffect, useRef, useState } from 'react'
import { App, Button, Checkbox, Empty, Input, Modal, Segmented, Tag } from 'antd'
import { useSettings } from '../store/settingsStore'
import { 内置皮肤列表, 默认皮肤, type 皮肤定义, type 皮肤颜色 } from '../styles/themes'
import { 解析皮肤文本, 皮肤颜色键 } from '../../../main/skins/skinFormat'
import { cloudCall, useCloud } from '../cloud/CloudProvider'
import { reportPublic } from '../cloud/reportPublic'
import { 下载本地内容 } from '../localTools/download'
import Icon from '../components/Icon'
import LoadingState from '../components/LoadingState'
import { 皮肤封面, 文本转base64, base64转文本 } from './skinCover'
import './skinMarket.css'

type 分区 = 'builtin' | 'public' | 'mine' | 'rules'
interface 公开皮肤 { id: string; title: string; cover?: string; description?: string; created?: number }
interface 我的公开 { id: string; node_id: string; kind: string; title: string; status: string }

const 状态文字: Record<string, string> = { pending: '审核中', approved: '已公开', rejected: '未通过', withdrawn: '已撤回' }

/** 色板缩略图：用皮肤真实颜色画出侧栏、卡片、按钮，浅色与深色并排。 */
function 色板({ 颜色, 标签 }: { 颜色: 皮肤颜色; 标签: string }) {
  return <div className="seal-skin-swatch" aria-hidden="true" style={{ background: 颜色.bg, borderColor: 颜色.border }} title={标签}>
    <span className="seal-skin-swatch__rail" style={{ background: 颜色.sidebar, borderColor: 颜色.border }}>
      <i style={{ background: 颜色.brand }} /><i style={{ background: 颜色.text3 }} /><i style={{ background: 颜色.text3 }} />
    </span>
    <span className="seal-skin-swatch__card" style={{ background: 颜色.card, borderColor: 颜色.border }}>
      <b style={{ background: 颜色.text }} /><b style={{ background: 颜色.text2, width: '58%' }} />
      <em style={{ background: `linear-gradient(135deg, ${颜色.gradientFrom}, ${颜色.brand} 45%, ${颜色.gradientTo})` }} />
    </span>
  </div>
}

function 皮肤卡片({ 皮肤, 使用中, children }: { 皮肤: 皮肤定义; 使用中: boolean; children: React.ReactNode }) {
  return <article className={`seal-skin-card${使用中 ? ' is-active' : ''}`} aria-label={皮肤.name}>
    <div className="seal-skin-card__preview"><色板 颜色={皮肤.light} 标签="浅色" /><色板 颜色={皮肤.dark} 标签="深色" /></div>
    <div className="seal-skin-card__body">
      <h3>{皮肤.name}{使用中 ? <Tag color="processing">使用中</Tag> : null}</h3>
      <p>{皮肤.description || '暂无说明'}</p>
      <span className="seal-skin-card__meta">{皮肤.author || '未署名'} · 版本 {皮肤.version}</span>
      <div className="seal-skin-card__actions">{children}</div>
    </div>
  </article>
}

export const 模板皮肤 = (): 皮肤定义 => ({ ...默认皮肤, id: 'your-name.my-skin', name: '我的皮肤', author: '你的名字', version: '1.0.0', description: '一句话介绍这套皮肤' })
const 导出皮肤 = (皮肤: 皮肤定义, 文件名: string) => 下载本地内容(文件名, JSON.stringify(皮肤, null, 2) + '\n', 'application/json')

export default function SkinMarketPage() {
  const { modal, message } = App.useApp()
  const settings = useSettings(), cloud = useCloud()
  const [分区, set分区] = useState<分区>('builtin')
  const [公开列表, set公开列表] = useState<公开皮肤[]>([]), [我的公开列表, set我的公开列表] = useState<我的公开[]>([])
  const [加载中, set加载中] = useState(false), [忙碌, set忙碌] = useState(false), [错误, set错误] = useState('')
  const [待上传, set待上传] = useState<皮肤定义 | null>(null), [授权, set授权] = useState(false)
  const 导入输入 = useRef<HTMLInputElement>(null)
  const 已开通 = Boolean(cloud.state.account?.enabled && cloud.state.unlocked)

  const 执行 = async (标题: string, 任务: () => Promise<void>) => {
    set忙碌(true)
    try { await 任务() } catch (原因) { modal.error({ title: 标题, content: 原因 instanceof Error ? 原因.message : '操作失败，请稍后重试', okText: '确定' }) } finally { set忙碌(false) }
  }
  const 读取公开 = async () => {
    set加载中(true); set错误('')
    try { set公开列表(((await cloudCall<{ items: any[] }>('public')).items || []).filter(项 => 项.kind === 'skin')) }
    catch (原因) { set错误(原因 instanceof Error ? `公开皮肤读取失败：${原因.message}` : '公开皮肤读取失败') }
    finally { set加载中(false) }
  }
  const 读取我的公开 = async () => {
    if (!已开通) { set我的公开列表([]); return }
    try { set我的公开列表(((await cloudCall<{ items: 我的公开[] }>('myPublic')).items || []).filter(项 => 项.kind === 'skin')) }
    catch (原因) { set错误(原因 instanceof Error ? `审核状态读取失败：${原因.message}` : '审核状态读取失败') }
  }
  useEffect(() => { if (分区 === 'public') void 读取公开(); if (分区 === 'mine') void 读取我的公开() }, [分区, 已开通])

  const 导入文件 = (文件?: File) => {
    if (!文件) return
    void 执行('导入皮肤失败', async () => {
      if (!/\.(sealskin|json)$/i.test(文件.name)) throw new Error('请选择 .sealskin 皮肤文件')
      const 皮肤 = 解析皮肤文本(await 文件.text()) as 皮肤定义
      settings.安装皮肤(皮肤)
      message.success(`已导入并应用“${皮肤.name}”，仅在本机生效`)
    })
  }
  const 安装公开 = (项: 公开皮肤) => 执行('安装皮肤失败', async () => {
    const 文件 = await cloudCall<{ name: string; data: string }>('publicDownloadData', { id: 项.id })
    const 皮肤 = 解析皮肤文本(base64转文本(文件.data)) as 皮肤定义
    settings.安装皮肤(皮肤)
    message.success(`已安装并应用“${皮肤.name}”`)
  })
  const 申请公开 = (皮肤: 皮肤定义) => {
    if (!已开通) { modal.info({ title: '需要云空间', content: '请先登录并开通云空间，再上传皮肤申请公开。导入的皮肤仍可在本机使用。', okText: '去登录', onOk: cloud.configure }); return }
    set授权(false); set待上传(皮肤)
  }
  const 提交审核 = () => 执行('提交审核失败', async () => {
    if (!待上传) return
    const 文件名 = `${待上传.name}.sealskin`
    const 保存 = await cloudCall<{ id: string; statuses: Record<string, string> }>('save', { linkId: `skin-${待上传.id}-${待上传.version}`, name: 待上传.name, filename: 文件名, data: 文本转base64(JSON.stringify(待上传, null, 2)), cover: 皮肤封面(待上传), category: '皮肤', description: 待上传.description || '', license: '上传者确认为皮肤作者并同意公开' })
    if (保存.statuses?.[保存.id] && 保存.statuses[保存.id] !== '云端已保存') throw new Error('皮肤已在本机加密保留，但尚未同步到云端；请在云空间检查待同步状态后重试')
    await cloudCall('publish', { id: 保存.id, kind: 'skin', consent: true, category: '皮肤' })
    set待上传(null)
    message.success('已提交审核，管理员通过后所有用户都可以在“公开皮肤”中使用')
    await 读取我的公开(); await cloud.refresh()
  })
  const 撤回 = (项: 我的公开) => 执行('撤回失败', async () => { await cloudCall('withdraw', { id: 项.id }); await 读取我的公开() })

  const 内置区 = <div className="seal-skin-grid">{内置皮肤列表.map(皮肤 => <皮肤卡片 key={皮肤.id} 皮肤={皮肤} 使用中={settings.皮肤.id === 皮肤.id}>
    <Button type="primary" disabled={settings.皮肤.id === 皮肤.id} aria-label={`应用 ${皮肤.name}`} onClick={() => settings.设置皮肤(皮肤.id)}>应用</Button>
    <Button aria-label={`预览 ${皮肤.name}`} onMouseEnter={() => settings.预览皮肤(皮肤)} onMouseLeave={() => settings.预览皮肤(null)} onFocus={() => settings.预览皮肤(皮肤)} onBlur={() => settings.预览皮肤(null)}>预览</Button>
    <Button type="text" aria-label={`导出 ${皮肤.name}`} icon={<Icon name="export-file" size={16} />} onClick={() => 导出皮肤(皮肤, `${皮肤.id}.sealskin`)} />
  </皮肤卡片>)}</div>

  const 公开区 = 加载中 ? <LoadingState 文字="正在读取公开皮肤…" />
    : !公开列表.length ? <Empty description="暂无审核通过的公开皮肤，欢迎上传你的作品" />
    : <div className="seal-skin-grid">{公开列表.map(项 => <article key={项.id} className="seal-skin-card" aria-label={项.title}>
      <div className="seal-skin-card__preview">{项.cover ? <img src={项.cover} alt={`${项.title} 色板`} /> : <span className="seal-skin-card__placeholder">公开皮肤</span>}</div>
      <div className="seal-skin-card__body"><h3>{项.title}</h3><p>{项.description || '审核通过的社区皮肤'}</p>
        <div className="seal-skin-card__actions"><Button type="primary" loading={忙碌} aria-label={`安装并应用 ${项.title}`} onClick={() => void 安装公开(项)}>安装并应用</Button>
          <Button aria-label={`举报 ${项.title}`} onClick={() => cloud.state.account ? reportPublic(modal, message, 项.id) : cloud.configure()}>举报</Button></div></div>
    </article>)}</div>

  const 我的区 = <>
    {!settings.已安装皮肤.length ? <Empty description="还没有导入皮肤。可下载模板修改后导入，或从公开皮肤安装" /> : <div className="seal-skin-grid">{settings.已安装皮肤.map(皮肤 => {
      const 公开 = 我的公开列表.find(项 => 项.title === 皮肤.name && ['pending', 'approved'].includes(项.status))
      return <皮肤卡片 key={皮肤.id} 皮肤={皮肤} 使用中={settings.皮肤.id === 皮肤.id}>
        <Button type="primary" disabled={settings.皮肤.id === 皮肤.id} aria-label={`应用 ${皮肤.name}`} onClick={() => settings.设置皮肤(皮肤.id)}>应用</Button>
        {公开 ? <Button aria-label={`撤回公开 ${皮肤.name}`} onClick={() => void 撤回(公开)}>{状态文字[公开.status]} · 撤回</Button>
          : <Button aria-label={`上传并申请公开 ${皮肤.name}`} onClick={() => 申请公开(皮肤)}>上传公开</Button>}
        <Button type="text" danger aria-label={`卸载 ${皮肤.name}`} onClick={() => modal.confirm({ title: `卸载“${皮肤.name}”？`, content: '只删除本机安装的皮肤，已提交的公开审核不受影响。', okText: '卸载', cancelText: '取消', onOk: () => settings.卸载皮肤(皮肤.id) })}>卸载</Button>
      </皮肤卡片>
    })}</div>}
    {我的公开列表.length ? <section className="seal-skin-publications" aria-label="我的公开申请"><h2>我的公开申请</h2>{我的公开列表.map(项 => <p key={项.id}><span>{项.title}</span><Tag>{状态文字[项.status] || 项.status}</Tag>{['pending', 'approved'].includes(项.status) ? <Button size="small" onClick={() => void 撤回(项)}>撤回</Button> : null}</p>)}</section> : null}
  </>

  const 规则区 = <section className="seal-skin-rules" aria-label="皮肤开发规则">
    <h2>皮肤开发规则</h2>
    <ol>
      <li>皮肤文件为 UTF-8 编码的 JSON，扩展名 <code>.sealskin</code>，大小不超过 512 KB。</li>
      <li>必填 <code>format: "seal-skin"</code>、<code>schema: 1</code>、<code>id</code>（3–64 位小写字母、数字、点或连字符，建议“作者.名称”）、<code>name</code>（1–24 字）、<code>version</code>（如 1.0.0）。</li>
      <li><code>light</code> 与 <code>dark</code> 各包含 15 个颜色键，全部为 <code>#RRGGBB</code>：{皮肤颜色键.join('、')}。</li>
      <li>可读性：正文与卡片、背景的对比度不低于 4.5:1；次要文字与卡片不低于 3:1；主色上的白色文字不低于 3:1。</li>
      <li>可选 <code>radius</code>：卡片 0–24、控件 0–16 的整数；可选 <code>background</code>：PNG / JPEG / WebP 的 base64 图片（≤ 300 KB），透明度 0–0.4。</li>
      <li>不接受自定义 CSS、脚本、外部链接或未列出的字段，出现即拒绝导入和公开。</li>
      <li>本机导入立即生效且只对自己可见；上传公开须登录并开通云空间，管理员审核通过后所有用户可安装。请只上传自己创作的皮肤。</li>
    </ol>
    <div className="seal-skin-rules__actions"><Button type="primary" onClick={() => 导出皮肤(模板皮肤(), 'my-skin.sealskin')}>下载模板皮肤</Button><Button onClick={() => 导入输入.current?.click()}>导入并校验</Button></div>
  </section>

  return <section className="seal-cloud-page seal-skin-market">
    <header className="seal-skin-market__header"><div><h1>皮肤市场</h1><p>{内置皮肤列表.length} 套内置皮肤 · 浅色与深色模式各自适配 · 支持导入与社区公开</p></div>
      <div className="seal-skin-market__tools">
        <Button icon={<Icon name="export-file" size={16} />} disabled={忙碌} onClick={() => 导入输入.current?.click()}>导入皮肤</Button>
        <input ref={导入输入} type="file" hidden accept=".sealskin,.json,application/json" aria-label="导入皮肤文件" onChange={事件 => { const 文件 = 事件.target.files?.[0]; 事件.target.value = ''; 导入文件(文件) }} />
      </div>
    </header>
    <Segmented<分区> value={分区} onChange={set分区} options={[{ value: 'builtin', label: '内置皮肤' }, { value: 'public', label: '公开皮肤' }, { value: 'mine', label: '我的皮肤' }, { value: 'rules', label: '开发规则' }]} />
    {错误 ? <p className="seal-cloud-error" role="alert">{错误} <Button size="small" onClick={() => void (分区 === 'public' ? 读取公开() : 读取我的公开())}>重试</Button></p> : null}
    {分区 === 'builtin' ? 内置区 : 分区 === 'public' ? 公开区 : 分区 === 'mine' ? 我的区 : 规则区}
    <Modal title="上传皮肤并申请公开" open={Boolean(待上传)} centered confirmLoading={忙碌} okText="提交审核" cancelText="取消" okButtonProps={{ disabled: !授权 }} onCancel={() => set待上传(null)} onOk={() => void 提交审核()}>
      {待上传 ? <><div className="seal-skin-card__preview"><色板 颜色={待上传.light} 标签="浅色" /><色板 颜色={待上传.dark} 标签="深色" /></div>
        <p>名称：{待上传.name} · 版本 {待上传.version}</p><Input.TextArea readOnly value={待上传.description || '无说明'} autoSize />
        <p>皮肤会加密保存到你的云空间，再提交公开副本给管理员审核。审核通过后所有用户可下载使用，你可以随时撤回。</p>
        <Checkbox checked={授权} onChange={事件 => set授权(事件.target.checked)}>我是这套皮肤的作者，同意公开发布</Checkbox></> : null}
    </Modal>
  </section>
}
