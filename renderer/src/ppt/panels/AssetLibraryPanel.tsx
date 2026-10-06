import React from 'react'
import { App } from 'antd'
import { 桥接, type 素材条目 } from '../../ipc/bridge'
import { type 幻灯片, type 演示文稿, type 演示对象 } from '../deck'
import { 创建图形 } from '../model/elements'
import './review.css'

interface Props {
  文稿: 演示文稿
  页: 幻灯片
  只读: boolean
  on修改: (文稿: 演示文稿) => void
  on插入图片?: (素材: 素材条目, 数据: string) => void
}

const 分类列表 = ['全部', '图标', '背景', '图片', '图示', '其他']

/** 本地素材库：导入、分类、检索、预览、插入与删除；来源与授权随条目保存。 */
export default function AssetLibraryPanel({ 文稿, 页, 只读, on修改, on插入图片 }: Props) {
  const { modal, message } = App.useApp()
  const [素材列表, set素材列表] = React.useState<素材条目[]>([])
  const [分类, set分类] = React.useState('全部')
  const [关键词, set关键词] = React.useState('')
  const [预览, set预览] = React.useState<{ 条目: 素材条目; 数据: string } | null>(null)
  const [智能结果, set智能结果] = React.useState<Array<{ 标识: string; 相关度: number; 理由: string }> | null>(null)
  const [运行中, set运行中] = React.useState(false)

  const 失败 = (标题: string, 错误: unknown) => modal.error({ title: 标题, content: 错误 instanceof Error ? 错误.message : '操作失败' })
  const 执行 = async (标题: string, 任务: () => Promise<void>) => {
    set运行中(true)
    try { await 任务() }
    catch (错误) { 失败(标题, 错误) }
    finally { set运行中(false) }
  }

  const 刷新 = React.useCallback(() => 执行('素材列表读取失败', async () => {
    const 结果 = await 桥接.presentationGeneration.assets.list()
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '素材列表读取失败')
    set素材列表(结果.数据)
  }), [])

  React.useEffect(() => { void 刷新() }, [刷新])

  const 显示列表 = React.useMemo(() => {
    const 关键词小写 = 关键词.trim().toLowerCase()
    return 素材列表.filter((项) => (分类 === '全部' || 项.分类 === 分类)
      && (!关键词小写 || [项.名称, 项.来源 ?? '', 项.授权].some((字段) => String(字段).toLowerCase().includes(关键词小写))))
  }, [素材列表, 分类, 关键词])

  const 导入 = () => 执行('素材导入失败', async () => {
    if (只读) return
    const 输入 = document.createElement('input')
    输入.type = 'file'
    输入.accept = 'image/png,image/jpeg'
    const 文件 = await new Promise<File | null>((完成) => {
      输入.onchange = () => 完成(输入.files?.[0] ?? null)
      输入.click()
    })
    if (!文件) return
    const 类型 = 文件.type === 'image/png' ? 'image/png' : 文件.type === 'image/jpeg' ? 'image/jpeg' : null
    if (!类型) throw new Error('只支持 PNG 与 JPEG 素材')
    const 数据 = await new Promise<string>((完成, 拒绝) => {
      const 读取器 = new FileReader()
      读取器.onload = () => 完成(String(读取器.result).replace(/^data:[^,]+,/, ''))
      读取器.onerror = () => 拒绝(new Error('素材读取失败'))
      读取器.readAsDataURL(文件)
    })
    const 授权 = await new Promise<string | null>((完成) => {
      let 值 = ''
      modal.confirm({
        title: '填写素材授权信息',
        content: React.createElement('input', { 'aria-label': '素材授权', onChange: (事件: React.ChangeEvent<HTMLInputElement>) => { 值 = 事件.target.value }, style: { width: '100%' } }),
        onOk: () => 完成(值),
        onCancel: () => 完成(null),
      })
    })
    if (授权 === null) return
    const 结果 = await 桥接.presentationGeneration.assets.import({ 数据, 类型, 名称: 文件.name, 分类: 分类 === '全部' ? '图片' : 分类, 授权 })
    if (!结果.成功) throw new Error(结果.错误 ?? '素材导入失败')
    message.success(结果.数据?.去重 ? '相同素材已存在，已复用图库条目' : '素材已导入')
    void 刷新()
  })

  const 预览素材 = (条目: 素材条目) => 执行('素材读取失败', async () => {
    const 结果 = await 桥接.presentationGeneration.assets.read(条目.标识)
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '素材读取失败')
    set预览({ 条目, 数据: 结果.数据.数据 })
  })

  const 插入素材 = (条目: 素材条目) => 执行('素材插入失败', async () => {
    if (只读) return
    if (on插入图片) {
      const 结果 = await 桥接.presentationGeneration.assets.read(条目.标识)
      if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '素材读取失败')
      on插入图片(条目, 结果.数据.数据)
      message.success('已插入到当前页')
      return
    }
    // 无图片插入链路时退化为插入带名称的图形占位，明确提示不是真实素材
    const 对象: 演示对象 = { ...创建图形('圆角矩形', 条目.名称), x: 120, y: 120, width: 240, height: 120 }
    on修改({ ...文稿, 幻灯片列表: 文稿.幻灯片列表.map((项) => (项.id === 页.id ? { ...项, 对象列表: [...(项.对象列表 ?? []), 对象] } : 项)) })
    modal.warning({ title: '已插入占位图形', content: '当前入口未接通图片插入链路，已插入带名称的图形占位，请改用插入图片入口。' })
  })

  const 删除素材 = (条目: 素材条目) => 执行('素材删除失败', async () => {
    const 结果 = await 桥接.presentationGeneration.assets.remove(条目.标识)
    if (!结果.成功) throw new Error(结果.错误 ?? '素材删除失败')
    message.success('已从图库删除；已被文稿引用的资源字节仍保留在文稿资源中')
    void 刷新()
  })

  const 智能检索 = () => 执行('素材智能检索失败', async () => {
    if (!关键词.trim()) throw new Error('请先输入检索关键词')
    const 结果 = await 桥接.presentationGeneration.assets.semanticSearch({ 请求标识: `asset-${Date.now()}`, 查询: 关键词 })
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '素材智能检索失败')
    set智能结果(结果.数据.结果)
  })

  return <aside className="wps-ppt-properties wps-assets" aria-label="素材库">
    <h2>素材库</h2>
    <fieldset disabled={运行中}>
      <legend>本机素材（分类、检索、预览、插入与删除）</legend>
      <label>分类<select aria-label="素材分类" value={分类} onChange={(事件) => set分类(事件.target.value)}>
        {分类列表.map((项) => <option key={项} value={项}>{项}</option>)}
      </select></label>
      <label>关键词<input aria-label="素材关键词" value={关键词} onChange={(事件) => set关键词(事件.target.value)} /></label>
      <div className="wps-ppt-properties__actions">
        <button type="button" onClick={导入} disabled={只读}>导入素材</button>
        <button type="button" onClick={智能检索} disabled={!关键词.trim()}>智能检索</button>
        <button type="button" onClick={() => void 刷新()}>刷新列表</button>
      </div>
      {显示列表.length === 0 && <p>图库中没有符合条件的素材。</p>}
      <ol className="wps-review-list">
        {显示列表.map((条目) => <li key={条目.标识}>
          <p className="wps-review-list__meta">{条目.分类} · {Math.max(1, Math.round(条目.字节数 / 1024))} KB{条目.来源 ? ` · 来源：${条目.来源}` : ''}</p>
          <p className="wps-review-list__text">{条目.名称}</p>
          <p className="wps-review-list__meta">授权：{条目.授权}</p>
          <div className="wps-ppt-properties__actions">
            <button type="button" onClick={() => 预览素材(条目)}>预览</button>
            <button type="button" onClick={() => 插入素材(条目)} disabled={只读}>插入</button>
            <button type="button" onClick={() => 删除素材(条目)}>删除</button>
          </div>
        </li>)}
      </ol>
      {智能结果 && <div>
        <h3>智能检索结果</h3>
        <ol className="wps-review-list">
          {智能结果.map((项) => <li key={项.标识}>
            <p className="wps-review-list__meta">相关度 {项.相关度}</p>
            <p className="wps-review-list__text">{素材列表.find((条目) => 条目.标识 === 项.标识)?.名称 ?? 项.标识}：{项.理由}</p>
          </li>)}
        </ol>
      </div>}
      {预览 && <div>
        <h3>素材预览：{预览.条目.名称}</h3>
        <img alt={`素材预览 ${预览.条目.名称}`} src={`data:${预览.条目.类型};base64,${预览.数据}`} style={{ maxWidth: '100%', maxHeight: 160 }} />
      </div>}
    </fieldset>
  </aside>
}
