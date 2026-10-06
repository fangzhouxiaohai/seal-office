import AnimationPanel from './panels/AnimationPanel'
import FormulaPanel from './panels/FormulaPanel'
import SymbolPanel from './panels/SymbolPanel'
import AttachmentPanel from './panels/AttachmentPanel'
import { 附件资源类型, 创建附件, 读取文件Base64, 下载二进制Base64 } from './model/attachments'
import { 对象允许编辑, 要求对象可编辑 } from './model/objectPermissions'
import { 添加语义节点, 添加语义连线 } from './model/elements'
// 演示文稿编辑器容器：装配 Ribbon、缩略图、画布与状态栏。
import React, { useEffect, useRef, useState } from 'react'
import { App as AntdApp } from 'antd'
import { HistoryStack } from '../editor/history'
import { 桥接 } from '../ipc/bridge'
import { 下载文本 } from '../editor/exportDoc'
import RibbonTabs from '../editor/ribbon/RibbonTabs'
import RibbonPanel from '../editor/ribbon/RibbonPanel'
import { 演示标签 } from './ribbonSpecs'
import { 查找演示命令, type 演示命令上下文 } from './pptCommands'
import { 读取演示命令状态 } from './model/commandStatus'
import { 校验当前Pptx写入能力, 收集演示资源标识 } from './model/migrations'
import {
  创建演示文稿,
  创建文本框,
  切换幻灯片,
  约束位置,
  读取当前幻灯片,
  更新幻灯片,
  重排幻灯片,
  更新文本框,
  type 演示文稿,
  type 演示对象,
} from './deck'
import { 导出为Html预览, 生成演示文件名 } from './deckExport'
import { PptStatusBar, ThumbnailList } from './PptChrome'
import ExportPanel from './panels/ExportPanel'
import SlideCanvas from './SlideCanvas'
import SlideshowView from './SlideshowView'
import { NotesView, SlideSorterView } from './PptViews'
import ContextMenu, { 菜单节点 } from '../components/ContextMenu'
import { useAppStore } from '../store'
import { 记录最近文档 } from '../fileOpen'
import { 恢复导入图片 } from './render/resources'
import type { 图片地址表 } from './render/SlideObjects'
import ObjectPropertiesPanel from './panels/ObjectPropertiesPanel'
import CommentsPanel from './panels/CommentsPanel'
import ReviewPanel from './panels/ReviewPanel'
import { 读取页面批注, 批注导航, 批注对象失效, type 批注位置 } from './model/comments'
import ThemePanel, { 默认字体检测 } from './panels/ThemePanel'
import MasterPanel from './panels/MasterPanel'
import DesignCheckPanel from './panels/DesignCheckPanel'
import {
  匹配内置主题,
  读取有效页脚,
  读取页面尺寸,
  type 主题定义,
} from './model/themes'
import { 解析页面背景, 标记占位符覆盖 } from './model/masters'
import { 删除对象, 替换对象内容, 修改对象, 对齐对象, 分布对象, 组合对象, 解除组合, 调整图层, type 几何修改 } from './model/objectOperations'
import { 解码图片文件 } from './model/imageImport'
import { 使用放映状态 } from './presentationState'

/** 取路径中的文件名，供最近文档记录使用 */
const 基准名 = (路径: string): string => {
  const 规整 = 路径.split('\\').join('/')
  const 部件 = 规整.split('/').filter((项) => 项.length > 0)
  return 部件.length > 0 ? 部件[部件.length - 1] : 路径
}

const 是同一路径 = (左: string, 右: string): boolean =>
  左.replace(/\\/g, '/').toLowerCase() === 右.replace(/\\/g, '/').toLowerCase()

/** 只读状态下仍可使用的命令：查看、放映、文件与审阅查看类入口 */
const 只读可放行命令 = new Set([
  'review.comment', 'review.spell', 'review.commentPrevious', 'review.commentNext',
  'review.commentToggle', 'review.langToSimplified', 'review.langToTraditional',
])
const 只读可放行 = (标识: string): boolean =>
  标识.startsWith('view.') || 标识.startsWith('slideshow.') || 标识.startsWith('file.') || 只读可放行命令.has(标识)

const 规范演示保存路径 = (路径: string): string | null => {
  const 扩展 = 路径.match(/\.[^\\/]+$/)?.[0]?.toLowerCase()
  return 扩展 === undefined ? `${路径}.pptx` : 扩展 === '.pptx' ? 路径 : null
}

