// 扫描与识别（拍照扫描与 OCR 工具箱）。
// 阶段一：拍照 / 导入 → 自动裁边（可手动调四角）→ 彩色 / 灰度 / 黑白增强 → 多页合成图片型 PDF。
// 阶段二：授权后识别文字 → 复制文字、导出可搜索 PDF、导出 Word。
// 阶段三：扫描件库（分组、排序、批量管理、已导出文件）与模板化识别（证件 / 试卷 / 票据）。
// 平台差异见 platform.ts：拍照只在 Android / HarmonyOS；网页版不提供扫描件库。
import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntdApp, Button, Input, Modal, Progress, Segmented, Select, Spin, Tag } from 'antd'
import Icon from '../components/Icon'
import { 桥接 } from '../ipc/bridge'
import { useAppStore } from '../store'
import { htmlToDocxModel } from '../editor/commands'
import { writeClipboardText } from '../editor/clipboard'
import { 导出为Xlsx } from '../sheet/sheetExport'
import CornerEditor from './CornerEditor'
import ReviewPanel from './ReviewPanel'
import ScanLibraryView from './ScanLibraryView'
import { 取扫描能力 } from './platform'
import { 处理扫描页, 压缩原图, 生成原图预览, 拆分书籍照片, type 页面设置 } from './scanPipeline'
import { 打开扫描件库, 默认分组, type 扫描件库, type 扫描来源, type 扫描页 } from './scanLibrary'
import { 识别图片文字, 是取消授权 } from './recognition'
import { 生成图片PDF, 生成可搜索PDF, 生成文字Html, 生成识别工作表 } from './scanExport'
import { 保存导出文件, 安全文件名, 自Base64 } from './scanSave'
import { 扫描模板列表, 取识别模板 } from './templates'
import { 解析识别文本 } from './receiptParse'
import { 生成异常清单, type 单据解析结果 } from './validation'
import { 修改键, 应用修改, type 修改表 } from './reviewModel'
import { useScanImport, ScanImportButtons } from './useScanImport'
import type { 增强模式, 四角 } from './imageProcessing'
import MobileScanCamera from './MobileScanCamera'
import HandwritingEditor from './HandwritingEditor'
import { 翻译扫描文字, 生成照片工作表, 生成证件PDF } from './modeExport'
import type { 扫描模式, 书籍版式, 证件类型 } from './scanModes'
import './scan.css'

interface 工作页 {
  标识: string
  原图: Blob
  跨页原片?: Blob
  设置: 页面设置
  图片?: Uint8Array
  宽: number
  高: number
  预览?: string
  文字: string
  译文?: string
  处理中: boolean
  错误?: string
}

const 新标识 = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const 错误文字 = (错误: unknown, 默认: string) => 错误 instanceof Error && 错误.message ? 错误.message : 默认
const 当前日期 = () => { const 日期 = new Date(); return `${日期.getFullYear()}${String(日期.getMonth() + 1).padStart(2, '0')}${String(日期.getDate()).padStart(2, '0')}` }
const 模板分组 = (分类: string) => 分类 === '证件' ? '我的证件' : 分类 === '试卷' ? '我的试卷' : 分类 === '单据' ? '我的票据' : ''

