import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { 载入PDF } from './pdfLoader'
import Icon from '../components/Icon'
import { 默认文件缩放, use滚轮缩放, 阅读缩放范围, 放大一档, 缩小一档, 缩放百分比文本 } from '../editor/wheelZoom'
import SelectionFloatPanel, { use选区浮窗, type 浮窗按钮 } from '../components/SelectionFloatPanel'
import ContextMenu, { type 菜单节点 } from '../components/ContextMenu'
import { 通用AI指令, 交给助手 } from '../assistant/quickActions'
import { writeClipboardText } from '../editor/clipboard'
import { useShortcuts } from '../shortcuts/useShortcuts'
import { useReadingFullscreen, useReadingPinch } from '../editor/readingInteractions'
import '../editor/reading.css'

interface Props {
  数据?: string
  文件名?: string
  onError?: (文本: string) => void
}

type 阅读状态 = '空白' | '加载中' | '就绪' | '失败'
interface 页面文字项 { 文本: string; x: number; y: number; 宽: number; 高: number }
interface PDF页面尺寸 { 宽: number; 高: number }
const 短文档完整渲染页数 = 8

/** 只在页面进入阅读区附近时创建画布；离开后释放画布内存。 */
function PdfPageCanvas({ 文档, 页码, 缩放, 可用宽度, on尺寸, onError }: {
  文档: PDFDocumentProxy
  页码: number
  缩放: number
  可用宽度: number | null
  on尺寸: (页码: number, 尺寸: PDF页面尺寸) => void
  onError: (页码: number, 错误: unknown) => void
}) {
  const 画布 = useRef<HTMLCanvasElement | null>(null)
  const [文字项, set文字项] = useState<页面文字项[]>([])
  const [错误, set错误] = useState(false)

  useEffect(() => {
    let 已取消 = false
    let 渲染任务: RenderTask | null = null
    set文字项([])
    set错误(false)
    void (async () => {
      try {
        const 页面 = await 文档.getPage(页码)
        if (已取消) return
        const 视口 = 页面.getViewport({ scale: 缩放 })
        const 原始宽度 = 视口.width / 缩放
        const 原始高度 = 视口.height / 缩放
        on尺寸(页码, { 宽: 原始宽度, 高: 原始高度 })
        const 默认适配宽度 = Math.min(原始宽度 * 默认文件缩放, 可用宽度 ?? Infinity)
        const 显示宽度 = 默认适配宽度 * 缩放 / 默认文件缩放
        const 显示高度 = 原始高度 * 显示宽度 / 原始宽度
        const 节点 = 画布.current
        const 画笔 = 节点?.getContext('2d')
        if (!节点 || !画笔) throw new Error('无法创建页面画布')
        const 像素比 = Math.min(window.devicePixelRatio || 1, 2)
        // 每页各自限制画布像素，长文档滚动时不会一次创建所有页的画布。
        const 画布像素上限 = 16_000_000
        const 期望像素 = 显示宽度 * 显示高度 * 像素比 * 像素比
        const 渲染比 = 期望像素 > 画布像素上限 ? Math.sqrt(画布像素上限 / 期望像素) : 1
        const 渲染视口 = 页面.getViewport({ scale: 显示宽度 / 原始宽度 * 渲染比 })
        节点.width = Math.max(1, Math.floor(渲染视口.width * 像素比))
        节点.height = Math.max(1, Math.floor(渲染视口.height * 像素比))
        节点.style.width = `${显示宽度}px`
        节点.style.height = `${显示高度}px`
        渲染任务 = 页面.render({
          canvas: 节点,
          canvasContext: 画笔,
          viewport: 渲染视口,
          transform: 像素比 === 1 ? undefined : [像素比, 0, 0, 像素比, 0, 0],
        })
        await 渲染任务.promise
        const 文本内容 = await 页面.getTextContent()
        if (已取消) return
        const 比例 = 显示宽度 / 视口.width
        const 行: 页面文字项[] = []
        for (const 原项 of 文本内容.items) {
          const 项 = 原项 as unknown as { str?: string; transform?: number[]; width?: number; height?: number }
          if (!项.str || !项.transform || 项.transform.length < 6) continue
          const [x, y] = 视口.convertToViewportPoint(项.transform[4], 项.transform[5])
          const 高 = Math.max(1, (项.height || Math.hypot(项.transform[2], 项.transform[3])) * 缩放 * 比例)
          行.push({ 文本: 项.str, x: x * 比例, y: y * 比例 - 高, 宽: Math.max(1, (项.width || 1) * 缩放 * 比例), 高 })
        }
        set文字项(行)
      } catch (原因) {
        if (已取消 || (原因 instanceof Error && 原因.name === 'RenderingCancelledException')) return
        set错误(true)
        onError(页码, 原因)
      }
    })()
    return () => { 已取消 = true; 渲染任务?.cancel() }
  }, [文档, 页码, 缩放, 可用宽度, on尺寸, onError])

  return <>
    <canvas ref={画布} className="pdf-viewer__canvas" aria-label={`第 ${页码} 页`} />
    <div className="pdf-viewer__text-layer" aria-label={`第 ${页码} 页可选择的 PDF 文字`}>
      {文字项.map((项, 索引) => <span key={索引} style={{ left: 项.x, top: 项.y, minWidth: 项.宽, height: 项.高, fontSize: 项.高 }}>{项.文本}</span>)}
    </div>
    {错误 && <span className="pdf-viewer__page-error" role="status">第 {页码} 页无法显示</span>}
  </>
}