const PptEditor = () => {
  const { message, modal } = AntdApp.useApp()
  const { documents, createDoc, markDocumentSaved, 演示文档模型, 更新演示文档模型, 设置演示历史资源, activeDocumentId, 文档路径: 已知文档路径, set文档路径: 设置全局文档路径, 查找保存路径占用, 更新文件指纹 } = useAppStore()
  const 当前文档 = documents.find((项) => 项.id === activeDocumentId)
  const [独立文稿, set独立文稿] = useState<演示文稿>(() => 创建演示文稿())
  const 文稿 = activeDocumentId === null ? 独立文稿 : 演示文档模型[activeDocumentId]
  if (!文稿) throw new Error('演示编辑状态缺失，已阻止覆盖文件')
  const set文稿: React.Dispatch<React.SetStateAction<演示文稿>> = (更新) => {
    if (activeDocumentId === null) set独立文稿(更新)
    else 更新演示文档模型(activeDocumentId, 更新)
  }
  const [选中框标识, set选中框标识] = useState<string | null>(null)
  const [编辑框标识, set编辑框标识] = useState<string | null>(null)
  const [编辑值, set编辑值] = useState('')
  const [当前标签, set当前标签] = useState('start')
  const [当前视图, set当前视图] = useState<'普通' | '浏览' | '备注'>('普通')
  const [缩放, set缩放] = useState(1)
  const [显示网格线, set显示网格线] = useState(false)
  const [图片地址, set图片地址] = useState<图片地址表>({})
  // 导出面板：范围、格式与分辨率，写盘完成后才报告成功
  const [导出打开, set导出打开] = useState(false)
  const [选中对象, set选中对象] = useState<string[]>([])
  const [显示标尺, set显示标尺] = useState(false)
  const [吸附, set吸附] = useState(true)
  const [手动只读, set只读] = useState(false)
  /** 定稿为可恢复的只读标记：与手动只读一起决定编辑权限，不代表加密保护。 */
  const 只读 = 手动只读 || Boolean(文稿.定稿)
  const [显示批注, set显示批注] = useState(true)
  const [审阅区域, set审阅区域] = useState<'检查' | '批注' | '转换' | '定稿' | '比对'>('检查')
  const [转换方向, set转换方向] = useState<'简' | '繁'>('繁')
  const [设计面板, set设计面板] = useState<'主题' | '母版' | '检查' | null>(null)
  const [预览主题候选, set预览主题候选] = useState<主题定义 | null>(null)
  const [参考线, set参考线] = useState({ 垂直: [] as number[], 水平: [] as number[] })
  const [适应, set适应] = useState(false)
  const 适应比例 = useRef(1)
  const 图片输入 = useRef<HTMLInputElement>(null)
  const 附件输入 = useRef<HTMLInputElement>(null)
  const [插入面板, set插入面板] = useState<'公式' | '符号' | '附件' | null>(null)
  const 插入中 = useRef(false)
  const 当前标识引用 = useRef(activeDocumentId); 当前标识引用.current = activeDocumentId
  const 图片引用键 = JSON.stringify([...new Set(收集演示资源标识(文稿))])
  useEffect(() => {
    let 取消 = false
    const 标识列表 = JSON.parse(图片引用键) as string[]
    void Promise.all(标识列表.map(async 标识 => {
      const 结果 = await 桥接.presentationResources.read(标识)
      if (!结果.成功 || !('数据' in 结果) || !结果.数据) throw new Error(结果.错误 ?? `图片资源读取失败：${标识}`)
      const 类型 = 文稿.资源索引?.[标识]?.类型
      if (!类型) throw new Error(`图片资源类型缺失：${标识}`)
      return [标识, `data:${类型};base64,${结果.数据}`] as const
    })).then(条目 => { if (!取消) set图片地址(Object.fromEntries(条目)) }).catch(错误 => {
      if (!取消) modal.error({ title: '图片显示失败', content: 错误 instanceof Error ? 错误.message : '资源读取失败' })
    })
    return () => { 取消 = true }
  }, [图片引用键, activeDocumentId])
  const [文档路径, set文档路径] = useState<string | null>(() => 已知文档路径[activeDocumentId ?? ''] ?? null)

  useEffect(() => {
    set文档路径(已知文档路径[activeDocumentId ?? ''] ?? null)
  }, [activeDocumentId, 已知文档路径])

  const 记录当前路径 = (路径: string, 文件指纹?: string) => {
    set文档路径(路径)
    const 新名称 = 基准名(路径).replace(/\.(pptx|json)$/i, '')
    const 已保存文稿 = { ...文稿, name: 新名称 }
    set文稿((当前) => ({ ...当前, name: 新名称 }))
    if (activeDocumentId !== null) {
      设置全局文档路径(activeDocumentId, 路径)
      if (文件指纹) 更新文件指纹(activeDocumentId, 文件指纹)
      markDocumentSaved(activeDocumentId, '', JSON.stringify(已保存文稿))
    }
  }
  const [菜单可见, set菜单可见] = useState(false)
  const [菜单坐标, set菜单坐标] = useState({ x: 0, y: 0 })
  const [选中起始, set选中起始] = useState<number | undefined>(undefined)
  const [选中结束, set选中结束] = useState<number | undefined>(undefined)
  /** 放映状态：放映中显示全屏视图，索引独立于编辑器的当前页 */
  const [放映中, set放映中] = useState(false)
  const 活动预览 = 使用放映状态()
  const 插图状态 = useRef({ 文稿, 只读, 禁止插图: 放映中 || 活动预览 })
  插图状态.current = { 文稿, 只读, 禁止插图: 放映中 || 活动预览 }
  const [放映索引, set放映索引] = useState(0)
  /** 下拉框打开时保存的选区快照，防止焦点转移导致选区丢失 */
  const 选区快照 = useRef<{ 起始?: number; 结束?: number } | null>(null)
  /** 记录最后一次选中的文本框标识，防止打开下拉框时画布点击清除选框后命令找不到目标 */
  const 最近选中框标识 = useRef<string | null>(null)
  const 历史表 = useRef<Map<string, HistoryStack<演示文稿>>>(new Map())
  const 历史标识 = activeDocumentId ?? '独立文稿'
  let 历史 = 历史表.current.get(历史标识)
  if (历史 === undefined) {
    历史 = new HistoryStack<演示文稿>()
    历史表.current.set(历史标识, 历史)
  }
  const 同步历史资源 = () => 设置演示历史资源(历史标识, 历史.snapshots().flatMap(收集演示资源标识))
  useEffect(() => {
    for (const 标识 of 历史表.current.keys()) {
      if (标识 !== '独立文稿' && !documents.some(文档 => 文档.id === 标识)) {
        历史表.current.delete(标识)
        设置演示历史资源(标识, [])
      }
    }
  }, [documents, 设置演示历史资源])
  useEffect(() => () => {
    for (const 标识 of 历史表.current.keys()) 设置演示历史资源(标识, [])
  }, [设置演示历史资源])
  const 已提示警告 = useRef<Set<string>>(new Set())
  const 保真风险 = 当前文档?.来源路径 && 当前文档.警告?.length
    ? { 来源路径: 当前文档.来源路径, 警告: 当前文档.警告 }
    : null

  const 显示文件错误 = (标题: string, 原因: string) => {
    modal.error({ title: 标题, content: 原因 })
  }

  const 路径被其他标签占用 = (路径: string): boolean => {
    const 标签 = 查找保存路径占用(activeDocumentId, 路径)
    if (标签 === null) return false
    modal.warning({
      title: '保存路径已被其他标签占用',
      content: `“${标签.name}”标签正在使用该路径。请切换到该标签保存，或选择其他路径。`,
      okText: '我知道了',
    })
    return true
  }

  const 展示导入警告 = (警告: string[]) => {
    modal.warning({
      title: '演示文稿内容可能未完整导入',
      content: React.createElement('div', null,
        React.createElement('p', null, '本文件的部分内容无法完整导入。为保护原文件，请通过另存为保存副本。'),
        React.createElement('ul', null, 警告.map((项, 序号) => React.createElement('li', { key: 序号 }, 项)))
      ),
      okText: '我知道了',
    })
  }

  const 提示禁止覆盖 = (警告: string[]) => {
    modal.warning({
      title: '已阻止覆盖来源文件',
      content: React.createElement('div', null,
        React.createElement('p', null, '当前版本无法完整保留此演示文稿的内容。请通过另存为保存到不同路径。'),
        React.createElement('ul', null, 警告.map((项, 序号) => React.createElement('li', { key: 序号 }, 项)))
      ),
      okText: '我知道了',
    })
  }

  const 确认保存副本 = (警告: string[]): Promise<boolean> => new Promise((完成) => {
    modal.confirm({
      title: '确认保存副本',
      content: React.createElement('div', null,
        React.createElement('p', null, '部分内容未完整导入，保存的副本可能缺少以下内容：'),
        React.createElement('ul', null, 警告.map((项, 序号) => React.createElement('li', { key: 序号 }, 项)))
      ),
      okText: '保存副本',
      cancelText: '取消',
      onOk: () => 完成(true),
      onCancel: () => 完成(false),
    })
  })

  useEffect(() => {
    set选中框标识(null)
    set编辑框标识(null)
    set编辑值('')
    set选中起始(undefined)
    set选中结束(undefined)
    set菜单可见(false)
    set放映中(false)
    set放映索引(0)
    set选中对象([])
    set参考线({ 垂直: [], 水平: [] })
    set只读(false)
    set当前视图('普通')
    选区快照.current = null
    最近选中框标识.current = null
  }, [activeDocumentId])

  useEffect(() => {
    if (当前文档?.警告?.length && !已提示警告.current.has(当前文档.id)) {
      已提示警告.current.add(当前文档.id)
      展示导入警告(当前文档.警告)
    }
  }, [当前文档?.id, 当前文档?.警告])

  // 记录初始状态，否则最新状态永远不在栈中，重做将无处可去
  useEffect(() => {
    if (历史.current() === null) 历史.record(文稿)
    同步历史资源()
    // 新建历史栈或切换文档时记录该文档的初始状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [历史])

  // 外部内容修改进入撤销栈；只改变当前浏览页码时无需生成编辑历史。
  useEffect(() => {
    const 已记录 = 历史.current()
    if (已记录 === 文稿) return
    if (已记录 && JSON.stringify({ ...已记录, 当前索引: 0 }) === JSON.stringify({ ...文稿, 当前索引: 0 })) return
    历史.record(文稿)
    同步历史资源()
  }, [历史, 文稿])

  // 放映快捷键：F5 从头开始、Shift+F5 从当前页开始（WPS/Office 惯例）
  const 开始放映 = (索引: number) => {
    if (文稿.幻灯片列表.length === 0) {
      modal.warning({ title: '无法开始放映', content: '请先添加至少一张幻灯片，再开始放映。', okText: '我知道了' })
      return
    }
    set放映索引(索引)
    set放映中(true)
  }
  const 放映键处理引用 = useRef<(事件: KeyboardEvent) => void>(() => {})
  放映键处理引用.current = (事件: KeyboardEvent) => {
    if (事件.key !== 'F5') {
      return
    }
    事件.preventDefault()
    开始放映(事件.shiftKey ? 文稿.当前索引 : 0)
  }
  useEffect(() => {
    const 监听 = (事件: KeyboardEvent) => 放映键处理引用.current(事件)
    document.addEventListener('keydown', 监听)
    return () => document.removeEventListener('keydown', 监听)
  }, [])

  /** 放映中翻页：直接同步当前页，不写入撤销历史 */
  const 放映翻页 = (目标索引: number) => {
    set放映索引(目标索引)
    set文稿((当前) => ({ ...当前, 当前索引: 目标索引 }))
  }

  /** 退出放映：停留于最后浏览的页面 */
  const 退出放映 = () => {
    set放映中(false)
  }

  const 当前幻灯片 = 读取当前幻灯片(文稿)

  /** 应用修改并记录新状态，使撤销与重做都落在真实存在过的快照上 */
  const 更新文稿 = (新文稿: 演示文稿) => {
    // 定稿后只放行「解除定稿」这一项修改，其余编辑一律拒绝，避免绕过只读标记。
    if (只读 && !(文稿.定稿 && !新文稿.定稿)) return
    历史.record(新文稿)
    同步历史资源()
    set文稿(新文稿)
  }
  const 对象提交 = (修改: Record<string, 几何修改>) => {
    if (只读 || !当前幻灯片) return
    try {
      要求对象可编辑(当前幻灯片,Object.keys(修改))
      let 页 = 当前幻灯片
      for (const [标识, 值] of Object.entries(修改)) 页 = 修改对象(页, [标识], 值)
      if (页 !== 当前幻灯片) 更新文稿(更新幻灯片(文稿, 页.id, 页))
    } catch (错误) { 显示文件错误('对象修改失败', 错误 instanceof Error ? 错误.message : '对象属性无效') }
  }
  const 对象操作 = (命令: string) => {
    if (只读 || !当前幻灯片) return
    try {
      let 页 = 当前幻灯片
      const [操作, 参数] = 命令.split(':')
      if (操作 === '锁定') { if (选中对象.some(id => !对象允许编辑(页,id))) throw new Error('请先解锁所属组合') }
      else if (操作 !== '解锁') 要求对象可编辑(页,选中对象)
      else if (选中对象.some(id => !对象允许编辑(页,id,true))) throw new Error('请先解锁所属组合')
      if (操作 === '新增节点') 页 = 添加语义节点(页, 选中对象[0])
      if (操作 === '新增连线') { const [起点,终点] = 参数.split(','); 页 = 添加语义连线(页, 选中对象[0], 起点, 终点) }
      if (操作 === '对齐') 页 = 对齐对象(页, 选中对象, 参数 as Parameters<typeof 对齐对象>[2])
      if (操作 === '分布') 页 = 分布对象(页, 选中对象, 参数 as '水平'|'垂直')
      if (操作 === '图层') 页 = 调整图层(页, 选中对象, 参数 as Parameters<typeof 调整图层>[2])
      if (操作 === '组合') { const 标识 = `group-${crypto.randomUUID()}`; 页 = 组合对象(页, 选中对象, 标识); set选中对象([标识]) }
      if (操作 === '取消组合') { 页 = 解除组合(页, 选中对象); set选中对象([]) }
      if (操作 === '锁定' || 操作 === '解锁') 页 = 修改对象(页, 选中对象, { 锁定: 操作 === '锁定' })
      if (操作 === '删除') {
        页 = 删除对象(页,选中对象); set选中对象([])
      }
      if (页 !== 当前幻灯片) 更新文稿(更新幻灯片(文稿, 页.id, 页))
    } catch (错误) { 显示文件错误('对象操作失败', 错误 instanceof Error ? 错误.message : '对象操作失败') }
  }
  const 插入图片 = async (文件列表: File[]) => {
    if (只读 || 插图状态.current.禁止插图 || !当前幻灯片 || !文件列表.length || 插入中.current) return
    插入中.current = true
    const 临时引用: string[] = []
    try {
      const 解码列表 = await Promise.all(文件列表.map(解码图片文件))
      const 资源索引 = { ...文稿.资源索引 }, 对象列表 = [...当前幻灯片.对象列表 ?? []], 新标识: string[] = []
      for (const 图片 of 解码列表) {
        const 结果 = await 桥接.presentationResources.add(图片.数据, 图片.类型)
        if (!结果.成功 || !('标识' in 结果) || !结果.标识 || !结果.字节数) throw new Error(结果.错误 ?? '图片资源加入失败')
        临时引用.push(结果.标识)
        资源索引[结果.标识] = { 指纹: 结果.标识, 类型: 图片.类型, 字节数: 结果.字节数 }
        const 比例 = Math.min(1, 720 / 图片.宽, 400 / 图片.高), width = 图片.宽 * 比例, height = 图片.高 * 比例, id = `image-${crypto.randomUUID()}`
        对象列表.push({ id, 类型: '图片', x: (960 - width) / 2, y: (540 - height) / 2, width, height, 资源标识: 结果.标识 }); 新标识.push(id)
      }
      if (当前标识引用.current !== activeDocumentId) throw new Error('图片处理期间文档已切换，请重新插入')
      if (插图状态.current.禁止插图) throw new Error('图片处理期间已进入放映或预览，请返回编辑后重新插入')
      if (插图状态.current.只读) throw new Error('图片处理期间已开启只读，请关闭只读后重新插入')
      if (插图状态.current.文稿 !== 文稿 || !插图状态.current.文稿.幻灯片列表.some(页 => 页.id === 当前幻灯片.id)) throw new Error('图片处理期间文稿已变化，请重新插入')
      更新文稿({ ...更新幻灯片(文稿, 当前幻灯片.id, { 对象列表 }), 资源索引 })
      set选中对象(新标识); set选中框标识(null)
    } catch (错误) { 显示文件错误('图片插入失败', 错误 instanceof Error ? 错误.message : '图片读取失败') }
    finally {
      for (const 标识 of 临时引用) {
        const 结果 = await 桥接.presentationResources.dropTemporary(标识)
        if (!结果.成功) 显示文件错误('图片资源释放失败', 结果.错误 ?? '临时引用释放失败')
      }
      插入中.current = false
    }
  }

  /** 插入公式：进入撤销历史，随文稿保存为原生数学部件。 */
  const 插入公式对象 = (对象: 演示对象) => {
    if (只读 || !当前幻灯片) return
    try {
      更新文稿(更新幻灯片(文稿, 当前幻灯片.id, { 对象列表: [...当前幻灯片.对象列表 ?? [], 对象] }))
      set选中对象([对象.id]); set选中框标识(null)
      message.success('已插入公式')
    } catch (错误) { 显示文件错误('公式插入失败', 错误 instanceof Error ? 错误.message : '公式数据无效') }
  }

  /** 符号按普通文字写入文本框：可继续编辑、设置字体并原生保存。 */
  const 插入符号 = (字符: string, 字体: string) => {
    if (只读 || !当前幻灯片) return
    try {
      const 框 = 创建文本框(200, 240, 160, 80, 字符, 36)
      框.字体 = 字体; 框.对齐 = 'center'
      更新文稿(更新幻灯片(文稿, 当前幻灯片.id, { 文本框列表: [...当前幻灯片.文本框列表, 框] }))
      set选中框标识(框.id); set选中对象([])
      message.success(`已插入符号 ${字符}`)
    } catch (错误) { 显示文件错误('符号插入失败', 错误 instanceof Error ? 错误.message : '符号无法插入') }
  }

  /** 插入附件：保存真实字节并进入资源链路，本机不执行附件内容。 */
  const 插入附件 = async (文件: File) => {
    if (只读 || !当前幻灯片) return
    const 临时引用: string[] = []
    try {
      const 数据 = await 读取文件Base64(文件)
      const 结果 = await 桥接.presentationResources.add(数据, 附件资源类型)
      if (!结果.成功 || !('标识' in 结果) || !结果.标识 || !结果.字节数) throw new Error(结果.错误 ?? '附件资源加入失败')
      临时引用.push(结果.标识)
      if (当前标识引用.current !== activeDocumentId) throw new Error('附件处理期间文档已切换，请重新插入')
      const 对象 = 创建附件(文件.name, 文件.name, 结果.标识, 结果.字节数)
      const 资源索引 = { ...文稿.资源索引, [结果.标识]: { 指纹: 结果.标识, 类型: 附件资源类型, 字节数: 结果.字节数 } }
      更新文稿({ ...更新幻灯片(文稿, 当前幻灯片.id, { 对象列表: [...当前幻灯片.对象列表 ?? [], 对象] }), 资源索引 })
      set选中对象([对象.id]); set选中框标识(null); set插入面板('附件')
      临时引用.length = 0
      message.success(`已嵌入附件 ${文件.name}`)
    } catch (错误) { 显示文件错误('附件插入失败', 错误 instanceof Error ? 错误.message : '附件读取失败') }
    finally {
      for (const 标识 of 临时引用) {
        const 结果 = await 桥接.presentationResources.dropTemporary(标识)
        if (!结果.成功) 显示文件错误('附件资源释放失败', 结果.错误 ?? '临时引用释放失败')
      }
    }
  }

  /** 导出附件原字节；读取失败时显示真实原因，不生成空文件。 */
  const 导出附件 = async (对象: 演示对象) => {
    try {
      if (对象.类型 !== '附件' || !对象.附件) throw new Error('请选择附件对象')
      const 结果 = await 桥接.presentationResources.read(对象.附件.资源标识)
      if (!结果.成功 || !('数据' in 结果) || !结果.数据) throw new Error(结果.错误 ?? '附件字节读取失败')
      下载二进制Base64(结果.数据, 对象.附件.文件名)
      message.success(`已导出 ${对象.附件.文件名}`)
    } catch (错误) { 显示文件错误('附件导出失败', 错误 instanceof Error ? 错误.message : '附件读取失败') }
  }

  const 图片粘贴引用 = useRef(插入图片); 图片粘贴引用.current = 插入图片
  useEffect(() => {
    const 粘贴 = (事件: ClipboardEvent) => {
      const 目标 = 事件.target instanceof Element ? 事件.target : null
      if (目标?.closest('input,textarea,[contenteditable="true"],[role="textbox"]') || 插图状态.current.只读 || 插图状态.current.禁止插图) return
      const 文件 = Array.from(事件.clipboardData?.files ?? [])
      if (文件.length) { 事件.preventDefault(); void 图片粘贴引用.current(文件) }
    }
    document.addEventListener('paste', 粘贴)
    return () => document.removeEventListener('paste', 粘贴)
  }, [])

  const 粘贴系统图片 = async () => {
    try {
      if (!navigator.clipboard?.read) throw new Error('当前环境无法读取系统图片剪贴板，请使用键盘粘贴')
      const 文件: File[] = []
      for (const 条目 of await navigator.clipboard.read()) {
        const 类型 = 条目.types.find(值 => 值.startsWith('image/'))
        if (类型) 文件.push(new File([await 条目.getType(类型)], '剪贴板图片', { type: 类型 }))
      }
      if (!文件.length) throw new Error('系统剪贴板没有图片，请复制图片后再粘贴')
      await 图片粘贴引用.current(文件)
    } catch (错误) { 显示文件错误('图片粘贴失败', 错误 instanceof Error ? 错误.message : '剪贴板读取失败') }
  }

  /** 撤销：回到上一份演示文稿快照 */
  const 撤销 = () => {
    const 上一步 = 历史.undo()
    if (上一步 === null) {
      message.info('没有可撤销的操作')
      return
    }
    set文稿(上一步)
    set选中框标识(null)
    message.success('已撤销')
  }

  /** 重做：前进到下一份演示文稿快照 */
  const 重做 = () => {
    const 下一步 = 历史.redo()
    if (下一步 === null) {
      message.info('没有可重做的操作')
      return
    }
    set文稿(下一步)
    set选中框标识(null)
    message.success('已重做')
  }

  /** 跳到上一条或下一条批注：切换页面并选中对应对象，不修改正文 */
  const 跳转批注 = (方向: -1 | 1) => 定位批注(批注导航(文稿, 当前幻灯片?.id ?? '', 方向))

  /** 定位到指定批注位置；位置为空时给出提示，不修改文稿 */
  const 定位批注 = (位置: 批注位置 | null) => {
    if (位置 === null) {
      message.info('没有更多批注')
      return
    }
    const 索引 = 文稿.幻灯片列表.findIndex((页) => 页.id === 位置.页标识)
    if (索引 < 0) {
      modal.warning({ title: '无法定位批注', content: '批注引用的页面已不存在，请检查批注列表。', okText: '我知道了' })
      return
    }
    if (索引 !== 文稿.当前索引) 更新文稿(切换幻灯片(文稿, 索引))
    set选中框标识(位置.对象标识 ?? null)
    set选中对象(位置.对象标识 ? [位置.对象标识] : [])
    set当前标签('review')
    set审阅区域('批注')
  }

  const 上下文: 演示命令上下文 = {
    文稿,
    选中框标识: 选中框标识 ?? 最近选中框标识.current,
    选中起始,
    选中结束,
    选区快照: 选区快照.current,
    更新文稿,
    notify: (文本: string) => message.info(文本),
    提示功能限制: (标题: string, 内容: string) => modal.warning({ title: 标题, content: 内容, okText: '我知道了' }),
    切换视图: set当前视图,
    打开设计面板: (面板) => set设计面板(面板),
    通知预览: (主题) => set预览主题候选(主题),
    撤销,
    重做,
    打开审阅: (区域, 参数) => {
      set当前标签('review')
      set审阅区域(区域)
      if (参数 === '简' || 参数 === '繁') set转换方向(参数)
    },
    跳转批注,
    切换批注显示: () => set显示批注((值) => !值),
  }

  const 处理文本选择 = (标识: string, 起始: number, 结束: number) => {
    if (选中框标识 !== 标识) return
    最近选中框标识.current = 标识
    set选中起始(起始)
    set选中结束(结束)
  }

  /** 包装选框回调，同步更新最近选中框标识 */
  const 处理选框 = (标识: string | null) => {
    if (标识 !== null) 最近选中框标识.current = 标识
    set选中框标识(标识)
  }

  /** 下拉框打开前保存选区快照 */
  const 处理下拉框打开 = () => {
    选区快照.current = { 起始: 选中起始, 结束: 选中结束 }
  }

  const 执行命令 = (标识: string, 参数?: string) => {
    if (只读 && !只读可放行(标识)) return
    if (标识 === 'insert.picture') { 图片输入.current?.click(); return }
    if (标识 === 'insert.attachment') { set当前标签('insert'); set插入面板('附件'); 附件输入.current?.click(); return }
    if (标识 === 'insert.formula') { set当前标签('insert'); set插入面板('公式'); return }
    if (标识 === 'insert.symbol') { set当前标签('insert'); set插入面板('符号'); return }
    if (标识 === 'edit.pasteImage') { void 粘贴系统图片(); return }
    // 右键菜单的剪切/复制/粘贴命令映射到剪贴板命令，走统一命令注册表
    if (标识 === 'edit.cut' || 标识 === 'edit.copy') {
      标识 = 'clipboard.copy'
    } else if (标识 === 'edit.paste') {
      标识 = 'clipboard.paste'
    }
    if (标识 === 'view.gridlines') {
      const 目标 = !显示网格线
      set显示网格线(目标)
      message.info(目标 ? '已显示网格线' : '已隐藏网格线')
      return
    }
    if (标识 === 'slideshow.start' || 标识 === 'slideshow.current') {
      // F5 从头放映，Shift+F5 从当前页放映
      开始放映(标识 === 'slideshow.start' ? 0 : 文稿.当前索引)
      return
    }
    if (标识 === 'view.zoomIn' || 标识 === 'view.zoomOut') {
      set适应(false)
      set缩放((当前) =>
        Math.min(4, Math.max(0.1, Number((当前 + (标识 === 'view.zoomIn' ? 0.1 : -0.1)).toFixed(2))))
      )
      return
    }
    if (标识 === 'file.exportDialog') {
      set导出打开(true)
      return
    }
    if (标识 === 'file.exportHtml') {
      let 内容: string
      try { 内容 = 导出为Html预览(文稿, 文稿.name, 图片地址) } catch (错误) { 显示文件错误('预览导出失败', 错误 instanceof Error ? 错误.message : '预览资源读取失败'); return }
      if (内容.length === 0) {
        message.warning('演示文稿为空，没有可导出的内容')
        return
      }
      下载文本(内容, 生成演示文件名(文稿.name, 'html'), 'text/html')
      message.success('已导出为网页文件')
      return
    }
    // 文件操作命令
    if (标识 === 'file.open') {
      if (!桥接.可用) {
        message.info('当前环境不支持打开文件功能，请使用打包后的版本')
        return
      }
      桥接.showOpenDialog('ppt' as const).then((文件路径) => {
        if (文件路径) {
          // 判断文件扩展名
          const 扩展 = 文件路径.slice((文件路径.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase()
          if (扩展 === 'pptx') {
            // pptx 文件：读取为二进制，通过主进程解析为演示文稿模型
            桥接.readFile(文件路径).then((读取结果) => {
              if (读取结果.成功 && 读取结果.二进制 && 读取结果.内容) {
                桥接.office.readPptx(读取结果.内容).then(async (解析结果) => {
                  if (解析结果 && 解析结果.演示文稿) {
                    const 警告 = Array.isArray(解析结果.警告) ? 解析结果.警告 as string[] : []
                    const 恢复文稿 = await 恢复导入图片(解析结果)
                    const 恢复主题 = 恢复文稿.主题 ? 匹配内置主题(恢复文稿.主题 as 主题定义) : undefined
                    恢复文稿.主题 = 恢复主题
                    createDoc('ppt', 恢复文稿, { 路径: 文件路径, 警告, 文件指纹: 读取结果.文件指纹 })
                    void 记录最近文档(文件路径, 基准名(文件路径), 'ppt')
                  } else {
                    显示文件错误('打开文件失败', 解析结果?.错误 || '演示文稿格式转换失败，请检查内容后重试')
                  }
                }).catch((error: unknown) => {
                  显示文件错误('打开文件失败', (error as Error).message || '未知错误')
                })
              } else {
                显示文件错误('打开文件失败', 读取结果.错误 || '文件读取失败')
              }
            }).catch((error: unknown) => {
              显示文件错误('打开文件失败', (error as Error).message || '未知错误')
            })
          } else {
            // json 文件：直接解析
            桥接.readFile(文件路径).then((结果) => {
              if (结果.成功 && 结果.内容) {
                try {
                  const 数据 = JSON.parse(结果.内容) as 演示文稿
                  createDoc('ppt', 数据)
                } catch (错误) {
                  显示文件错误('打开文件失败', 错误 instanceof SyntaxError ? '文件格式不正确，无法打开' : 错误 instanceof Error ? 错误.message : '未知错误')
                }
              } else {
                显示文件错误('打开文件失败', 结果.错误 || '未知错误')
              }
            }).catch((error: unknown) => {
              显示文件错误('打开文件失败', (error as Error).message || '未知错误')
            })
          }
        }
      }).catch((error: unknown) => {
        显示文件错误('打开文件失败', (error as Error).message || '未知错误')
      })
      return
    }
    if (标识 === 'file.save') {
      if (!桥接.可用) {
        message.info('当前环境不支持保存功能，请使用打包后的版本')
        return
      }
      if (保真风险 && 文档路径 && 是同一路径(文档路径, 保真风险.来源路径)) {
        提示禁止覆盖(保真风险.警告)
        return
      }
      const 基准名 = 文稿.name.replace(/\.(pptx|pptx\.json)$/i, '').trim()
      const 默认路径 = 文档路径 ?? `${基准名 || '未命名演示'}.pptx`
      Promise.resolve(文档路径 ?? 桥接.showSaveDialog(默认路径, 'ppt' as const)).then(async (原始文件路径: string | null) => {
        if (原始文件路径) {
          const 文件路径 = 规范演示保存路径(原始文件路径)
          if (!文件路径) {
            显示文件错误('保存失败', '请选择 PPTX 格式的文件路径；当前路径不能保存为演示文稿。')
            return
          }
          if (路径被其他标签占用(文件路径)) return
          if (保真风险 && 是同一路径(文件路径, 保真风险.来源路径)) {
            提示禁止覆盖(保真风险.警告)
            return
          }
          // 富格式保存：位置、字号、颜色、加粗、斜体、对齐、背景色随文件保存，
          // 重新打开时由 pptxCodec 还原为相同的演示文稿模型
          校验当前Pptx写入能力(文稿)
          const 幻灯片模型 = 文稿.幻灯片列表.map((幻灯片) => ({
            id: 幻灯片.id,
            背景色: 幻灯片.背景色,
            过渡效果: 幻灯片.过渡效果,
            动画: 幻灯片.动画,
            切换: 幻灯片.切换, 换片: 幻灯片.换片, 隐藏: 幻灯片.隐藏, 动画序列: 幻灯片.动画序列,
            对象列表: 幻灯片.对象列表,
            备注: 幻灯片.备注,
            背景填充: 幻灯片.背景填充,
            背景继承: 幻灯片.背景继承,
            母版标识: 幻灯片.母版标识,
            版式标识: 幻灯片.版式标识,
            主题标识: 幻灯片.主题标识,
            页脚: 幻灯片.页脚,
            文本框: 幻灯片.文本框列表.map((框) => ({
              id: 框.id,
              x: 框.x,
              y: 框.y,
              width: 框.width,
              height: 框.height,
              text: 框.text,
              字号: 框.字号,
              字体: 框.字体,
              加粗: 框.加粗,
              斜体: 框.斜体,
              下划线: 框.下划线,
              颜色: 框.颜色,
              对齐: 框.对齐,
              颜色引用: 框.颜色引用,
              字体引用: 框.字体引用,
              占位符: 框.占位符,
              占位符标识: 框.占位符标识,
              占位符继承: 框.占位符继承,
              片段: (框.片段列表 ?? []).map((片段) => ({
                文本: 片段.文本,
                加粗: 片段.加粗 === true,
                斜体: 片段.斜体 === true,
                下划线: 片段.下划线 === true,
                颜色: 片段.颜色,
              })),
            })),
          }))
          const 资源结果 = 收集演示资源标识(文稿).length ? await 桥接.presentationResources.export(收集演示资源标识(文稿)) : { 成功: true, 条目: [] }
          if (!资源结果.成功 || !资源结果.条目) throw new Error(资源结果.错误 ?? '图片资源导出失败')
          const 模型 = { 循环放映: 文稿.循环放映, 主题: 文稿.主题, 母版列表: 文稿.母版列表, 页面尺寸: 文稿.页面尺寸, 页脚设置: 文稿.页脚设置, 幻灯片: 幻灯片模型, 资源条目: 资源结果.条目 }
          const 预期文件指纹 = 当前文档 && 文档路径 && 是同一路径(文件路径, 文档路径)
            ? 当前文档.文件指纹 : undefined
          桥接.office.writePptx(模型).then((结果: any) => {
            if (结果 && 结果.成功 && 结果.数据) {
              if (路径被其他标签占用(文件路径)) return
              const 二进制内容 = 结果.数据
              return 桥接.saveToFile(文件路径, 二进制内容, '二进制', 预期文件指纹).then((保存结果: any) => {
                if (保存结果.成功) {
                  记录当前路径(文件路径, 保存结果.文件指纹)
                  message.success('文件已保存')
                } else {
                  显示文件错误('保存失败', 保存结果.错误 || '未知错误')
                }
              })
            } else {
              显示文件错误('保存失败', 结果?.错误 || '生成演示文稿文件失败，请重试')
            }
          }).catch((error: unknown) => {
            显示文件错误('保存失败', (error as Error).message || '未知错误')
          })
        }
      }).catch((error: unknown) => {
        显示文件错误('保存失败', (error as Error).message || '未知错误')
      })
      return
    }
    if (标识 === 'file.saveAs') {
      if (!桥接.可用) {
        message.info('当前环境不支持保存功能，请使用打包后的版本')
        return
      }
      const 基准名 = 文稿.name.replace(/\.(pptx|pptx\.json)$/i, '').trim()
      桥接.showSaveDialog(`${基准名 || '未命名演示'}.pptx`, 'ppt' as const).then(async (原始文件路径: string | null) => {
        if (原始文件路径) {
          const 文件路径 = 规范演示保存路径(原始文件路径)
          if (!文件路径) {
            显示文件错误('保存失败', '请选择 PPTX 格式的文件路径；当前路径不能保存为演示文稿。')
            return
          }
          if (路径被其他标签占用(文件路径)) return
          if (保真风险) {
            if (是同一路径(文件路径, 保真风险.来源路径)) {
              提示禁止覆盖(保真风险.警告)
              return
            }
            if (!await 确认保存副本(保真风险.警告)) return
          }
          // 富格式保存：位置、字号、颜色、加粗、斜体、对齐、背景色随文件保存，
          // 重新打开时由 pptxCodec 还原为相同的演示文稿模型
          校验当前Pptx写入能力(文稿)
          const 幻灯片模型 = 文稿.幻灯片列表.map((幻灯片) => ({
            id: 幻灯片.id,
            背景色: 幻灯片.背景色,
            过渡效果: 幻灯片.过渡效果,
            动画: 幻灯片.动画,
            切换: 幻灯片.切换, 换片: 幻灯片.换片, 隐藏: 幻灯片.隐藏, 动画序列: 幻灯片.动画序列,
            对象列表: 幻灯片.对象列表,
            备注: 幻灯片.备注,
            背景填充: 幻灯片.背景填充,
            背景继承: 幻灯片.背景继承,
            母版标识: 幻灯片.母版标识,
            版式标识: 幻灯片.版式标识,
            主题标识: 幻灯片.主题标识,
            页脚: 幻灯片.页脚,
            文本框: 幻灯片.文本框列表.map((框) => ({
              id: 框.id,
              x: 框.x,
              y: 框.y,
              width: 框.width,
              height: 框.height,
              text: 框.text,
              字号: 框.字号,
              字体: 框.字体,
              加粗: 框.加粗,
              斜体: 框.斜体,
              下划线: 框.下划线,
              颜色: 框.颜色,
              对齐: 框.对齐,
              颜色引用: 框.颜色引用,
              字体引用: 框.字体引用,
              占位符: 框.占位符,
              占位符标识: 框.占位符标识,
              占位符继承: 框.占位符继承,
              片段: (框.片段列表 ?? []).map((片段) => ({
                文本: 片段.文本,
                加粗: 片段.加粗 === true,
                斜体: 片段.斜体 === true,
                下划线: 片段.下划线 === true,
                颜色: 片段.颜色,
              })),
            })),
          }))
          const 资源结果 = 收集演示资源标识(文稿).length ? await 桥接.presentationResources.export(收集演示资源标识(文稿)) : { 成功: true, 条目: [] }
          if (!资源结果.成功 || !资源结果.条目) throw new Error(资源结果.错误 ?? '图片资源导出失败')
          const 模型 = { 循环放映: 文稿.循环放映, 主题: 文稿.主题, 母版列表: 文稿.母版列表, 页面尺寸: 文稿.页面尺寸, 页脚设置: 文稿.页脚设置, 幻灯片: 幻灯片模型, 资源条目: 资源结果.条目 }
          const 预期文件指纹 = 当前文档 && 文档路径 && 是同一路径(文件路径, 文档路径)
            ? 当前文档.文件指纹 : undefined
          桥接.office.writePptx(模型).then((结果: any) => {
            if (结果 && 结果.成功 && 结果.数据) {
              if (路径被其他标签占用(文件路径)) return
              const 二进制内容 = 结果.数据
              return 桥接.saveToFile(文件路径, 二进制内容, '二进制', 预期文件指纹).then((保存结果: any) => {
                if (保存结果.成功) {
                  记录当前路径(文件路径, 保存结果.文件指纹)
                  message.success('文件已另存为')
                } else {
                  显示文件错误('保存失败', 保存结果.错误 || '未知错误')
                }
              })
            } else {
              显示文件错误('保存失败', 结果?.错误 || '生成演示文稿文件失败，请重试')
            }
          }).catch((error: unknown) => {
            显示文件错误('保存失败', (error as Error).message || '未知错误')
          })
        }
      }).catch((error: unknown) => {
        显示文件错误('保存失败', (error as Error).message || '未知错误')
      })
      return
    }
    if (标识 === 'edit.undo') {
      撤销()
      return
    }
    if (标识 === 'edit.redo') {
      重做()
      return
    }
    const 命令 = 查找演示命令(标识)
    if (命令 === undefined) {
      显示文件错误('演示操作失败', '该命令未注册')
      return
    }
    try {
      命令.run(上下文, 参数)
    } catch (错误) {
      显示文件错误('演示操作失败', 错误 instanceof Error ? 错误.message : '请检查所选内容后重试')
    }
  }

  const 提交编辑 = () => {
    if (编辑框标识 !== null && 当前幻灯片 !== null) {
      更新文稿(
        更新幻灯片(文稿, 当前幻灯片.id, {
          文本框列表: 更新文本框(当前幻灯片, 编辑框标识, { text: 编辑值 }).文本框列表,
        })
      )
    }
    set编辑框标识(null)
    set编辑值('')
  }

  const 取激活态 = (标识: string): boolean => {
    if (标识 === 'review.commentToggle') return 显示批注
    const 当前框标识 = 选中框标识 ?? 最近选中框标识.current
    if (当前幻灯片 === null || 当前框标识 === null) {
      return false
    }
    const 框 = 当前幻灯片.文本框列表.find((项) => 项.id === 当前框标识)
    if (框 === undefined) {
      return false
    }
    // 如果有片段列表，检查选中片段中是否有对应格式
    if (框.片段列表 && 框.片段列表.length > 0 && 选中起始 != null && 选中结束 != null) {
      // 简化：有选区时检查选中片段
      const 开始 = Math.min(选中起始, 选中结束)
      const 结束 = Math.max(选中起始, 选中结束)
      if (开始 !== 结束) {
        let 偏移量 = 0
        for (let i = 0; i < 框.片段列表.length; i++) {
          const 片段结束 = 偏移量 + 框.片段列表[i].文本.length
          if (偏移量 < 结束 && 片段结束 > 开始) {
            if (标识 === 'text.bold' && 框.片段列表[i].加粗) return true
            if (标识 === 'text.italic' && 框.片段列表[i].斜体) return true
            if (标识 === 'text.underline' && 框.片段列表[i].下划线) return true
          }
          偏移量 = 片段结束
        }
      }
    }
    if (标识 === 'text.bold') return 框.加粗
    if (标识 === 'text.italic') return 框.斜体
    if (标识 === 'text.underline') return 框.下划线
    if (标识 === 'para.alignLeft') return 框.对齐 === 'left'
    if (标识 === 'para.alignCenter') return 框.对齐 === 'center'
    if (标识 === 'para.alignRight') return 框.对齐 === 'right'
    return false
  }

  const 关闭菜单 = () => {
    set菜单可见(false)
  }

  const 构建演示菜单 = (): 菜单节点[] => {
    return [
      { type: 'group', 子项: [
        { type: 'item', commandId: 'slide.new', label: '新建幻灯片' },
        { type: 'item', commandId: 'slide.duplicate', label: '复制幻灯片' },
        { type: 'item', commandId: 'slide.delete', label: '删除幻灯片' },
      ]},
      { type: 'divider' },
      { type: 'group', 子项: [
        { type: 'item', commandId: 'slide.moveUp', label: '上移' },
        { type: 'item', commandId: 'slide.moveDown', label: '下移' },
      ]},
      { type: 'divider' },
      { type: 'group', 子项: [
        { type: 'item', commandId: 'edit.cut', label: '剪切' },
        { type: 'item', commandId: 'edit.copy', label: '复制' },
        { type: 'item', commandId: 'edit.paste', label: '粘贴' },
        { type: 'item', commandId: 'edit.pasteImage', label: '粘贴图片' },
      ]},
      { type: 'divider' },
      { type: 'group', 子项: [
        { type: 'item', commandId: 'slide.layout', label: '版式' },
        { type: 'item', commandId: 'slide.background', label: '设置背景' },
        { type: 'item', commandId: 'view.gridlines', label: 显示网格线 ? '隐藏网格线' : '显示网格线' },
      ]},
      { type: 'divider' },
      { type: 'group', 子项: [
        { type: 'item', commandId: 'edit.undo', label: '撤销' },
        { type: 'item', commandId: 'edit.redo', label: '重做' },
      ]},
    ]
  }

  /** 批注标记：关联对象时贴在对象左上角，整页批注沿画布左上角竖排；只影响显示 */
  const 批注标记 = !显示批注 || 当前幻灯片 === null ? [] : 读取页面批注(文稿, 当前幻灯片.id).map((批注, 序号) => {
    const 目标 = 当前幻灯片.文本框列表.find((项) => 项.id === 批注.对象标识) ?? 当前幻灯片.对象列表?.find((项) => 项.id === 批注.对象标识)
    return {
      键: 批注.id,
      序号: 序号 + 1,
      x: 目标 ? Math.max(0, 目标.x - 6) : 10,
      y: 目标 ? Math.max(0, 目标.y - 6) : 10 + 序号 * 24,
      标题: `${批注.作者}：${批注.内容}${批注.已解决 ? '（已解决）' : ''}${批注对象失效(文稿, 批注) ? '（对象已删除）' : ''}`,
    }
  })

  /** 替换对象内容：公式、附件显示名称与图形文字共用同一提交入口。 */
  const 替换选中对象 = (对象: 演示对象) => {
    if (只读 || !当前幻灯片) return
    try { 更新文稿(更新幻灯片(文稿, 当前幻灯片.id, 替换对象内容(当前幻灯片,对象))) }
    catch (错误) { 显示文件错误('对象编辑失败', 错误 instanceof Error ? 错误.message : '对象无法编辑') }
  }
  const 选中对象数据 = 选中对象.length === 1 ? 当前幻灯片?.对象列表?.find(项 => 项.id === 选中对象[0]) : undefined
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('input', { ref: 图片输入, type: 'file', accept: 'image/png,image/jpeg', multiple: true, hidden: true, 'aria-label': '选择图片文件', onChange: (事件: React.ChangeEvent<HTMLInputElement>) => { void 插入图片(Array.from(事件.target.files ?? [])); 事件.target.value = '' } }),
    React.createElement('input', { ref: 附件输入, type: 'file', hidden: true, 'aria-label': '选择附件文件', onChange: (事件: React.ChangeEvent<HTMLInputElement>) => { const 文件 = 事件.target.files?.[0]; if (文件) void 插入附件(文件); 事件.target.value = '' } }),
    React.createElement(RibbonTabs, { activeKey: 当前标签, onChange: set当前标签, tabs: 演示标签 }),
    React.createElement(RibbonPanel, {
      activeKey: 当前标签,
      tabs: 演示标签,
      onCommand: 执行命令,
      获取激活态: 取激活态,
      获取禁用态: (标识: string) => 读取演示命令状态(标识, { 只读: 只读 && !只读可放行(标识) }).状态 !== '可用',
      获取禁用原因: (标识: string) => 读取演示命令状态(标识, { 只读 }).原因,
      onDropdownOpen: 处理下拉框打开,
    }),
    React.createElement('div', { className: 'wps-ppt-object-toolbar' },
      React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked: 只读, disabled: Boolean(文稿.定稿), onChange: (事件: React.ChangeEvent<HTMLInputElement>) => { set只读(事件.target.checked); set编辑框标识(null) } }), 文稿.定稿 ? '只读查看（本文稿已定稿）' : '只读查看'),
      React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked: 显示标尺, onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set显示标尺(事件.target.checked) }), '标尺'),
      React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked: 吸附, onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set吸附(事件.target.checked) }), '吸附'),
      React.createElement('button', { type: 'button', onClick: () => set参考线({ 垂直: [480], 水平: [270] }) }, '中心参考线'),
      React.createElement('button', { type: 'button', onClick: () => set参考线({ 垂直: [], 水平: [] }) }, '清除参考线'),
      React.createElement('button', { type: 'button', onClick: () => { set适应(true); set缩放(适应比例.current) } }, '适应窗口'),
      React.createElement('label', null, '缩放', React.createElement('input', { type: 'number', min: 10, max: 400, step: 1, 'aria-label': '精确缩放百分比', key: Math.round(缩放 * 100), defaultValue: Math.round(缩放 * 100), onKeyDown: (事件: React.KeyboardEvent<HTMLInputElement>) => { if (事件.key === 'Enter') 事件.currentTarget.blur() }, onBlur: (事件: React.FocusEvent<HTMLInputElement>) => { const 值 = Number(事件.target.value); if (Number.isFinite(值) && 值 >= 10 && 值 <= 400) { set适应(false); set缩放(值 / 100) } else { 事件.target.value = String(Math.round(缩放 * 100)); 显示文件错误('缩放设置失败', '缩放比例应介于 10% 和 400% 之间') } } })),
      React.createElement('span', null, '双击标尺添加参考线')
    ),
    React.createElement(
      'div',
      { className: 'wps-ppt-body' },
      当前视图 === '浏览'
        ? React.createElement(SlideSorterView, {
            只读,
            图片地址,
            文稿,
            on选中: (索引: number) => set文稿(切换幻灯片(文稿, 索引)),
            on重排: (来源索引: number, 目标索引: number) => {
              const 结果 = 重排幻灯片(文稿, 来源索引, 目标索引)
              if (结果 !== 文稿) 更新文稿(结果)
            },
            on打开: () => set当前视图('普通'),
          })
        : React.createElement(React.Fragment, null,
      React.createElement(ThumbnailList, {
            图片地址,
        文稿,
        on选中: (索引: number) => {
          set文稿(切换幻灯片(文稿, 索引))
          set选中框标识(null)
          set选中对象([])
        },
        on新建: () => 执行命令('slide.new'),
      }),
      当前视图 === '备注' && 当前幻灯片 !== null
        ? React.createElement(NotesView, {
            只读,
            图片地址,
            文稿,
            幻灯片: 当前幻灯片,
            索引: 文稿.当前索引,
            on编辑: (内容: string) => 更新文稿(更新幻灯片(文稿, 当前幻灯片.id, { 备注: 内容 })),
          })
        : 当前幻灯片 === null
        ? React.createElement('div', { className: 'wps-ppt-empty' }, '暂无幻灯片')
        : React.createElement(SlideCanvas, {
            图片地址,
            key: 历史标识,
            幻灯片: 当前幻灯片,
            批注标记,
            选中框标识,
            缩放,
            编辑框标识,
            编辑值,
            显示网格线,
            只读, 选中对象, 显示标尺, 吸附, 参考线,
            // 页面尺寸、解析后的背景与页脚：预览不写入模型
            页面尺寸: 读取页面尺寸(文稿),
            背景: 预览主题候选 ? 解析页面背景({ ...文稿, 主题: 预览主题候选 }, 当前幻灯片) : 解析页面背景(文稿, 当前幻灯片),
            页脚: 读取有效页脚(文稿, 当前幻灯片, 文稿.当前索引),
            页序号: 文稿.当前索引,
            on参考线: set参考线,
            on选中对象: (标识: string[]) => { set选中对象(标识); if (标识.length) 最近选中框标识.current = null },
            on对象提交: 对象提交,
            on图片输入: (文件: File[]) => { void 插入图片(文件) },
            on适应缩放: (比例: number) => { 适应比例.current = Math.max(.1, Math.min(4, 比例)); if (适应) set缩放(适应比例.current) },
            on选中框: 处理选框,
            on双击框: (标识: string) => {
              const 框 = 当前幻灯片.文本框列表.find((项) => 项.id === 标识)
              set编辑框标识(标识)
              set编辑值(框?.text ?? '')
            },
            on编辑值变化: set编辑值,
            on提交编辑: 提交编辑,
            on拖动框: (标识: string, x: number, y: number) => {
              const 框 = 当前幻灯片.文本框列表.find((项) => 项.id === 标识)
              if (框 === undefined) {
                return
              }
              const 位置 = 约束位置(x, y, 框.width, 框.height, 读取页面尺寸(文稿))
              // 拖动占位符文本框即形成单页覆盖，之后不再跟随版式占位符
              const 更新页 = 框.占位符标识
                ? 标记占位符覆盖(更新文本框(当前幻灯片, 标识, 位置), 标识)
                : 更新文本框(当前幻灯片, 标识, 位置)
              // 拖动过程中不逐帧记录历史，避免撤销栈被拖动事件占满
              set文稿(
                更新幻灯片(文稿, 当前幻灯片.id, {
                  文本框列表: 更新页.文本框列表,
                })
              )
            },
            on文本选择: 处理文本选择,
            onContextMenu: (x: number, y: number) => {
              set菜单坐标({ x, y })
              set菜单可见(true)
            },
          })
        ),
      设计面板 === '主题' ? React.createElement(ThemePanel, {
        文稿,
        只读,
        on应用: (新文稿: 演示文稿) => { set预览主题候选(null); 更新文稿(新文稿) },
        检测字体: 默认字体检测,
        on导出文本: (文本: string, 文件名: string) => 下载文本(文本, 文件名, 'application/json'),
        on读取文件: async () => {
          const 路径 = await 桥接.showOpenDialog('ppt' as const)
          if (!路径) return null
          const 读取 = await 桥接.readFile(路径)
          if (!读取.成功 || !读取.内容) { 显示文件错误('导入主题失败', 读取.错误 ?? '主题文件读取失败'); return null }
          return 读取.内容
        },
      }) : 设计面板 === '母版' ? React.createElement(MasterPanel, {
        文稿,
        只读,
        on应用: 更新文稿,
      }) : 设计面板 === '检查' ? React.createElement(DesignCheckPanel, {
        文稿,
        只读,
        on应用: 更新文稿,
        检测字体: 默认字体检测,
      }) : 当前幻灯片 && 当前标签 === 'review'
        ? (审阅区域 === '批注'
            ? React.createElement(CommentsPanel, {
                文稿, 页: 当前幻灯片, 只读, 选中: 选中框标识 ?? 选中对象[0] ?? null, 显示批注,
                on显示变化: set显示批注, on修改: 更新文稿, 跳转: 定位批注,
                on切换区域: (区域) => set审阅区域(区域),
              })
            : React.createElement(ReviewPanel, {
                文稿, 页: 当前幻灯片, 只读, 区域: 审阅区域, 转换方向, 当前路径: 文档路径 ?? undefined,
                on区域变化: set审阅区域, on方向变化: set转换方向, on修改: 更新文稿,
              }))
        : 当前幻灯片 && 插入面板 === '公式' ? React.createElement(FormulaPanel, { 对象: 选中对象数据, 只读, on插入: 插入公式对象, on替换: 替换选中对象 })
        : 当前幻灯片 && 插入面板 === '符号' ? React.createElement(SymbolPanel, { 只读, on插入: 插入符号 })
        : 当前幻灯片 && 插入面板 === '附件' ? React.createElement(AttachmentPanel, { 对象: 选中对象数据, 只读, on选择文件: (文件: File) => { void 插入附件(文件) }, on导出: (对象: 演示对象) => { void 导出附件(对象) }, on替换: 替换选中对象 })
        : 当前幻灯片 && ['transition','animation','slideshow'].includes(当前标签) ? React.createElement(AnimationPanel, { 文稿, 页: 当前幻灯片, 选中: 选中框标识 ?? 选中对象[0], 只读, on修改: 更新文稿, 图片地址 }) : 当前幻灯片 && 当前视图 === '普通' ? React.createElement(ObjectPropertiesPanel, { 页: 当前幻灯片, 选中: 选中对象, 只读, on修改: (修改: 几何修改) => 对象提交(Object.fromEntries(选中对象.map(id => [id, 修改]))), on操作: 对象操作, on选中: set选中对象, on替换: 替换选中对象 }) : null
    ),
    React.createElement(PptStatusBar, { 文稿, 缩放, on缩放变化: (值: number) => { set适应(false); set缩放(值) } }),
    React.createElement(ExportPanel, { 文稿, 图片地址, 打开: 导出打开, on关闭: () => set导出打开(false) }),
    React.createElement(ContextMenu, {
      open: 菜单可见,
      x: 菜单坐标.x,
      y: 菜单坐标.y,
      items: 构建演示菜单(),
      onCommand: (命令标识: string, 参数?: string) => {
        if (命令标识 === '__close__') {
          关闭菜单()
          return
        }
        执行命令(命令标识, 参数)
        关闭菜单()
      },
    }),
    放映中
      ? React.createElement(SlideshowView, {
            图片地址,
          文稿,
          当前索引: 放映索引,
          on翻页: 放映翻页,
          on退出: 退出放映,
        })
      : null
  )
}

export default PptEditor