export default function ScanPage({ 初始模式 = '文件扫描', 返回 }: { 初始模式?: 扫描模式; 返回?: () => void }) {
  const { modal, message } = AntdApp.useApp()
  const { createDoc } = useAppStore()
  const 能力 = useMemo(() => 取扫描能力(), [])
  const [视图, 设视图] = useState<'工作台' | '全部扫描件' | '已导出文件'>('工作台')
  const [页列表, 设页列表] = useState<工作页[]>([])
  const [手机模式, 设手机模式] = useState<扫描模式>(初始模式)
  const [取景中, 设取景中] = useState(true)
  const [证件, 设证件] = useState<证件类型>('身份证')
  const [书籍, 设书籍] = useState<书籍版式>('单页')
  const [目标语言, 设目标语言] = useState('中文')
  const [擦除页, 设擦除页] = useState<工作页 | null>(null)
  const [导入中, 设导入中] = useState(false)
  const [模式, 设模式] = useState<增强模式>('彩色')
  const [模板标识, 设模板标识] = useState('')
  const [来源, 设来源] = useState<扫描来源>('文件')
  const [当前扫描件, 设当前扫描件] = useState<{ 标识: string; 名称: string; 分组: string } | null>(null)
  const [识别进度, 设识别进度] = useState<{ 完成: number; 总数: number } | null>(null)
  const [导出中, 设导出中] = useState(false)
  const [解析结果, 设解析结果] = useState<单据解析结果[]>([])
  const [修改, 设修改] = useState<修改表>({})
  const [已核对, 设已核对] = useState<Set<string>>(new Set())
  const [失败, 设失败] = useState<Array<{ 来源: string; 原因: string }>>([])
  const [四角页, 设四角页] = useState<{ 页: 工作页; 预览: Awaited<ReturnType<typeof 生成原图预览>> } | null>(null)
  const [原图查看, 设原图查看] = useState<string | null>(null)
  const [保存对话框, 设保存对话框] = useState<{ 名称: string; 分组: string } | null>(null)
  const [分组列表, 设分组列表] = useState<string[]>(默认分组)
  const [库, 设库] = useState<扫描件库 | null>(null)
  const [库版本, 设库版本] = useState(0)
  const 页引用 = useRef(页列表)
  const 原片地址 = useRef('')
  type 手机草稿 = { 页: 工作页[]; 来源: 扫描来源; 扫描件: typeof 当前扫描件; 工具: 扫描模式; 证件: 证件类型; 译文语言: string }
  const 草稿 = useRef(new Map<string, 手机草稿>())
  const 图像任务 = useRef(new Map<string, number>())
  const 正在操作 = useRef(false)
  页引用.current = 页列表

  useEffect(() => {
    if (!能力.扫描件库) return
    let 有效 = true
    打开扫描件库().then(async 实例 => { if (!有效) return; 设库(实例); 设分组列表(await 实例.列出分组()) })
      .catch(错误 => { modal.error({ title: '扫描件库无法打开', content: 错误文字(错误, '本机存储不可用，仍可处理并导出扫描件，但无法保存到扫描件库'), okText: '知道了' }) })
    return () => { 有效 = false }
  }, [能力.扫描件库, modal])
  // 离开页面时释放预览地址，避免长期占用内存。
  useEffect(() => () => {
    图像任务.current.clear()
    if (原片地址.current) URL.revokeObjectURL(原片地址.current)
    for (const 页 of [...页引用.current, ...Array.from(草稿.current.values()).flatMap(项 => 项.页)]) if (页.预览) URL.revokeObjectURL(页.预览)
  }, [])

  const 模板 = 模板标识 ? 取识别模板(模板标识) : null
  const 更新页 = (标识: string, 更新: Partial<工作页>) => 设页列表(列表 => 列表.map(页 => {
    if (页.标识 !== 标识) return 页
    if (更新.预览 && 页.预览 && 更新.预览 !== 页.预览) URL.revokeObjectURL(页.预览)
    return { ...页, ...更新 }
  }))
  const 清除识别 = () => { 设解析结果([]); 设修改({}); 设已核对(new Set()); 设失败([]) }
  const 切换草稿 = (新模式: 扫描模式, 新证件 = 证件) => {
    if (忙碌 || (新模式 === 手机模式 && 新证件 === 证件)) return
    const 键 = (工具: 扫描模式, 类型: 证件类型) => 工具 === '证件扫描' ? `证件-${类型}` : 工具
    草稿.current.set(键(手机模式, 证件), { 页: 页引用.current, 来源, 扫描件: 当前扫描件, 工具: 手机模式, 证件, 译文语言: 目标语言 })
    const 新键 = 键(新模式, 新证件), 原稿 = 草稿.current.get(新键)
    草稿.current.delete(新键)
    设页列表(原稿?.页 ?? []); 设来源(原稿?.来源 ?? '文件'); 设当前扫描件(原稿?.扫描件 ?? null)
    设手机模式(新模式); 设证件(新证件); 设目标语言(原稿?.译文语言 ?? '中文'); 清除识别()
  }

  const 处理 = async (页: Pick<工作页, '标识' | '原图'>, 设置: 页面设置) => {
    const 次数 = (图像任务.current.get(页.标识) ?? 0) + 1
    图像任务.current.set(页.标识, 次数)
    更新页(页.标识, { 处理中: true, 错误: undefined, 文字: '', 译文: undefined, 设置 })
    try {
      const 结果 = await 处理扫描页(页.原图, 设置)
      if (图像任务.current.get(页.标识) !== 次数) return
      更新页(页.标识, { 处理中: false, 图片: 结果.图片, 宽: 结果.宽, 高: 结果.高, 预览: URL.createObjectURL(new Blob([结果.图片 as BlobPart], { type: 结果.类型 })), 设置: { ...设置, 四角: 设置.四角 ?? (结果.已检测 ? 结果.四角 : null) } })
    } catch (错误) {
      const 文案 = 错误文字(错误, '图片处理失败，请重新导入')
      if (图像任务.current.get(页.标识) === 次数) 更新页(页.标识, { 图片: undefined, 处理中: false, 错误: 文案 })
      return 文案
    }
  }

  const 添加图片 = async (文件: File[], 图片来源: 扫描来源) => {
    if (!文件.length) return
    设导入中(true)
    try {
      const 选图: Array<{ 原图: File; 跨页原片?: File }> = []
      for (const 原图 of 文件) {
        if (能力.拍照 && 手机模式 === '拍书籍' && 书籍 === '双页') {
          const [左, 右] = await 拆分书籍照片(原图)
          选图.push({ 原图: 左, 跨页原片: 原图 }, { 原图: 右, 跨页原片: 原图 })
        } else 选图.push({ 原图 })
      }
      if (!页列表.length) 设来源(图片来源)
      const 新页 = 选图.map(输入 => ({ 标识: 新标识(), ...输入, 设置: { 四角: null, 模式, 旋转: 0, 整张照片: 能力.拍照 && 手机模式 === '照片转PDF', 清除彩笔: 能力.拍照 && 手机模式 === '去除手写' }, 宽: 0, 高: 0, 文字: '', 处理中: true }))
      设页列表(列表 => [...列表, ...新页])
      清除识别()
      const 失败页: string[] = []
      for (const 页 of 新页) { const 错误 = await 处理(页, 页.设置); if (错误) 失败页.push(`${页.原图.name}：${错误}`) }
      if (失败页.length) throw new Error(失败页.join('\n'))
    } finally { 设导入中(false) }
  }
  const { 拍摄, 导入 } = useScanImport(能力, 添加图片)

  const 移动页 = (序号: number, 偏移: number) => 设页列表(列表 => { const 结果 = [...列表], 目标 = 序号 + 偏移; if (目标 < 0 || 目标 >= 结果.length) return 列表; [结果[序号], 结果[目标]] = [结果[目标], 结果[序号]]; return 结果 })
  const 删除页 = (页: 工作页) => { 图像任务.current.delete(页.标识); if (页.预览) URL.revokeObjectURL(页.预览); 设页列表(列表 => 列表.filter(项 => 项.标识 !== 页.标识)); 清除识别() }
  const 清空 = () => { for (const 页 of 页列表) if (页.预览) URL.revokeObjectURL(页.预览); 设页列表([]); 设当前扫描件(null); 清除识别() }
  const 切换模式 = (新模式: 增强模式) => { 设模式(新模式); for (const 页 of 页列表) void 处理(页, { ...页.设置, 模式: 新模式 }) }
  const 旋转页 = (页: 工作页) => void 处理(页, { ...页.设置, 旋转: (页.设置.旋转 + 1) % 4, 四角: null })
  const 打开四角 = async (页: 工作页) => {
    try { 设四角页({ 页, 预览: await 生成原图预览(页.原图, 页.设置.旋转) }) }
    catch (错误) { modal.error({ title: '无法调整四角', content: 错误文字(错误, '原图读取失败'), okText: '知道了' }) }
  }
  const 关闭四角 = () => { if (四角页) URL.revokeObjectURL(四角页.预览.地址); 设四角页(null) }
  const 应用四角 = (角: 四角) => { if (!四角页) return; const 页 = 四角页.页; 关闭四角(); void 处理(页, { ...页.设置, 四角: 角 }) }

  const 可用页 = 页列表.filter(页 => 页.图片 && !页.处理中)
  const 忙碌 = 导入中 || 页列表.some(页 => 页.处理中) || Boolean(识别进度) || 导出中
  const 扫描页列表 = (): 扫描页[] => 可用页.map(页 => ({ 图片: 页.图片!, 类型: 'image/jpeg', 宽: 页.宽, 高: 页.高, 文字: 页.文字 }))
  const 默认名称 = () => 当前扫描件?.名称 ?? `${能力.拍照 ? (手机模式 === '证件扫描' ? 证件 : 手机模式) : 模板?.名称 ?? '扫描件'}${当前日期()}`

  const 解析 = (页文字: string[], 使用模板 = 模板) => {
    if (!使用模板) return
    const 结果 = 页文字.map((文字, 序号) => 文字.trim() ? 解析识别文本(文字, 使用模板, `第 ${序号 + 1} 页`) : null).filter((项): 项 is 单据解析结果 => 项 !== null)
    设解析结果(结果); 设修改({}); 设已核对(new Set())
  }

  const 识别 = async () => {
    if (!可用页.length) { message.warning('请先拍照或导入图片'); return }
    清除识别()
    try {
      const 结果 = await 识别图片文字(modal, 可用页.map(页 => ({ 图片: 页.图片!, 类型: 'image/jpeg' })), { 表格: 模板?.分类 === '单据', 进度: (完成, 总数) => 设识别进度({ 完成, 总数 }) })
      const 文字 = 可用页.map((页, 序号) => 结果[序号].文字 ?? 页.文字)
      设页列表(列表 => 列表.map(页 => { const 位置 = 可用页.findIndex(项 => 项.标识 === 页.标识); return 位置 < 0 ? 页 : { ...页, 文字: 结果[位置].文字 ?? 页.文字 } }))
      设失败(结果.flatMap((项, 序号) => 项.错误 ? [{ 来源: `第 ${序号 + 1} 页`, 原因: 项.错误 }] : []))
      解析(文字)
      if (结果.some(项 => 项.文字)) message.success('识别完成，识别结果需对照原图核对')
    } catch (错误) {
      if (是取消授权(错误)) message.warning('已取消识别，图片未上传')
      else modal.error({ title: '识别失败', content: 错误文字(错误, '识别服务暂时不可用，请稍后重试'), okText: '知道了' })
    } finally { 设识别进度(null) }
  }

  const 记录导出 = async (格式: string, 文件名: string | null) => {
    if (!文件名) return
    message.success(`已导出 ${文件名}`)
    if (库 && 当前扫描件) { try { await 库.记录导出(当前扫描件.标识, 格式, 文件名); 设库版本(版本 => 版本 + 1) } catch { /* 导出已完成，导出记录写入失败不影响文件 */ } }
  }
  const 执行导出 = async (任务: () => Promise<void>, 标题 = '导出失败') => {
    if (!可用页.length) { message.warning('请先拍照或导入图片'); return }
    if (正在操作.current) return
    if (页列表.some(页 => 页.错误)) { modal.error({ title: 标题, content: '有图片尚未处理成功，请重新处理或移除该页后继续。', okText: '知道了' }); return }
    正在操作.current = true
    设导出中(true)
    try { await 任务() } catch (错误) {
      if (是取消授权(错误)) message.info('已取消识别，图片未上传')
      else if (!(错误 instanceof DOMException && 错误.name === 'AbortError')) modal.error({ title: 标题, content: 错误文字(错误, '处理失败，请重试'), okText: '知道了' })
    } finally { 正在操作.current = false; 设导出中(false); 设识别进度(null) }
  }
  const 导出图片PDF = () => 执行导出(async () => 记录导出('PDF', await 保存导出文件(`${默认名称()}.pdf`, await 生成图片PDF(扫描页列表()), 'pdf')))
  const 导出可搜索PDF = () => 执行导出(async () => {
    const 结果 = await 生成可搜索PDF(扫描页列表(), (数据, 操作) => 桥接.pdf.editPage(数据, 操作))
    if (结果.跳过字符.length) message.warning(`内置字体缺少 ${结果.跳过字符.length} 个字符，这些字符不可搜索：${结果.跳过字符.join('')}`)
    if (结果.截断页.length) message.warning(`第 ${结果.截断页.join('、')} 页文字过多，文字层只保留了前面部分`)
    await 记录导出('可搜索 PDF', await 保存导出文件(`${默认名称()}（可搜索）.pdf`, 结果.数据, 'pdf'))
  })
  const 导出Word = () => 执行导出(async () => {
    const 文字 = 可用页.map(页 => 页.文字)
    if (!文字.some(项 => 项.trim())) throw new Error('扫描件还没有识别文字，请先识别后再导出 Word')
    const 结果 = await 桥接.office.writeDocx(htmlToDocxModel(生成文字Html(文字)))
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '生成文字文档失败')
    await 记录导出('Word', await 保存导出文件(`${默认名称()}.docx`, 自Base64(结果.数据), 'word'))
  })

  const 取手机文字 = async (重新识别 = false) => {
    const 待识别 = 可用页.filter(页 => 重新识别 || !页.文字.trim())
    const 已得文字 = new Map(可用页.map(页 => [页.标识, 页.文字]))
    if (待识别.length) {
      const 结果 = await 识别图片文字(modal, 待识别.map(页 => ({ 图片: 页.图片!, 类型: 'image/jpeg' })), { 表格: 手机模式 === '拍照转Excel', 进度: (完成, 总数) => 设识别进度({ 完成, 总数 }) })
      const 未完成: string[] = []
      待识别.forEach((页, i) => {
        const 文字 = 结果[i]?.文字
        if (!文字?.trim()) { 未完成.push(`第 ${可用页.indexOf(页) + 1} 页：${结果[i]?.错误 || '未识别到有效文字'}`); return }
        已得文字.set(页.标识, 文字); 更新页(页.标识, { 文字, 译文: undefined })
      })
      if (未完成.length) throw new Error(未完成.join('\n'))
    }
    return 可用页.map(页 => ({ 标识: 页.标识, 文字: 已得文字.get(页.标识)! }))
  }
  const 手机识别 = () => 执行导出(async () => { await 取手机文字(true); message.success('识别完成，可对照照片修改文字') }, '识别失败')
  const 手机翻译 = () => 执行导出(async () => {
    const 结果 = await 翻译扫描文字(await 取手机文字(), 目标语言)
    结果.forEach((译文, 标识) => 更新页(标识, { 译文 }))
  }, '翻译失败')
  const 保存手机文字 = () => 执行导出(async () => {
    let 各页: string[]
    if (手机模式 === '图片翻译') {
      const 缺译页 = 可用页.findIndex(项 => !项.译文?.trim())
      if (缺译页 >= 0) throw new Error(`请先完成第 ${缺译页 + 1} 页的翻译`)
      各页 = 可用页.map(项 => 项.译文!)
    } else 各页 = (await 取手机文字()).map(项 => 项.文字)
    const 结果 = await 桥接.office.writeDocx(htmlToDocxModel(生成文字Html(各页)))
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '无法生成可编辑文字文档')
    await 记录导出('Word', await 保存导出文件(`${默认名称()}.docx`, 自Base64(结果.数据), 'word'))
  })
  const 保存手机表格 = () => 执行导出(async () => {
    const 各页 = await 取手机文字(), 工作簿 = 各页.map((页, i) => 生成照片工作表(页.文字, i + 1))
    const 结果 = await 桥接.office.writeXlsx(导出为Xlsx(工作簿))
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '无法生成可编辑工作簿')
    await 记录导出('Excel', await 保存导出文件(`${默认名称()}.xlsx`, 自Base64(结果.数据), 'table'))
  })
  const 保存证件 = () => 执行导出(async () => 记录导出('PDF', await 保存导出文件(`${默认名称()}.pdf`, await 生成证件PDF(扫描页列表(), 证件), 'pdf')))
  const 复制文字 = async () => {
    const 文字 = 可用页.map(页 => (能力.拍照 && 手机模式 === '图片翻译' ? 页.译文 ?? '' : 页.文字).trim()).filter(Boolean).join('\n\n')
    if (!文字) { message.warning('扫描件还没有识别文字'); return }
    try { await writeClipboardText(文字); message.success('已复制识别文字') } catch (错误) { modal.error({ title: '复制失败', content: 错误文字(错误, '系统复制不可用'), okText: '知道了' }) }
  }
  const 已修改结果 = 解析结果.map(结果 => 应用修改(结果, 修改))
  const 异常清单 = 模板 ? 已修改结果.flatMap(结果 => 生成异常清单(结果, 模板)) : []
  const 导出表格 = () => 执行导出(async () => {
    if (!模板) return
    const 工作表 = 生成识别工作表(已修改结果, 模板, 异常清单)
    if (能力.扫描件库) { createDoc('table', [工作表], { 名称: `${默认名称()}.xlsx` }); return }
    const 结果 = await 桥接.office.writeXlsx(导出为Xlsx([工作表]))
    if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '生成表格文件失败')
    await 记录导出('Excel', await 保存导出文件(`${默认名称()}.xlsx`, 自Base64(结果.数据), 'table'))
  })

  const 当前手机草稿 = (): 手机草稿 => ({ 页: 页引用.current, 来源, 扫描件: 当前扫描件, 工具: 手机模式, 证件, 译文语言: 目标语言 })
  const 保存手机草稿 = async (稿: 手机草稿, 名称: string, 分组: string) => {
    if (!库) throw new Error('本机扫描件库尚未就绪，照片仍在当前工作台')
    const 共用原片 = new Map<Blob, Uint8Array>()
    const 页: 扫描页[] = []
    for (const 项 of 稿.页) {
      if (!项.图片 || 项.错误 || 项.处理中) throw new Error('请在扫描结果中重新处理或移除失败页后保存，已拍照片仍在工作台')
      let 跨页原片: Uint8Array | undefined
      if (项.跨页原片) {
        跨页原片 = 共用原片.get(项.跨页原片) ?? new Uint8Array(await 项.跨页原片.arrayBuffer())
        共用原片.set(项.跨页原片, 跨页原片)
      }
      页.push({ 图片: 项.图片, 类型: 'image/jpeg', 宽: 项.宽, 高: 项.高, 文字: 项.文字, 译文: 项.译文,
        原图: new Uint8Array(await 项.原图.arrayBuffer()), 原图类型: 项.原图.type, 跨页原片, 跨页类型: 项.跨页原片?.type, 设置: 项.设置 })
    }
    const 标识 = await 库.保存({ 标识: 稿.扫描件?.标识, 名称, 分组, 来源: 稿.来源, 模板: '', 页, 工具: 稿.工具, 证件: 稿.证件, 译文语言: 稿.译文语言 })
    return { 标识, 名称, 分组 }
  }
  const 离开取景 = async (去向: '返回' | '扫描库') => {
    if (忙碌 || 正在操作.current) return
    正在操作.current = true; 设导出中(true)
    try {
      const 当前 = 当前手机草稿()
      for (const 稿 of [...草稿.current.values(), 当前]) {
        if (!稿.页.length) continue
        const 名称 = 稿.扫描件?.名称 ?? `${稿.工具 === '证件扫描' ? 稿.证件 : 稿.工具}${当前日期()}`
        const 分组 = 稿.扫描件?.分组 ?? (稿.工具 === '证件扫描' ? '我的证件' : '')
        稿.扫描件 = await 保存手机草稿(稿, 名称, 分组)
        if (稿 === 当前) 设当前扫描件(稿.扫描件)
      }
      if (去向 === '扫描库') { 设库版本(值 => 值 + 1); 设视图('全部扫描件'); 设取景中(false) }
      else if (返回) 返回()
      else 设取景中(false)
    } catch (错误) { modal.error({ title: '草稿保存失败', content: 错误文字(错误, '无法保存到扫描件库，已拍照片仍在当前工作台'), okText: '知道了' }) }
    finally { 正在操作.current = false; 设导出中(false) }
  }

  const 保存到库 = async () => {
    if (!库 || !保存对话框) return
    const 名称 = 保存对话框.名称.trim()
    if (!名称) { message.warning('请填写扫描件名称'); return }
    设导出中(true)
    try {
      if (能力.拍照) {
        设当前扫描件(await 保存手机草稿(当前手机草稿(), 名称, 保存对话框.分组))
        设保存对话框(null); 设库版本(版本 => 版本 + 1); message.success('已保存到扫描件库')
        return
      }
      const 页 = await Promise.all(可用页.map(async 项 => ({ 图片: 项.图片!, 类型: 'image/jpeg' as const, 宽: 项.宽, 高: 项.高, 文字: 项.文字, 原图: await 压缩原图(项.原图), 设置: 项.设置 })))
      const 标识 = await 库.保存({ 标识: 当前扫描件?.标识, 名称, 分组: 保存对话框.分组, 来源, 模板: 模板标识, 页 })
      设当前扫描件({ 标识, 名称, 分组: 保存对话框.分组 }); 设保存对话框(null); 设库版本(版本 => 版本 + 1)
      message.success('已保存到扫描件库')
    } catch (错误) { modal.error({ title: '保存失败', content: 错误文字(错误, '本机存储空间不足或不可用'), okText: '知道了' }) }
    finally { 设导出中(false) }
  }

  const 打开扫描件 = async (标识: string) => {
    if (!库) return
    const 扫描件 = await 库.读取(标识)
    if (!扫描件) { message.error('扫描件不存在或已删除'); return }
    for (const 页 of 页列表) if (页.预览) URL.revokeObjectURL(页.预览)
    设页列表(扫描件.页.map(页 => ({ 标识: 新标识(), 原图: new Blob([(页.原图 ?? 页.图片) as BlobPart], { type: 页.原图类型 ?? 页.类型 }),
      ...(页.跨页原片 ? { 跨页原片: new Blob([页.跨页原片 as BlobPart], { type: 页.跨页类型 ?? 'image/jpeg' }) } : {}),
      设置: (页.设置 as 页面设置 | undefined) ?? { 四角: null, 模式: '彩色', 旋转: 0 }, 图片: 页.图片, 宽: 页.宽, 高: 页.高, 预览: URL.createObjectURL(new Blob([页.图片 as BlobPart], { type: 页.类型 })), 文字: 页.文字, 译文: 页.译文, 处理中: false })))
    if (能力.拍照) { 设手机模式(扫描件.工具 ?? '文件扫描'); 设证件(扫描件.证件 ?? '身份证'); 设目标语言(扫描件.译文语言 ?? '中文') }
    设当前扫描件({ 标识, 名称: 扫描件.名称, 分组: 扫描件.分组 }); 设来源(扫描件.来源); 设模板标识(扫描件.模板)
    清除识别()
    if (扫描件.模板 && 取识别模板(扫描件.模板)) 解析(扫描件.页.map(页 => 页.文字), 取识别模板(扫描件.模板))
    设视图('工作台')
  }

  const 文字模式 = ['提取文字', '拍照转Word', '拍照转Excel', '图片翻译'].includes(手机模式)
  const 当前分组 = 当前扫描件?.分组 ?? (能力.拍照 && 手机模式 === '证件扫描' ? '我的证件' : 模板分组(模板?.分类 ?? ''))
  const 手机操作 = <section className="scan-card scan-actions scan-mobile-actions" aria-label="扫描结果操作">
    {手机模式 === '图片翻译' && <label className="scan-field">翻译成<Select aria-label="翻译目标语言" value={目标语言} disabled={忙碌}
      options={['中文', '英文', '日文', '韩文', '法文', '德文', '俄文', '西班牙文'].map(语言 => ({ label: 语言, value: 语言 }))}
      onChange={语言 => { 设目标语言(语言); 设页列表(页 => 页.map(项 => ({ ...项, 译文: undefined }))) }} /></label>}
    {文字模式 && <Button disabled={忙碌 || !可用页.length} onClick={() => void 手机识别()}>识别文字</Button>}
    {手机模式 === '图片翻译' && <Button type="primary" disabled={忙碌 || !可用页.length} onClick={() => void 手机翻译()}>翻译文字</Button>}
    {['拍照转Word', '提取文字', '图片翻译'].includes(手机模式) && <Button type={手机模式 === '图片翻译' ? 'default' : 'primary'} disabled={忙碌 || !可用页.length} onClick={() => void 保存手机文字()}>{手机模式 === '图片翻译' ? '导出译文 Word' : '导出 Word'}</Button>}
    {手机模式 === '拍照转Excel' && <Button type="primary" disabled={忙碌 || !可用页.length} onClick={() => void 保存手机表格()}>导出 Excel</Button>}
    {文字模式 && 手机模式 !== '拍照转Excel' && <Button disabled={忙碌 || !可用页.some(页 => 手机模式 === '图片翻译' ? 页.译文?.trim() : 页.文字.trim())} onClick={() => void 复制文字()}>{手机模式 === '图片翻译' ? '复制译文' : '复制文字'}</Button>}
    {!文字模式 && <Button type="primary" disabled={忙碌 || !可用页.length} onClick={() => void (手机模式 === '证件扫描' ? 保存证件() : 导出图片PDF())}>{手机模式 === '证件扫描' ? '导出 A4 证件 PDF' : '导出 PDF'}</Button>}
    {手机模式 === '文件扫描' && <Button disabled={忙碌 || !可用页.length} onClick={() => void 执行导出(async () => {
      const 文字 = await 取手机文字()
      const 结果 = await 生成可搜索PDF(扫描页列表().map((页, i) => ({ ...页, 文字: 文字[i].文字 })), (数据, 操作) => 桥接.pdf.editPage(数据, 操作))
      if (结果.跳过字符.length || 结果.截断页.length) message.warning('部分识别文字受字体或页幅限制，可对照原图核对')
      await 记录导出('可搜索 PDF', await 保存导出文件(`${默认名称()}（可搜索）.pdf`, 结果.数据, 'pdf'))
    })}>导出可搜索 PDF</Button>}
    {库 && <Button disabled={忙碌 || !可用页.length} onClick={() => 设保存对话框({ 名称: 默认名称(), 分组: 当前分组 })}>保存到扫描件库</Button>}
    {识别进度 && <Progress percent={Math.round(识别进度.完成 / 识别进度.总数 * 100)} size="small" />}
  </section>
  const 页面 = <>
    <section className="scan-card scan-toolbar" aria-label="扫描工作台">
      {能力.拍照 ? <Button disabled={忙碌} onClick={() => 设取景中(true)}>继续拍摄</Button> : <ScanImportButtons 能力={能力} 拍摄={拍摄} 导入={导入} 禁用={Boolean(识别进度)} />}
      <div className="scan-toolbar__options">
        {!能力.拍照 && <label className="scan-field"><span>识别模板</span>
          <Select aria-label="识别模板" value={模板标识} onChange={值 => { 设模板标识(值); 解析(可用页.map(页 => 页.文字), 值 ? 取识别模板(值) : null) }} style={{ minWidth: 160 }}
            options={[{ value: '', label: '万能扫描' }, ...['证件', '试卷', '单据'].map(分类 => ({ label: 分类 === '单据' ? '票据' : 分类, options: 扫描模板列表.filter(项 => 项.分类 === 分类).map(项 => ({ value: 项.标识, label: 项.名称 })) }))]} />
        </label>}
        <label className="scan-field"><span>增强效果</span>
          <Segmented aria-label="增强效果" value={模式} disabled={忙碌} onChange={值 => 切换模式(值 as 增强模式)} options={[{ value: '彩色', label: '彩色' }, { value: '灰度', label: '灰度' }, { value: '黑白', label: '黑白' }]} />
        </label>
      </div>
    </section>
    {页列表.length === 0 ? <div className="scan-empty">
      <Icon name="scan" size={40} />
      <p>{能力.拍照 ? '拍照或从相册导入文档，自动裁边并增强。' : '导入文档照片或截图，自动裁边并增强。'}</p>
      <span className="scan-help">图片只在本机处理；点击识别并同意授权后才会上传识别。</span>
    </div> : <>
      <ol className="scan-pages" aria-label="扫描页面">
        {页列表.map((页, 序号) => <li key={页.标识} className="scan-page">
          <div className="scan-page__image">
            {页.处理中 ? <Spin tip="正在处理"><div className="scan-page__placeholder" /></Spin> : 页.错误 ? <p role="alert">{页.错误}</p> : 页.预览 ? <img src={页.预览} alt={`第 ${序号 + 1} 页`} /> : null}
          </div>
          <div className="scan-page__bar">
            <strong>{能力.拍照 && 手机模式 === '证件扫描' && 证件 === '身份证' ? `第 ${Math.floor(序号 / 2) + 1} 份 · ${序号 % 2 ? '反面（国徽面）' : '正面（人像面）'}` : `第 ${序号 + 1} 页`}</strong>
            <span className="scan-page__actions">
              {能力.拍照 && <Button size="small" disabled={忙碌} onClick={() => {
                if (原片地址.current) URL.revokeObjectURL(原片地址.current)
                原片地址.current = URL.createObjectURL(页.跨页原片 ?? 页.原图); 设原图查看(原片地址.current)
              }}>查看原图</Button>}
              <Button size="small" disabled={页.处理中} onClick={() => void 打开四角(页)}>调整四角</Button>
              <Button size="small" disabled={页.处理中} aria-label="旋转" title="旋转" icon={<Icon name="retry" size={14} />} onClick={() => 旋转页(页)} />
              <Button size="small" disabled={序号 === 0} aria-label="上移" title="上移" icon={<Icon name="arrow-left" size={14} className="scan-icon--up" />} onClick={() => 移动页(序号, -1)} />
              <Button size="small" disabled={序号 === 页列表.length - 1} aria-label="下移" title="下移" icon={<Icon name="arrow-left" size={14} className="scan-icon--down" />} onClick={() => 移动页(序号, 1)} />
              <Button size="small" danger aria-label="删除页面" title="删除页面" icon={<Icon name="trash" size={14} />} onClick={() => 删除页(页)} />
            </span>
          </div>
          {能力.拍照 && 手机模式 === '去除手写' && <div className="scan-actions">
            <Button disabled={忙碌 || !页.预览} onClick={() => 设擦除页(页)}>擦除手写字迹</Button>
            <Button disabled={忙碌} onClick={() => void 处理(页, { ...页.设置, 清除彩笔: !页.设置.清除彩笔 })}>{页.设置.清除彩笔 ? '保留彩色笔迹' : '清除彩色笔迹'}</Button>
            {!!页.设置.笔画?.length && <Button disabled={忙碌} onClick={() => void 处理(页, { ...页.设置, 笔画: 页.设置.笔画!.slice(0, -1) })}>撤销上一笔</Button>}
          </div>}
          {(!能力.拍照 || 文字模式) && <Input.TextArea className="scan-page__text" aria-label="识别文字" disabled={忙碌} placeholder="识别后的文字显示在这里，可直接修改" autoSize={{ minRows: 2, maxRows: 8 }} value={页.文字} onChange={事件 => 更新页(页.标识, { 文字: 事件.target.value, 译文: undefined })} />}
          {能力.拍照 && 手机模式 === '图片翻译' && 页.译文 !== undefined && <Input.TextArea aria-label="译文" disabled={忙碌} value={页.译文} autoSize={{ minRows: 2, maxRows: 8 }} onChange={事件 => 更新页(页.标识, { 译文: 事件.target.value })} />}
        </li>)}
      </ol>
      {能力.拍照 ? 手机操作 : <section className="scan-card scan-actions" aria-label="识别与导出">
        <Button type="primary" disabled={忙碌} loading={Boolean(识别进度)} onClick={() => void 识别()}>识别文字</Button>
        <Button disabled={忙碌} onClick={() => void 导出图片PDF()}>导出 PDF</Button>
        <Button disabled={忙碌} onClick={() => void 导出可搜索PDF()}>导出可搜索 PDF</Button>
        <Button disabled={忙碌} onClick={() => void 导出Word()}>导出 Word</Button>
        <Button disabled={忙碌} onClick={() => void 复制文字()}>复制文字</Button>
        {能力.扫描件库 && 库 && <Button disabled={忙碌} onClick={() => 设保存对话框({ 名称: 默认名称(), 分组: 当前扫描件?.分组 ?? 模板分组(模板?.分类 ?? '') })}>保存到扫描件库</Button>}
        <Button disabled={忙碌} onClick={清空}>清空</Button>
        {识别进度 && <Progress className="scan-progress" percent={Math.round(识别进度.完成 / Math.max(1, 识别进度.总数) * 100)} size="small" format={() => `${识别进度.完成}/${识别进度.总数}`} />}
      </section>}
      {模板 && (解析结果.length > 0 || 失败.length > 0) && <>
        <ReviewPanel 模板={模板} 结果列表={解析结果} 异常清单={异常清单} 已核对={已核对} 修改={修改} 失败={失败}
          切换核对={(键, 选中) => 设已核对(旧 => { const 新 = new Set(旧); if (选中) 新.add(键); else 新.delete(键); return 新 })}
          修改字段={(来源, 行, 键, 值) => 设修改(旧 => ({ ...旧, [修改键(来源, 行, 键)]: 值 }))}
          查看原图={来源 => { const 页 = 可用页[Number(来源.match(/\d+/)?.[0] ?? 1) - 1]; if (页?.预览) 设原图查看(页.预览) }} />
        {解析结果.some(结果 => 结果.模板匹配) && <div className="scan-actions"><Button type="primary" disabled={忙碌} onClick={() => void 导出表格()}>{能力.扫描件库 ? '生成工作表' : '下载 xlsx'}</Button></div>}
      </>}
    </>}
  </>

  if (能力.拍照 && 取景中) return <MobileScanCamera 模式={手机模式} 切换模式={工具 => 切换草稿(工具)} 证件={证件} 切换证件={类型 => 切换草稿('证件扫描', 类型)}
    书籍={书籍} 切换书籍={设书籍} 页数={页列表.length} 缩略图={页列表[页列表.length - 1]?.预览} 忙碌={忙碌}
    接收图片={添加图片} 查看结果={() => { 设视图('工作台'); 设取景中(false) }} 打开扫描库={() => void 离开取景('扫描库')} 返回={() => void 离开取景('返回')} />
  return <div className={`local-page scan-page-root${能力.拍照 ? ' scan-mobile-results' : ''}`}>
    <header className="local-page__header">
      <div>
        {能力.拍照 && <Button type="text" disabled={忙碌} onClick={() => 设取景中(true)}>返回取景</Button>}
        <h1>{能力.拍照 ? 手机模式 : '扫描与识别'}</h1>
        <p>{能力.拍照 ? 手机模式 === '证件扫描' ? `${证件}按 A4 纸排版。${证件 === '身份证' ? '请按人像面、国徽面的顺序排列。' : ''}` : 手机模式 === '去除手写' ? '已自动清除红蓝色笔迹，可保留彩色内容或滑动擦除黑色笔迹。' : 手机模式 === '拍照转Excel' ? '每张照片生成一张可编辑工作表，可在识别结果中用竖线调整分列。' : 手机模式 === '图片翻译' ? '核对原文后选择目标语言，翻译时会将文字发送给已配置的翻译服务。' : `共 ${页列表.length} 页，可调整裁边和页序。` : 能力.扫描件库 ? '导入图片或粘贴截图，自动裁边增强，多页合成 PDF；识别文字后可导出可搜索 PDF 与 Word。' : '上传图片，在浏览器本机裁边增强后下载 PDF、Word 或表格；网页版不保留扫描件。'}</p>
      </div>
    </header>
    {(!能力.拍照 || 文字模式) && <div className="scan-notice" role="note"><Tag color="warning">识别结果需核对</Tag><span>文字识别由已配置的 AI 服务完成，可能存在错字或数字偏差，关键内容请对照原图核对。</span></div>}
    {能力.扫描件库 && <Segmented className="scan-views" aria-label="扫描件视图" value={视图} onChange={值 => 设视图(值 as typeof 视图)} options={[{ value: '工作台', label: '扫描工作台' }, { value: '全部扫描件', label: '全部扫描件' }, { value: '已导出文件', label: '已导出文件' }]} />}
    {视图 === '工作台' ? 页面 : 库 ? <ScanLibraryView 库={库} 视图={视图} 版本={库版本} 打开={标识 => void 打开扫描件(标识)} 分组变化={设分组列表} /> : <Spin />}
    <CornerEditor 打开={Boolean(四角页)} 预览={四角页?.预览 ?? null} 当前四角={(四角页?.页.设置.四角 as 四角 | null) ?? null} 关闭={关闭四角} 应用={应用四角} />
    {擦除页?.预览 && <HandwritingEditor 预览={擦除页.预览} 宽={擦除页.宽} 高={擦除页.高} 关闭={() => 设擦除页(null)} 应用={笔画 => {
      void 处理(擦除页, { ...擦除页.设置, 笔画: [...(擦除页.设置.笔画 ?? []), ...笔画] }); 设擦除页(null)
    }} />}
    <Modal open={Boolean(原图查看)} title="查看原图" footer={null} onCancel={() => {
      if (原片地址.current) { URL.revokeObjectURL(原片地址.current); 原片地址.current = '' }
      设原图查看(null)
    }} width={720}>{原图查看 && <img className="scan-preview" src={原图查看} alt="原图" />}</Modal>
    <Modal open={Boolean(保存对话框)} title="保存到扫描件库" okText="保存" cancelText="取消" confirmLoading={导出中} onOk={() => void 保存到库()} onCancel={() => 设保存对话框(null)}>
      {保存对话框 && <div className="scan-form">
        <label className="scan-field scan-field--block"><span>扫描件名称</span><Input aria-label="扫描件名称" maxLength={80} value={保存对话框.名称} onChange={事件 => 设保存对话框({ ...保存对话框, 名称: 安全文件名(事件.target.value) === '扫描件' && !事件.target.value.trim() ? '' : 事件.target.value })} /></label>
        <label className="scan-field scan-field--block"><span>分组</span><Select aria-label="分组" value={保存对话框.分组} onChange={分组 => 设保存对话框({ ...保存对话框, 分组 })} options={[{ value: '', label: '未分组' }, ...分组列表.map(分组 => ({ value: 分组, label: 分组 }))]} /></label>
      </div>}
    </Modal>
  </div>
}
