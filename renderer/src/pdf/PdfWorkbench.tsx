import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { App as AntdApp, Button, Input, Select } from 'antd'
import { 桥接 } from '../ipc/bridge'
import Icon from '../components/Icon'
import PrintPreview from '../components/PrintPreview'
import PdfViewer from './PdfViewer'
import { 解析页码, PDF命令表, type PDF命令 } from './pdfCommands'
import './pdf.css'

interface 本地PDF文件 {
  标识: string
  名称: string
  数据: string
}

interface 初始PDF文件 {
  路径: string
  名称: string
  数据: string
}

interface PdfWorkbenchProps {
  初始文件?: 初始PDF文件 | null
  已打开文件?: 本地PDF文件[]
  当前标识?: string | null
  onAdded?: (文件: { 路径: string | null; 名称: string; 数据: string }) => void
  onSelected?: (标识: string) => void
  onRemoved?: (标识: string) => void
  onSaved?: (路径: string, 数据: string) => void
  onEdited?: (数据:string) => void
}

function 读取PDF文件(文件: File): Promise<本地PDF文件> {
  return new Promise((完成, 失败) => {
    const 读取器 = new FileReader()
    读取器.onload = () => {
      const 内容 = typeof 读取器.result === 'string' ? 读取器.result : ''
      const 分隔位置 = 内容.indexOf(',')
      if (分隔位置 < 0 || 分隔位置 === 内容.length - 1) {
        失败(new Error(`「${文件.name}」的文件内容为空`))
        return
      }
      完成({ 标识: `${Date.now()}-${Math.random()}`, 名称: 文件.name, 数据: 内容.slice(分隔位置 + 1) })
    }
    读取器.onerror = () => 失败(new Error(`无法读取「${文件.name}」：${读取器.error?.message ?? '请检查文件权限'}`))
    读取器.readAsDataURL(文件)
  })
}