const PdfViewer = ({ 数据, 文件名 = 'PDF 文件', onError }: Props) => {
  const [文档, set文档] = useState<PDFDocumentProxy | null>(null)
  const [状态, set状态] = useState<阅读状态>('空白')
  const [当前页, set当前页] = useState(1)
  const [跳转页码, set跳转页码] = useState('1')
  const [缩放, set缩放] = useState(默认文件缩放)
  const [可用宽度, set可用宽度] = useState<number | null>(null)
  const [页面尺寸, set页面尺寸] = useState<Record<number, PDF页面尺寸>>({})
  const 页面尺寸引用 = useRef<Record<number,PDF页面尺寸>>({})
  const [活跃页, set活跃页] = useState<Set<number>>(() => new Set([1]))
  const [复制状态, set复制状态] = useState('')
  const [分页模式,set分页模式] = useState(false),[全屏,set全屏] = useState(false)
  const 全屏根 = useRef<HTMLElement>(null)
  const 进入前 = useRef<{mode:boolean;zoom:number;page:number;left:number;top:number}|null>(null)
  const 待恢复 = useRef(false)
  const 待切换页 = useRef<number|null>(null)
  const 阅读区 = useRef<HTMLDivElement | null>(null)
  const 页节点 = useRef<Array<HTMLDivElement | null>>([])
  const 页码输入 = useRef<HTMLInputElement | null>(null)
  const 右键页码 = useRef(1)
  const 报错回调 = useRef(onError)
  报错回调.current = onError
  const 退出全屏 = () => {const before=进入前.current;待恢复.current=true;set全屏(false);if(before){set分页模式(before.mode);set缩放(before.zoom)}}
  const 切换分页 = () => {待切换页.current=当前页;set分页模式(value=>!value)}
  const 系统全屏 = useReadingFullscreen(全屏根,全屏,退出全屏,()=>全屏根.current?.querySelector<HTMLElement>('[aria-label="全屏左右翻页阅读"]'))
  const 进入全屏 = () => {进入前.current={mode:分页模式,zoom:缩放,page:当前页,left:阅读区.current?.scrollLeft??0,top:阅读区.current?.scrollTop??0};set分页模式(true);set全屏(true)}
  useReadingPinch(阅读区,{enabled:状态==='就绪',scale:缩放,onScale:set缩放,min:阅读缩放范围.下限,max:阅读缩放范围.上限,identity:`${分页模式}:${全屏}`,resolveViewport:target=>target instanceof Element?target.closest<HTMLElement>('.pdf-viewer__slide'):null})

  // Ctrl+滚轮缩放阅读视口，与工具条上的缩放按钮共用同一状态
  use滚轮缩放(缩放, set缩放, 阅读缩放范围)

  /** 选中 PDF 文字后的浮窗：复制、翻译、解释、总结与 AI 问答 */
  const 取选中文字 = (): string => {
    const 选择 = window.getSelection()
    const 区域 = 阅读区.current
    if (!选择 || !区域 || 选择.rangeCount === 0) return ''
    if (选择.anchorNode && !区域.contains(选择.anchorNode)) return ''
    return 选择.toString()
  }
  const 浮窗按钮 = (): 浮窗按钮[] => {
    const 选中 = 取选中文字()
    if (选中.trim() === '') return []
    return [
      { id: 'pdf.copySelection', 标签: '复制', 图标: 'copy', 分组: 0, 执行: () => void writeClipboardText(选中).then(() => set复制状态('已复制选中文字')).catch(() => set复制状态('复制失败，请检查剪贴板权限')) },
      ...通用AI指令.filter((指令) => ['ai.translate', 'ai.explain', 'ai.summarize', 'ai.ask'].includes(指令.id)).map((指令) => ({
        id: 指令.id, 标签: 指令.标签, 分组: 10, 执行: () => 交给助手(指令, 选中),
      })),
    ]
  }
  const 选区浮窗 = use选区浮窗({ 容器: 阅读区, 取按钮: 浮窗按钮 })

  /** 右键菜单：与浮窗动作一致，另外提供整页与全文复制 */
  const [菜单可见, set菜单可见] = useState(false)
  const [菜单坐标, set菜单坐标] = useState({ x: 0, y: 0 })
  /** 打开菜单时的选中文字快照：右键会改变焦点，命令要用当时的内容 */
  const 菜单选区 = useRef('')
  const 菜单项 = (): 菜单节点[] => {
    const 选中 = (菜单选区.current || 取选中文字()).trim()
    const 项: 菜单节点[] = []
    if (选中 !== '') 项.push({ type: 'item', commandId: '__pdfCopySelection__', label: '复制选中文字', shortcut: 'Ctrl+C' })
    项.push({ type: 'item', commandId: '__pdfCopyPage__', label: '复制本页文字' })
    项.push({ type: 'item', commandId: '__pdfCopyAll__', label: '复制全文文字' })
    if (选中 !== '') {
      项.push({ type: 'divider' })
      项.push({
        type: 'group', 标题: 'AI 快捷动作', 子项: 通用AI指令
          .filter((指令) => ['ai.translate', 'ai.explain', 'ai.summarize', 'ai.ask'].includes(指令.id))
          .map((指令) => ({ type: 'item' as const, commandId: `__ai__:${指令.id}`, label: `AI ${指令.标签}` })),
      })
    }
    return 项
  }
  const 处理菜单命令 = (命令标识: string): boolean => {
    const 选中 = 菜单选区.current || 取选中文字()
    if (命令标识 === '__pdfCopySelection__') { void writeClipboardText(选中).then(() => set复制状态('已复制选中文字')).catch(() => set复制状态('复制失败，请检查剪贴板权限')); return true }
    if (命令标识 === '__pdfCopyPage__') { void 复制本页(右键页码.current); return true }
    if (命令标识 === '__pdfCopyAll__') { void 复制全文(); return true }
    if (!命令标识.startsWith('__ai__:')) return false
    const 指令 = 通用AI指令.find((项) => 项.id === 命令标识.slice('__ai__:'.length))
    if (指令) 交给助手(指令, 选中)
    return true
  }

  useEffect(() => {
    const 节点 = 阅读区.current
    if (!节点) return
    const 更新宽度 = () => {
      const 样式 = window.getComputedStyle(节点)
      const 左边距 = Number.parseFloat(样式.paddingLeft) || 0
      const 右边距 = Number.parseFloat(样式.paddingRight) || 0
      const 宽度 = Math.max(0, 节点.clientWidth - 左边距 - 右边距)
      if (宽度 > 0) set可用宽度((当前) => 当前 === 宽度 ? 当前 : 宽度)
    }
    更新宽度()
    window.addEventListener('resize', 更新宽度)
    const 观察器 = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(更新宽度)
    观察器?.observe(节点)
    return () => {
      window.removeEventListener('resize', 更新宽度)
      观察器?.disconnect()
    }
  }, [分页模式,全屏])

  useEffect(() => {
    let 已取消 = false
    let 关闭文档: (() => void) | null = null
    set文档(null)
    set当前页(1)
    set跳转页码('1')
    set缩放(默认文件缩放)
    set页面尺寸({})
    页面尺寸引用.current={}
    set分页模式(false);set全屏(false);进入前.current=null;待恢复.current=false;待切换页.current=null
    set活跃页(new Set([1]))
    页节点.current = []
    if (!数据) {
      set状态('空白')
      return
    }
    set状态('加载中')
    void 载入PDF(数据).then((结果) => {
      if (已取消) {
        结果.关闭()
        return
      }
      关闭文档 = 结果.关闭
      set文档(结果.文档)
      // 普通文档直接创建全部页面画布，确保打开后立即可以像 WPS 一样连续向下滚动。
      // 只有长文档才按视口附近页面虚拟化，避免大量画布同时占用内存。
      const 首批渲染页数 = 结果.文档.numPages <= 短文档完整渲染页数 ? 结果.文档.numPages : 3
      set活跃页(new Set(Array.from(
        { length: 首批渲染页数 },
        (_, 索引) => 索引 + 1,
      )))
      set状态('就绪')
    }).catch((错误: unknown) => {
      if (已取消) return
      set状态('失败')
      报错回调.current?.(`无法打开「${文件名}」：${错误 instanceof Error ? 错误.message : '文件格式无法识别'}`)
    })
    return () => {
      已取消 = true
      关闭文档?.()
    }
  }, [数据, 文件名])

  const 总页数 = 文档?.numPages ?? 0
  const 页面可用宽度 = 可用宽度===null?null:Math.max(1,可用宽度-(分页模式?24:0))
  const 记录页面尺寸 = useCallback((页码: number, 尺寸: PDF页面尺寸) => {
    页面尺寸引用.current={...页面尺寸引用.current,[页码]:尺寸}
    set页面尺寸((旧值) => 旧值[页码]?.宽 === 尺寸.宽 && 旧值[页码]?.高 === 尺寸.高 ? 旧值 : { ...旧值, [页码]: 尺寸 })
  }, [])
  const 报告页面错误 = useCallback((页码: number, 错误: unknown) => {
    报错回调.current?.(`无法显示「${文件名}」第 ${页码} 页：${错误 instanceof Error ? 错误.message : '页面渲染失败'}`)
  }, [文件名])

  /** 二分查找视口附近的页，只保留附近页画布，同时让页码随滚动更新。 */
  const 更新可视页 = () => {
    const 舞台 = 阅读区.current
    if (!舞台 || !文档 || 舞台.clientHeight <= 0) return
    if(待恢复.current||待切换页.current!==null)return
    if(分页模式){if(可用宽度!==null&&Math.abs(舞台.clientWidth-可用宽度)>1)return;const page=Math.max(1,Math.min(总页数,Math.round(舞台.scrollLeft/Math.max(1,可用宽度??舞台.clientWidth))+1));set当前页(page);set活跃页(new Set([page-1,page,page+1].filter(value=>value>0&&value<=总页数)));return}
    const 节点 = 页节点.current
    const 区域 = 舞台.getBoundingClientRect()
    const 中线 = 区域.top + 舞台.clientHeight / 2
    let 左 = 0; let 右 = 总页数
    while (左 < 右) {
      const 中 = (左 + 右) >>> 1
      if ((节点[中]?.getBoundingClientRect().bottom ?? Infinity) < 中线) 左 = 中 + 1
      else 右 = 中
    }
    set当前页(Math.min(总页数, 左 + 1))
    if (总页数 <= 短文档完整渲染页数) {
      const 全部页面 = new Set(Array.from({ length: 总页数 }, (_, 索引) => 索引 + 1))
      set活跃页((旧值) => 旧值.size === 全部页面.size ? 旧值 : 全部页面)
      return
    }
    const 预载距离 = Math.max(600, 舞台.clientHeight)
    左 = 0; 右 = 总页数
    while (左 < 右) {
      const 中 = (左 + 右) >>> 1
      if ((节点[中]?.getBoundingClientRect().bottom ?? Infinity) < 区域.top - 预载距离) 左 = 中 + 1
      else 右 = 中
    }
    const 附近 = new Set<number>()
    for (let 索引 = 左; 索引 < 总页数; 索引 += 1) {
      const 矩形 = 节点[索引]?.getBoundingClientRect()
      if (!矩形 || 矩形.top > 区域.bottom + 预载距离) break
      附近.add(索引 + 1)
    }
    set活跃页((旧值) => 旧值.size === 附近.size && [...附近].every((页) => 旧值.has(页)) ? 旧值 : 附近)
  }

  useEffect(() => { 更新可视页() }, [文档, 缩放, 可用宽度, 页面尺寸,分页模式,全屏])
  useLayoutEffect(()=>{
    const stage=阅读区.current
    if(!stage)return
    // A portal/mode switch changes the available width before the passive
    // ResizeObserver effect runs. Lay out the pages at that real width first;
    // otherwise restoring page 2 using the old width can land on page 3.
    if(待恢复.current||待切换页.current!==null){const style=getComputedStyle(stage),width=stage.clientWidth-(Number.parseFloat(style.paddingLeft)||0)-(Number.parseFloat(style.paddingRight)||0);if(width>0&&width!==可用宽度){set可用宽度(width);return}}
    if(待恢复.current&&!全屏){
      待恢复.current=false
      const before=进入前.current
      if(before&&before.page===当前页){stage.scrollLeft=before.left;stage.scrollTop=before.top}
      else if(分页模式)stage.scrollLeft=(当前页-1)*(可用宽度??stage.clientWidth)
      else {const node=页节点.current[当前页-1];if(node)stage.scrollTop+=node.getBoundingClientRect().top-stage.getBoundingClientRect().top}
    }else if(待切换页.current!==null){const target=待切换页.current;待切换页.current=null;if(分页模式)stage.scrollLeft=(target-1)*(可用宽度??stage.clientWidth);else{const node=页节点.current[target-1];if(node)stage.scrollTop+=node.getBoundingClientRect().top-stage.getBoundingClientRect().top}}
    else if(分页模式)stage.scrollLeft=(当前页-1)*(可用宽度??stage.clientWidth)
  },[分页模式,全屏,可用宽度])
  useEffect(() => {
    if (document.activeElement !== 页码输入.current) set跳转页码(String(当前页))
  }, [当前页])

  const 跳转到页 = (页码: number) => {
    if (状态 !== '就绪' || !Number.isInteger(页码) || 页码 < 1 || 页码 > 总页数) return
    set当前页(页码)
    set跳转页码(String(页码))
    set活跃页((旧值) => new Set(旧值).add(页码))
    const 舞台 = 阅读区.current
    const 页面 = 页节点.current[页码 - 1]
    if(分页模式&&舞台){舞台.scrollLeft=(页码-1)*(可用宽度??舞台.clientWidth);return}
    if (舞台 && 页面) {
      const 顶部差 = 页面.getBoundingClientRect().top - 舞台.getBoundingClientRect().top
      舞台.scrollTop += 顶部差
      更新可视页()
    }
  }
  const 翻页 = (差值: number) => 跳转到页(Math.min(总页数, Math.max(1, 当前页 + 差值)))
  const 调整缩放 = (方向: '放大' | '缩小') => set缩放((当前) => {
    const 下一个 = 方向 === '放大' ? 放大一档(当前) : 缩小一档(当前)
    return 下一个 ?? 当前
  })
  const 适应阅读区 = (模式: '实际' | '页宽' | '整页'): boolean => {
    const 区域 = 阅读区.current
    const 尺寸 = 页面尺寸引用.current[当前页] ?? 页面尺寸引用.current[1]
    if (!区域 || !尺寸 || !页面可用宽度) return false
    const 默认宽度 = Math.min(尺寸.宽 * 默认文件缩放, 页面可用宽度)
    const 样式 = window.getComputedStyle(区域)
    const 可用高度 = 区域.clientHeight - (Number.parseFloat(样式.paddingTop) || 0) - (Number.parseFloat(样式.paddingBottom) || 0) - (分页模式?24:0)
    const 比例 = 模式 === '实际' ? 1 : 模式 === '页宽' ? 页面可用宽度 / 尺寸.宽 : Math.min(页面可用宽度 / 尺寸.宽, 可用高度 / 尺寸.高)
    if (!Number.isFinite(比例) || 比例 <= 0 || 默认宽度 <= 0) return false
    set缩放(Math.min(阅读缩放范围.上限, Math.max(阅读缩放范围.下限, 尺寸.宽 * 比例 / 默认宽度 * 默认文件缩放)))
    return true
  }
  useShortcuts('pdf', (标识) => {
    switch (标识) {
      case 'view.previousPage': 翻页(-1); break
      case 'view.nextPage': 翻页(1); break
      case 'view.firstPage': 跳转到页(1); break
      case 'view.lastPage': 跳转到页(总页数); break
      case 'view.zoomIn': 调整缩放('放大'); break
      case 'view.zoomOut': 调整缩放('缩小'); break
      case 'view.zoomReset': set缩放(默认文件缩放); break
      case 'view.actualSize': return 适应阅读区('实际')
      case 'view.fitWidth': return 适应阅读区('页宽')
      case 'view.fitPage': return 适应阅读区('整页')
      case 'view.gotoPage': 页码输入.current?.focus(); 页码输入.current?.select(); break
      case 'edit.copyPage': void 复制本页(); break
      case 'edit.copyAll': void 复制全文(); break
      default: return false // 打印由容器处理，避免同一按键重复执行。
    }
  }, 状态 === '就绪')
  const 复制本页 = async (页码 = 当前页) => {
    if (!文档) return
    try {
      const 内容 = await (await 文档.getPage(页码)).getTextContent()
      const 文字 = 内容.items.map((项) => 'str' in 项 ? 项.str : '').join(' ').trim()
      if (!文字) { set复制状态('这页 PDF 没有可复制的文字'); return }
      await writeClipboardText(文字)
      set复制状态('已复制本页文字')
    } catch { set复制状态('复制失败，请检查剪贴板权限') }
  }
  const 复制全文 = async () => {    if (!文档) return
    try {
      const 页面: string[] = []
      for (let 页码 = 1; 页码 <= 文档.numPages; 页码 += 1) {
        const 内容 = await (await 文档.getPage(页码)).getTextContent()
        页面.push(内容.items.map((项) => 'str' in 项 ? 项.str : '').join(' '))
      }
      const 文字 = 页面.join('\n').trim()
      if (!文字) { set复制状态('这份 PDF 没有可复制的文字'); return }
      await writeClipboardText(文字)
      set复制状态(`已复制全文，共 ${文档.numPages} 页`)
    } catch { set复制状态('复制失败，请检查剪贴板权限') }
  }

  const 内容 = (
    <section ref={全屏根} className={`pdf-viewer${全屏?' seal-fullscreen-reader pdf-viewer--fullscreen':''}`} aria-label="PDF 阅读预览" role={全屏?'dialog':undefined} aria-modal={全屏?true:undefined} tabIndex={全屏?-1:undefined} data-fullscreen={全屏?系统全屏?'native':'viewport':undefined}>
      <div className="pdf-viewer__toolbar">
        <span className="pdf-viewer__name" title={文件名}>{数据 ? 文件名 : '文档预览'}</span>
        <div className="pdf-viewer__controls">
          <button type="button" aria-label={分页模式?'切换连续阅读':'切换左右翻页'} title={分页模式?'当前为左右翻页，切换连续阅读':'当前为连续阅读，切换左右翻页'} disabled={状态!=='就绪'} aria-pressed={分页模式} onClick={切换分页}><Icon name="page-view" size={15}/></button>
          <button type="button" aria-label={全屏?'退出全屏阅读':'全屏左右翻页阅读'} title={全屏?'退出全屏阅读':'全屏阅读 · 左右翻页 · 双指缩放'} disabled={状态!=='就绪'} onClick={全屏?退出全屏:进入全屏}><Icon name="read-view" size={15}/></button>
          <button type="button" aria-label="上一页" title="上一页" disabled={状态 !== '就绪' || 当前页 <= 1} onClick={() => 翻页(-1)}><Icon name="arrow-left" size={15} /></button>
          <span className="pdf-viewer__counter" aria-live="polite">{总页数 > 0 ? `第 ${当前页} 页 / 共 ${总页数} 页` : '未打开文件'}</span>
          <button type="button" aria-label="下一页" title="下一页" disabled={状态 !== '就绪' || 当前页 >= 总页数} onClick={() => 翻页(1)}><Icon name="arrow-left" size={15} className="pdf-viewer__forward" /></button>
          <form className="pdf-viewer__jump" onSubmit={(事件) => {
            事件.preventDefault()
            const 页码 = Number(跳转页码)
            if (Number.isInteger(页码) && 页码 >= 1 && 页码 <= 总页数) 跳转到页(页码)
            else { set复制状态(`请输入 1 至 ${总页数} 的页码`); 页码输入.current?.focus() }
          }}>
            <input ref={页码输入} type="number" inputMode="numeric" min={1} max={总页数 || 1} value={跳转页码} disabled={状态 !== '就绪'} aria-label="跳转页码" onChange={(事件) => set跳转页码(事件.target.value)} />
            <button type="submit" aria-label="跳转到指定页" title="跳转到指定页" disabled={状态 !== '就绪'}>跳转</button>
          </form>
          <span className="pdf-viewer__divider" aria-hidden="true" />
          <button type="button" aria-label="缩小" title="缩小" disabled={状态 !== '就绪' || 缩小一档(缩放) === null} onClick={() => 调整缩放('缩小')}><Icon name="zoom-out" size={15} /></button>
          <span className="pdf-viewer__zoom" aria-live="polite">{缩放百分比文本(缩放)}</span>
          <button type="button" aria-label="放大" title="放大" disabled={状态 !== '就绪' || 放大一档(缩放) === null} onClick={() => 调整缩放('放大')}><Icon name="zoom-in" size={15} /></button>
          <button type="button" aria-label="复制本页文字" title="复制本页文字" disabled={状态 !== '就绪'} onClick={() => void 复制本页()}><Icon name="copy-text" size={15} /></button>
          <button type="button" aria-label="复制全文文字" title="复制全文文字" disabled={状态 !== '就绪'} onClick={() => void 复制全文()}><Icon name="copy-all" size={15} /></button>
        </div>
      </div>
      {复制状态 && <span className="pdf-viewer__copy-status" role="status">{复制状态}</span>}
      <div
        ref={阅读区}
        className={`pdf-viewer__stage${分页模式?' pdf-viewer__stage--paged':''}`}
        data-view-mode={分页模式?'pages':'continuous'}
        tabIndex={0}
        aria-label={分页模式?'PDF 左右翻页阅读区':'PDF 连续滚动阅读区'}
        onScroll={更新可视页}
        onContextMenu={(事件) => {
          事件.preventDefault()
          const 页 = (事件.target as HTMLElement).closest<HTMLElement>('[data-pdf-page]')?.dataset.pdfPage
          右键页码.current = 页 ? Number(页) : 当前页
          菜单选区.current = 取选中文字()
          set菜单坐标({ x: 事件.clientX, y: 事件.clientY })
          set菜单可见(true)
        }}
      >
        {状态 === '空白' && <div className="pdf-viewer__empty">选择本机 PDF 文件后，在这里阅读页面</div>}
        {状态 === '加载中' && <div className="pdf-viewer__empty" role="status">正在打开 PDF 文件…</div>}
        {状态 === '失败' && <div className="pdf-viewer__empty" role="status">无法预览这份 PDF 文件</div>}
        {状态 === '就绪' && 文档 && <div className={`pdf-viewer__pages${分页模式?' pdf-viewer__pages--paged':''}`} aria-label={`PDF 全部 ${总页数} 页`}>
          {Array.from({ length: 总页数 }, (_, 索引) => {
            const 页码 = 索引 + 1
            const 原始尺寸 = 页面尺寸[页码] ?? 页面尺寸[1] ?? { 宽: 600, 高: 800 }
            const 默认适配宽度 = Math.min(原始尺寸.宽 * 默认文件缩放, 页面可用宽度 ?? Infinity)
            const 宽 = 默认适配宽度 * 缩放 / 默认文件缩放
            const 高 = 原始尺寸.高 * 宽 / 原始尺寸.宽
            const 页面 = <div
              key={页码}
              ref={(节点) => { 页节点.current[索引] = 节点 }}
              className="pdf-viewer__page"
              data-pdf-page={页码}
              aria-label={`第 ${页码} 页`}
              style={{ width: 宽, height: 高 }}
            >
              {活跃页.has(页码) && <PdfPageCanvas 文档={文档} 页码={页码} 缩放={缩放} 可用宽度={页面可用宽度} on尺寸={记录页面尺寸} onError={报告页面错误} />}
            </div>
            return 分页模式?<div key={页码} className="pdf-viewer__slide" data-pdf-slide={页码} style={{width:可用宽度??'100vw',height:阅读区.current?.clientHeight||'100%'}}>{页面}</div>:页面
          })}
        </div>}
      </div>
      {全屏&&<div className="seal-fullscreen-reader__footer"><small>{分页模式?'左右滑动翻页':'连续阅读'} · 双指缩放</small></div>}
      <SelectionFloatPanel
        打开={!菜单可见 && 选区浮窗.打开}
        位置={选区浮窗.位置}
        按钮={选区浮窗.按钮}
        on关闭={选区浮窗.关闭}
        名称="选中文字操作"
      />
      <ContextMenu
        open={菜单可见}
        x={菜单坐标.x}
        y={菜单坐标.y}
        items={菜单项()}
        onCommand={(命令标识) => {
          set菜单可见(false)
          if (命令标识 === '__close__') return
          处理菜单命令(命令标识)
        }}
      />
    </section>
  )
  return 全屏?createPortal(内容,document.body):内容
}

export default PdfViewer