const PdfWorkbench = ({ 初始文件, 已打开文件, 当前标识, onAdded, onSelected, onRemoved, onSaved, onEdited }: PdfWorkbenchProps) => {
  const { message, modal } = AntdApp.useApp()
  const [文件列表, set文件列表] = useState<本地PDF文件[]>([])
  const [预览标识, set预览标识] = useState<string | null>(null)
  const [页码, set页码] = useState('1')
  const [命令, set命令] = useState<PDF命令>('extract')
  const [角度, set角度] = useState(90)
  const [插入位置, set插入位置] = useState('1')
  const [插入来源, set插入来源] = useState('')
  const [编辑类型, set编辑类型] = useState<'text' | 'note' | 'image' | 'cover' | 'replace'>('text')
  const [编辑文字, set编辑文字] = useState('')
  const [编辑页码, set编辑页码] = useState('1')
  const [编辑横坐标, set编辑横坐标] = useState('50')
  const [编辑纵坐标, set编辑纵坐标] = useState('50')
  const [编辑宽度, set编辑宽度] = useState('150')
  const [编辑高度, set编辑高度] = useState('80')
  const [编辑字号, set编辑字号] = useState('12')
  const [编辑颜色, set编辑颜色] = useState('#111111')
  const [编辑图片, set编辑图片] = useState('')
  const [正在读取, set正在读取] = useState(false)
  const [正在处理, set正在处理] = useState(false)
  const [工具展开, set工具展开] = useState(false)
  const [打印预览, set打印预览] = useState<{ 内容: string; 标题: string } | null>(null)
  const 文件选择器 = useRef<HTMLInputElement | null>(null)
  const 图片选择器 = useRef<HTMLInputElement | null>(null)
  const 当前文件 = 文件列表.find((文件) => 文件.标识 === 预览标识) ?? null

  useEffect(() => {
    if (!初始文件) {
      set预览标识(null)
      return
    }
    const 标识 = 当前标识 ?? `path:${初始文件.路径}`
    set文件列表((当前) => {
      const 文件 = { 标识, 名称: 初始文件.名称, 数据: 初始文件.数据 }
      const 已有位置 = 当前.findIndex((项) => 项.标识 === 标识)
      if (已有位置 < 0) return [...当前, 文件]
      return 当前.map((项, 位置) => 位置 === 已有位置 ? 文件 : 项)
    })
    set预览标识(标识)
  }, [初始文件, 当前标识])

  useEffect(() => {
    if (已打开文件) set文件列表(已打开文件)
  }, [已打开文件])

  const 显示错误 = useCallback((标题: string, 详情: string) => {
    modal.error({ title: 标题, content: 详情, okText: '知道了' })
  }, [modal])

  const 选择文件 = async (事件: ChangeEvent<HTMLInputElement>) => {
    const 待选文件 = Array.from(事件.target.files ?? [])
    事件.target.value = ''
    if (待选文件.length === 0) return
    const 非PDF = 待选文件.filter((文件) => !文件.name.toLowerCase().endsWith('.pdf'))
    if (非PDF.length > 0) {
      显示错误('文件类型不受支持', `请选择 PDF 文件。未添加：${非PDF.map((文件) => 文件.name).join('、')}`)
    }
    const PDF文件 = 待选文件.filter((文件) => 文件.name.toLowerCase().endsWith('.pdf'))
    if (PDF文件.length === 0) return
    set正在读取(true)
    try {
      const 结果 = await Promise.allSettled(PDF文件.map(读取PDF文件))
      const 已读取 = 结果.filter((项): 项 is PromiseFulfilledResult<本地PDF文件> => 项.status === 'fulfilled').map((项) => 项.value)
      const 失败项 = 结果.filter((项): 项 is PromiseRejectedResult => 项.status === 'rejected')
      if (失败项.length > 0) {
        显示错误('PDF 文件读取失败', 失败项.map((项) => 项.reason instanceof Error ? 项.reason.message : '文件无法读取').join('；'))
      }
      if (已读取.length > 0) {
        set文件列表((当前) => [...当前, ...已读取])
        set预览标识((当前) => 当前 ?? 已读取[0].标识)
        for (const 文件 of 已读取) onAdded?.({ 路径: null, 名称: 文件.名称, 数据: 文件.数据 })
      }
    } catch (错误) {
      显示错误('PDF 标签打开失败', 错误 instanceof Error ? 错误.message : '无法将文件加入工作区')
    } finally {
      set正在读取(false)
    }
  }

  const 添加PDF文件 = async () => {
    if (!桥接.可用) {
      文件选择器.current?.click()
      return
    }
    set正在读取(true)
    try {
      const 路径列表 = await 桥接.showOpenDialogMany('pdf')
      if (路径列表.length === 0) return
      const 结果 = await Promise.allSettled(路径列表.map(async (路径) => {
        const 读取结果 = await 桥接.readFile(路径)
        if (!读取结果.成功 || !读取结果.二进制 || !读取结果.内容 || 读取结果.扩展名?.toLowerCase() !== '.pdf') {
          throw new Error(`无法读取「${路径}」：${读取结果.错误 || '不是有效的 PDF 文件'}`)
        }
        return { 路径, 名称: 路径.split(/[\\/]/).pop() || 'PDF 文件', 数据: 读取结果.内容 }
      }))
      const 已读取 = 结果.filter((项): 项 is PromiseFulfilledResult<{ 路径: string; 名称: string; 数据: string }> => 项.status === 'fulfilled').map((项) => 项.value)
      const 失败项 = 结果.filter((项): 项 is PromiseRejectedResult => 项.status === 'rejected')
      if (失败项.length > 0) 显示错误('PDF 文件读取失败', 失败项.map((项) => 项.reason instanceof Error ? 项.reason.message : '文件无法读取').join('；'))
      if (已读取.length > 0) {
        set文件列表((当前) => [...当前, ...已读取.map((文件) => ({ 标识: `path:${文件.路径}`, 名称: 文件.名称, 数据: 文件.数据 }))])
        for (const 文件 of 已读取) onAdded?.(文件)
      }
    } catch (错误) {
      显示错误('添加 PDF 文件失败', 错误 instanceof Error ? 错误.message : '请检查文件路径和读取权限')
    } finally {
      set正在读取(false)
    }
  }

  const 打印当前文件 = async () => {
    const 文件 = 文件列表.find((项) => 项.标识 === 预览标识)
    if (!文件) { 显示错误('无法打印', '请先添加并选择 PDF 文件。'); return }
    set打印预览({ 内容: 文件.数据, 标题: 文件.名称 })
  }

  const 移除文件 = (标识: string) => {
    const 剩余 = 文件列表.filter((文件) => 文件.标识 !== 标识)
    set文件列表(剩余)
    if (预览标识 === 标识) set预览标识(剩余[0]?.标识 ?? null)
    onRemoved?.(标识)
  }

  const 展开操作 = (目标: PDF命令) => {
    set命令(目标)
    set工具展开(true)
  }

  const 保存结果 = async (数据: string, 默认名称: string) => {
    set文件列表(当前 => 当前.map(f => f.标识 === 预览标识 ? {...f, 数据} : f))
    onEdited?.(数据)
    const 原始路径 = await 桥接.showSaveDialog(默认名称, 'pdf')
    if (!原始路径) return
    const 扩展 = 原始路径.match(/\.[^\\/]+$/)?.[0]?.toLowerCase()
    if (扩展 !== undefined && 扩展 !== '.pdf') {
      显示错误('PDF 保存失败', '请选择 PDF 格式的文件路径；当前路径不能保存处理结果。')
      return
    }
    const 路径 = 扩展 === undefined ? `${原始路径}.pdf` : 原始路径
    const 保存 = await 桥接.saveToFile(路径, Uint8Array.from(atob(数据), (字符) => 字符.charCodeAt(0)), '二进制')
    if (!保存.成功) { 显示错误('PDF 保存失败', 保存.错误 ?? '请检查目标目录的写入权限后重试。'); return }
    try { onSaved?.(路径, 数据) }
    catch (错误) { 显示错误('PDF 标签打开失败', `文件已保存到「${路径}」，但无法在标签中打开：${错误 instanceof Error ? 错误.message : '未知错误'}`); return }
    message.success('PDF 已保存')
  }

  const 选择编辑图片 = async (事件: ChangeEvent<HTMLInputElement>) => {
    const 文件 = 事件.target.files?.[0]
    if (!文件) return
    if (!['image/png', 'image/jpeg'].includes(文件.type)) { 显示错误('图片格式不支持', '请选择 PNG 或 JPEG 图片。'); return }
    try { set编辑图片((await 读取PDF文件(文件)).数据) }
    catch (错误) { 显示错误('图片读取失败', 错误 instanceof Error ? 错误.message : '无法读取图片') }
  }

  const 执行编辑 = async () => {
    if (!当前文件) { 显示错误('请选择文件', '请先添加 PDF 文件。'); return }
    if (编辑类型 === 'image' && !编辑图片) { 显示错误('请选择图片', '请先选择 PNG 或 JPEG 图片。'); return }
    set正在处理(true)
    try {
      const 结果 = await 桥接.pdf.editPage(当前文件.数据, { 类型: 编辑类型, 页码: Number(编辑页码), x: Number(编辑横坐标), y: Number(编辑纵坐标), 宽: Number(编辑宽度), 高: Number(编辑高度), 字号: Number(编辑字号), 颜色: 编辑颜色, 文字: 编辑文字, 图片: 编辑图片 })
      if (!结果.成功 || !结果.数据) { 显示错误('PDF 编辑失败', 结果.错误 || '请检查编辑参数。'); return }
      await 保存结果(结果.数据, '编辑后的文档.pdf')
    } catch (错误) { 显示错误('PDF 编辑失败', 错误 instanceof Error ? 错误.message : '无法编辑 PDF') }
    finally { set正在处理(false) }
  }

  const 执行 = async () => {
    if (文件列表.length === 0 || 当前文件 === null) {
      显示错误('请选择文件', '请先添加需要处理的 PDF 文件。')
      return
    }
    if (命令 === 'merge' && 文件列表.length < 2) {
      显示错误('无法合并文件', '合并至少需要两个 PDF 文件，请继续添加文件。')
      return
    }
    const 页面 = ['merge', 'insertBlank'].includes(命令) ? [] : 解析页码(页码)
    if (!['merge', 'insertBlank'].includes(命令) && 页面.length === 0) {
      显示错误('页码无效', '请输入有效页码，例如 1,3-5。')
      return
    }
    set正在处理(true)
    try {
      const 来源 = 文件列表.find((文件) => 文件.标识 === 插入来源)
      if (命令 === 'insertPages' && !来源) { 显示错误('请选择来源 PDF', '请添加并选择要插入页面的另一个 PDF 文件。'); return }
      const 结果 = 命令 === 'extract'
        ? await 桥接.pdf.extract(当前文件.数据, 页面)
        : 命令 === 'delete'
          ? await 桥接.pdf.delete(当前文件.数据, 页面)
          : 命令 === 'rotate'
            ? await 桥接.pdf.rotate(当前文件.数据, 页面, 角度)
            : 命令 === 'insertBlank' ? await 桥接.pdf.insertBlank(当前文件.数据, Number(插入位置))
              : 命令 === 'insertPages' ? await 桥接.pdf.insertPages(当前文件.数据, 来源!.数据, 页面, Number(插入位置))
                : await 桥接.pdf.merge(文件列表.map((文件) => 文件.数据))
      if (!结果.成功 || !结果.数据) {
        显示错误('PDF 操作失败', 结果.错误 ?? '请检查文件内容和页码后重试。')
        return
      }
      await 保存结果(结果.数据, '处理后的文档.pdf')
    } catch (错误) {
      显示错误('PDF 操作失败', 错误 instanceof Error ? 错误.message : '请检查文件内容后重试。')
    } finally {
      set正在处理(false)
    }
  }

  return (
    <section className={`pdf-workbench${工具展开 ? '' : ' pdf-workbench--collapsed'}`}>
      <PdfViewer 数据={当前文件?.数据} 文件名={当前文件?.名称} onError={(文本) => 显示错误('PDF 预览失败', 文本)} />
      <aside className="pdf-workbench__panel">
        <input
          ref={文件选择器}
          className="pdf-workbench__file-input"
          type="file"
          accept=".pdf,application/pdf"
          multiple
          aria-label="选择 PDF 文件"
          onChange={选择文件}
        />
        <div className="pdf-workbench__rail" aria-label="PDF 工具栏">
          <button type="button" className="pdf-workbench__rail-button" aria-label={工具展开 ? '收起 PDF 工具' : '展开 PDF 工具'} title={工具展开 ? '收起工具' : '展开工具'} aria-expanded={工具展开} onClick={() => set工具展开((当前) => !当前)}><Icon name="sliders" size={18} /></button>
          <button type="button" className="pdf-workbench__rail-button" aria-label="添加 PDF 文件" title="添加 PDF 文件" onClick={() => void 添加PDF文件()}><Icon name="plus" size={18} /></button>
          <button type="button" className="pdf-workbench__rail-button" aria-label="打印 PDF" title="打印 PDF" disabled={!当前文件} onClick={() => void 打印当前文件()}><Icon name="pdf" size={18} /></button>
          {([
            ['extract', 'export-file'],
            ['merge', 'copy'],
            ['delete', 'trash'],
            ['rotate', 'retry'],
            ['insertBlank', 'plus'],
            ['insertPages', 'copy'],
          ] as Array<[PDF命令, string]>).map(([操作, 图标]) => (
            <button key={操作} type="button" className={`pdf-workbench__rail-button${工具展开 && 命令 === 操作 ? ' pdf-workbench__rail-button--active' : ''}`} aria-label={PDF命令表[操作]} title={PDF命令表[操作]} aria-pressed={工具展开 && 命令 === 操作} onClick={() => 展开操作(操作)}><Icon name={图标} size={18} /></button>
          ))}
        </div>
        {工具展开 && <div className="pdf-workbench__panel-content">
        <div className="pdf-workbench__intro">
          <h1>PDF 工具</h1>
          <p>阅读、复制、编辑内容，以及管理 PDF 页面。</p>
        </div>
        <Button block onClick={() => void 添加PDF文件()} loading={正在读取}>添加 PDF 文件</Button>
        {文件列表.length > 0 && (
          <div className="pdf-workbench__files">
            <h2>已选文件（{文件列表.length}）</h2>
            <ul>
              {文件列表.map((文件) => (
                <li key={文件.标识} className={文件.标识 === 预览标识 ? 'pdf-workbench__file pdf-workbench__file--active' : 'pdf-workbench__file'}>
                  <button type="button" className="pdf-workbench__file-name" aria-label={`预览 ${文件.名称}`} aria-pressed={文件.标识 === 预览标识} title={文件.名称} onClick={() => { set预览标识(文件.标识); onSelected?.(文件.标识) }}>{文件.名称}</button>
                  <button type="button" className="pdf-workbench__remove" aria-label={`移除 ${文件.名称}`} onClick={() => 移除文件(文件.标识)}>移除</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="pdf-workbench__operation">
          <h2>页面处理</h2>
          <label htmlFor="pdf-command">操作类型</label>
          <Select
            id="pdf-command"
            aria-label="PDF 操作"
            value={命令}
            onChange={set命令}
            options={Object.entries(PDF命令表).map(([value, label]) => ({ value, label }))}
          />
          {!['merge', 'insertBlank'].includes(命令) && (
            <>
              <label htmlFor="pdf-page-range">处理页码</label>
              <Input id="pdf-page-range" aria-label="处理页码" value={页码} onChange={(事件) => set页码(事件.target.value)} placeholder="例如 1,3-5" />
            </>
          )}
          {命令 === 'rotate' && (
            <>
              <label htmlFor="pdf-angle">旋转角度</label>
              <Select id="pdf-angle" aria-label="旋转角度" value={角度} onChange={set角度} options={[90, 180, 270].map((value) => ({ value, label: `${value} 度` }))} />
            </>
          )}
          {['insertBlank', 'insertPages'].includes(命令) && <><label htmlFor="pdf-insert-position">插入到第几页之前</label><Input id="pdf-insert-position" aria-label="插入位置" type="number" min={1} value={插入位置} onChange={(事件) => set插入位置(事件.target.value)} /></>}
          {命令 === 'insertPages' && <><label htmlFor="pdf-insert-source">来源文件</label><Select id="pdf-insert-source" aria-label="来源 PDF" value={插入来源 || undefined} onChange={set插入来源} options={文件列表.filter((文件) => 文件.标识 !== 当前文件?.标识).map((文件) => ({ value: 文件.标识, label: 文件.名称 }))} /></>}
          <Button type="primary" block onClick={执行} loading={正在处理} disabled={正在读取}>执行并保存</Button>
        </div>
        <div className="pdf-workbench__operation">
          <h2>编辑内容</h2>
          <p>坐标从页面左上角起，单位为点。修改后另存为新 PDF。</p>
          <label htmlFor="pdf-edit-type">编辑操作</label>
          <Select id="pdf-edit-type" aria-label="编辑操作" value={编辑类型} onChange={set编辑类型} options={[{ value: 'text', label: '添加文字' }, { value: 'replace', label: '可见文字替换' }, { value: 'note', label: '添加可见批注' }, { value: 'image', label: '插入图片' }, { value: 'cover', label: '遮盖区域' }]} />
          <label htmlFor="pdf-edit-page">页码</label><Input id="pdf-edit-page" aria-label="编辑页码" type="number" min={1} value={编辑页码} onChange={(事件) => set编辑页码(事件.target.value)} />
          <label htmlFor="pdf-edit-x">横坐标 X</label><Input id="pdf-edit-x" aria-label="横坐标 X" type="number" min={0} value={编辑横坐标} onChange={(事件) => set编辑横坐标(事件.target.value)} />
          <label htmlFor="pdf-edit-y">纵坐标 Y</label><Input id="pdf-edit-y" aria-label="纵坐标 Y" type="number" min={0} value={编辑纵坐标} onChange={(事件) => set编辑纵坐标(事件.target.value)} />
          {['text', 'note', 'replace'].includes(编辑类型) && <><label htmlFor="pdf-edit-text">文字内容</label><Input.TextArea id="pdf-edit-text" aria-label="文字内容" value={编辑文字} onChange={(事件) => set编辑文字(事件.target.value)} /><label htmlFor="pdf-edit-size">字号</label><Input id="pdf-edit-size" aria-label="字号" type="number" min={4} max={72} value={编辑字号} onChange={(事件) => set编辑字号(事件.target.value)} /></>}
          {['image', 'cover', 'replace'].includes(编辑类型) && <><label htmlFor="pdf-edit-width">宽度</label><Input id="pdf-edit-width" aria-label="宽度" type="number" min={1} value={编辑宽度} onChange={(事件) => set编辑宽度(事件.target.value)} /><label htmlFor="pdf-edit-height">高度</label><Input id="pdf-edit-height" aria-label="高度" type="number" min={1} value={编辑高度} onChange={(事件) => set编辑高度(事件.target.value)} /></>}
          {编辑类型 === 'image' && <><input ref={图片选择器} type="file" accept="image/png,image/jpeg" aria-label="选择插入图片" onChange={(事件) => void 选择编辑图片(事件)} /><span>{编辑图片 ? '图片已就绪' : '请选择图片'}</span></>}
          {编辑类型 !== 'image' && <><label htmlFor="pdf-edit-color">颜色</label><Input id="pdf-edit-color" aria-label="颜色" type="color" value={编辑颜色} onChange={(事件) => set编辑颜色(事件.target.value)} /></>}
          {['cover', 'replace'].includes(编辑类型) && <p>遮盖或可见文字替换只改变显示，原文字仍可能被复制或搜索；请勿用于敏感信息脱敏。</p>}
          <Button type="primary" block onClick={() => void 执行编辑()} loading={正在处理} disabled={!当前文件}>编辑并另存</Button>
        </div>
        </div>}
      </aside>
      {打印预览 && <PrintPreview 内容={打印预览.内容} 格式="pdf" 标题={打印预览.标题} onClose={() => set打印预览(null)} />}
    </section>
  )
}

export default PdfWorkbench
