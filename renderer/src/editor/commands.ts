// 编辑器命令注册表：Ribbon 按钮只派发命令，全部行为集中在此文件。
// 命令通过上下文回调操作编辑区，因此不直接依赖 DOM 细节，便于单元测试。
import type { HistoryStack, 保存的选区 } from './history'
import { countWords } from './wordCount'
import { 转换简繁带统计 } from './langConvert'
import { 提取大纲, 生成目录Html } from './toc'
import { 生成题注, 生成图表目录Html, 提取题注, 统计题注, type 编号类型 } from './captions'
import { 删除批注, 接受修订, 提取批注, 生成批注, 拒绝修订, 统计修订 } from './review'
import {
  公式模板列表,
  示例SmartArt节点,
  示例图表数据,
  生成公式Html,
  生成图表Svg,
  生成SmartArtHtml,
  type SmartArt类型,
  type 图表类型,
} from './graphics'
import { 提取引文序号, 生成书目Html, 生成引文标记, type 文献 } from './citation'
import { 解析字号, 字号列表 } from './fontOptions'
import { 解析文档, type 文档模型, type 文字页面设置 } from '../office/docModel'
import { 桥接 } from '../ipc/bridge'
import { 基准文件名, 记录最近文档, 读取本地文件内容, type 打开类型 } from '../fileOpen'
import { 导出为Html, 保存为纯文本, 纯文本损失项 } from './exportDoc'
import { 放大一档, 缩小一档 } from './wheelZoom'

export interface ViewState {
  缩放: number
  标尺: boolean
  网格线: boolean
  段落标记: boolean
  视图模式: '页面视图' | '阅读版式' | 'Web 版式' | '大纲视图' | '草稿'
  纸张: string
  纸张方向: '纵向' | '横向'
  页边距: string
  分栏: string
  水印: string
  页面边框: string
  页面颜色: string
  文字方向: '横排' | '竖排'
  原始纸张?: { 宽: number; 高: number }
  原始页边距?: { 上: number; 右: number; 下: number; 左: number }
  页眉Html?: string
  页脚Html?: string
  显示批注: boolean
  修订模式: boolean
  /** 文档保护：开启后编辑区转为只读 */
  文档保护: boolean
}

/** 可用于格式刷复制与应用的字符格式 */
export interface 选区格式 {
  加粗: boolean
  斜体: boolean
  下划线: boolean
  字体: string
  字号: string
  颜色: string
}

/** 可插入的资源类型，由编辑器容器负责具体实现 */
export type InsertableKind =
  | '封面'
  | '空白页'
  | '分页符'
  | '表格'
  | '图片'
  | '形状'
  | '文本框'
  | '艺术字'
  | '页眉'
  | '页脚'
  | '页码'
  | '日期时间'
  | '符号'
  | '超链接'
  | '书签'
  | '脚注'
  | '尾注'

export interface CommandContext {
  /** 编辑区根元素 */
  root: HTMLElement
  history: HistoryStack
  /** 请求重新渲染，用于刷新按钮激活态与状态栏 */
  refresh: () => void
  /** 输出中文提示 */
  notify: (文本: string) => void
  view: ViewState
  setView: (部分: Partial<ViewState>) => void
  /** 执行富文本格式化指令 */
  执行格式化: (指令: string, 值?: string) => void
  /** 查询当前选区在某指令上的取值 */
  查询格式: (指令: string) => string
  /** 用历史快照替换编辑区内容与选区 */
  应用内容: (html: string, selection: 保存的选区 | null) => void
  /** 在光标处插入 HTML 片段 */
  插入内容: (html: string) => void
  /** 读取编辑区当前 HTML */
  读取内容: () => string
  /** 保存前记录旧版自适应图片的实际尺寸，并返回同步后的正文快照 */
  准备保存内容?: () => string
  /** 触发文件下载 */
  下载: (内容: string, 文件名: string, 类型: string) => void
  打开查找: () => void
  导出: (格式: 'html' | 'text') => void
  检查拼写: () => void
  切换全选: () => void
  /** 插入结构化资源 */
  插入资源: (类型: InsertableKind) => void
  确认仅供网页或Pdf?: (名称: string, 继续插入: () => void) => void
  /** 更新当前段落的样式 */
  设置段落样式: (样式: { lineHeight?: string; textAlign?: string; backgroundColor?: string }) => void
  /** 应用内置样式（正文、标题等） */
  应用样式: (样式名: string) => void
  /** 在选区所在段落上切换类名，用于首字下沉等段落级效果 */
  切换段落类名: (类名: string) => void
  /** 读取当前选区的字符格式 */
  读取选区格式: () => 选区格式
  /** 把字符格式应用到当前选区 */
  应用选区格式: (格式: 选区格式) => void
  /** 格式刷暂存区，值为 null 表示尚未复制格式 */
  格式刷暂存: { 值: 选区格式 | null }
  /** 当前文档名，供文档部件等命令使用 */
  当前文档名: string
  当前文档路径?: string | null
  当前文件指纹?: string
  打开新文档?: (类型: 打开类型, 内容: unknown, 路径: string, 警告?: string[], 页面设置?: 文字页面设置, 文件指纹?: string) => void
  显示文件错误?: (标题: string, 内容: string) => void
  检查保存路径?: (路径: string) => boolean
  设置文档路径?: (路径: string, 已保存内容?: string, 文件指纹?: string, 页面设置快照?: 文字页面设置) => void
  保真风险?: { 来源路径: string; 警告: string[] } | null
  提示保真风险?: (警告: string[]) => void
  确认保真另存?: (警告: string[]) => Promise<boolean>
  /** 打开表格网格选择器 */
  打开表格网格: () => void
  /** 打开文献管理面板 */
  打开文献管理: () => void
  /** 打开文档比较面板 */
  打开比较面板: () => void
  /** 打开文字翻译面板 */
  打开翻译面板: () => void
  /** 打开邮件合并数据与预览面板 */
  打开邮件合并面板: () => void
  /** 显示或收起文档标题导航 */
  切换导航窗格: () => void
  /** 当前会话维护的文献列表 */
  文献列表: 文献[]
}

export interface EditorCommand {
  id: string
  label: string
  run: (上下文: CommandContext, 参数?: string) => void
  enabled?: (上下文: CommandContext) => boolean
  active?: (上下文: CommandContext) => boolean
}

/** 尚未实现的功能：按钮就位，点击给出中文提示，不伪造行为 */
export function 未实现命令(id: string, label: string): EditorCommand {
  return {
    id,
    label,
    run: (上下文) => {
      上下文.notify('该功能开发中')
    },
  }
}

/** 记录历史后执行格式化指令，用于纯格式化类命令 */
function 生成格式化命令(id: string, label: string, 指令: string): EditorCommand {
  return {
    id,
    label,
    run: (上下文, 参数) => {
      上下文.history.record({ html: 上下文.读取内容(), selection: null })
      上下文.执行格式化(指令, 参数)
      上下文.refresh()
    },
  }
}

/** 直接调用上下文回调的命令 */
function 生成回调命令(
  id: string,
  label: string,
  执行: (上下文: CommandContext, 参数?: string) => void
): EditorCommand {
  return { id, label, run: 执行 }
}

const 格式化命令定义: Array<[string, string, string]> = [
  ['clipboard.paste', '粘贴', 'paste'],
  ['clipboard.cut', '剪切', 'cut'],
  ['clipboard.copy', '复制', 'copy'],
  ['font.bold', '加粗', 'bold'],
  ['font.italic', '斜体', 'italic'],
  ['font.underline', '下划线', 'underline'],
  ['font.strike', '删除线', 'strikeThrough'],
  ['font.subscript', '下标', 'subscript'],
  ['font.superscript', '上标', 'superscript'],
  ['font.clear', '清除格式', 'removeFormat'],
  ['para.bullet', '项目符号', 'insertUnorderedList'],
  ['para.number', '编号', 'insertOrderedList'],
  ['para.indentDecrease', '减少缩进', 'outdent'],
  ['para.indentIncrease', '增加缩进', 'indent'],
  ['para.alignLeft', '左对齐', 'justifyLeft'],
  ['para.alignCenter', '居中', 'justifyCenter'],
  ['para.alignRight', '右对齐', 'justifyRight'],
  ['para.alignJustify', '两端对齐', 'justifyFull'],
]

const 未实现命令定义: Array<[string, string]> = []

/** 带参数或需要读取当前状态的字体命令 */
const 字体命令: EditorCommand[] = [
  生成回调命令('font.name', '字体', (上下文, 参数) => {
    if (参数 === undefined || 参数.length === 0) {
      上下文.notify('请先选择字体')
      return
    }
    上下文.history.record({ html: 上下文.读取内容(), selection: null })
    上下文.执行格式化('fontName', 参数)
    上下文.refresh()
  }),
  生成回调命令('font.size', '字号', (上下文, 参数) => {
    if (参数 === undefined || 参数.length === 0) {
      上下文.notify('请先选择字号')
      return
    }
    上下文.history.record({ html: 上下文.读取内容(), selection: null })
    上下文.执行格式化('fontSizePt', String(解析字号(参数)))
    上下文.refresh()
  }),
  生成回调命令('font.grow', '增大字号', (上下文) => {
    const 当前 = Number.parseFloat(上下文.查询格式('fontSizePt')) || 10.5
    const 下一个 = [...new Set(字号列表.map(解析字号))].sort((a, b) => a - b).find(值 => 值 > 当前 + 0.01)
    if (下一个 === undefined) {
      上下文.notify('字号已达上限')
      return
    }
    上下文.history.record({ html: 上下文.读取内容(), selection: null })
    上下文.执行格式化('fontSizePt', String(下一个))
    上下文.refresh()
  }),
  生成回调命令('font.shrink', '减小字号', (上下文) => {
    const 当前 = Number.parseFloat(上下文.查询格式('fontSizePt')) || 10.5
    const 下一个 = [...new Set(字号列表.map(解析字号))].sort((a, b) => b - a).find(值 => 值 < 当前 - 0.01)
    if (下一个 === undefined) {
      上下文.notify('字号已达下限')
      return
    }
    上下文.history.record({ html: 上下文.读取内容(), selection: null })
    上下文.执行格式化('fontSizePt', String(下一个))
    上下文.refresh()
  }),
  生成格式化命令('font.highlight', '突出显示', 'hiliteColor'),
  生成回调命令('font.color', '字体颜色', (上下文, 参数) => {
    if (参数 === undefined || 参数 === null || 参数.length === 0) {
      上下文.notify('请先选择颜色')
      return
    }
    上下文.history.record({ html: 上下文.读取内容(), selection: null })
    上下文.执行格式化('foreColor', 参数)
    上下文.refresh()
  }),
]

/** 段落与样式命令 */
const 段落命令: EditorCommand[] = [
  生成回调命令('para.lineSpacing', '行距', (上下文, 参数) => {
    上下文.设置段落样式({ lineHeight: 参数 ?? '1.5' })
    上下文.refresh()
  }),
  生成回调命令('para.shading', '段落底纹', (上下文, 参数) => {
    上下文.设置段落样式({ backgroundColor: 参数 ?? '#F2F5FA' })
    上下文.refresh()
  }),
  ...['正文', '标题 1', '标题 2', '标题 3'].map((样式名, 下标) =>
    生成回调命令(`style.${['body', 'heading1', 'heading2', 'heading3'][下标]}`, 样式名, (上下文) => {
      上下文.应用样式(样式名)
      上下文.refresh()
    })
  ),
]

/** 编辑命令 */
const 编辑命令: EditorCommand[] = [
  生成回调命令('clipboard.formatPainter', '格式刷', (上下文) => {
    if (上下文.格式刷暂存.值 === null) {
      上下文.格式刷暂存.值 = 上下文.读取选区格式()
      上下文.notify('已复制当前格式，选中目标内容后再次点击格式刷即可应用')
      return
    }
    const 格式 = 上下文.格式刷暂存.值
    上下文.history.record({ html: 上下文.读取内容(), selection: null })
    上下文.应用选区格式(格式)
    上下文.格式刷暂存.值 = null
    上下文.notify('格式已应用')
    上下文.refresh()
  }),
  生成回调命令('edit.find', '查找', (上下文) => 上下文.打开查找()),
  生成回调命令('edit.replace', '替换', (上下文) => 上下文.打开查找()),
  生成回调命令('edit.selectAll', '全选', (上下文) => 上下文.切换全选()),
  生成回调命令('edit.undo', '撤销', (上下文) => {
    if (!上下文.history.canUndo()) {
      上下文.notify('没有可撤销的操作')
      return
    }
    const 上一步 = 上下文.history.undo()
    if (上一步 !== null) {
      上下文.应用内容(上一步.html, 上一步.selection)
    }
    上下文.refresh()
  }),
  生成回调命令('edit.redo', '重做', (上下文) => {
    if (!上下文.history.canRedo()) {
      上下文.notify('没有可重做的操作')
      return
    }
    const 下一步 = 上下文.history.redo()
    if (下一步 !== null) {
      上下文.应用内容(下一步.html, 下一步.selection)
    }
    上下文.refresh()
  }),
]

/** 插入命令：统一走 插入资源，由编辑器容器实现具体动作 */
const 插入命令: EditorCommand[] = [
  ...(
    [
    ['page.cover', '封面', '封面'],
    ['page.blank', '空白页', '空白页'],
    ['page.break', '分页符', '分页符'],
    ['table.insert', '插入表格', '表格'],
    ['image.insert', '图片', '图片'],
    ['shape.insert', '形状', '形状'],
    ['textbox.insert', '文本框', '文本框'],
    ['wordart.insert', '艺术字', '艺术字'],
    ['header.edit', '页眉', '页眉'],
    ['footer.edit', '页脚', '页脚'],
    ['pagenumber.insert', '页码', '页码'],
    ['datetime.insert', '日期时间', '日期时间'],
    ['symbol.insert', '符号', '符号'],
    ['link.insert', '超链接', '超链接'],
    ['bookmark.insert', '书签', '书签'],
    ['footnote.insert', '插入脚注', '脚注'],
    ['endnote.insert', '插入尾注', '尾注'],
  ] as Array<[string, string, InsertableKind]>
  ).map(([id, label, 类型]) =>
    生成回调命令(id, label, (上下文) => 上下文.插入资源(类型))
  ),
  生成回调命令('chart.insert', '图表', (上下文, 参数) => {
    const 类型 = (参数 ?? '柱形图') as 图表类型
    const svg = 生成图表Svg(类型, 示例图表数据)
    if (svg.length === 0) {
      上下文.notify('图表数据为空，无法生成图表')
      return
    }
    上下文.确认仅供网页或Pdf?.('图表', () => {
      上下文.插入内容(`<div class="wps-chart" contenteditable="false">${svg}</div><p><br></p>`)
      上下文.notify(`已插入${类型}，数据为 ${示例图表数据.类别.join('、')} 的示例值`)
    })
    if (!上下文.确认仅供网页或Pdf) 报告文件错误(上下文, '图表暂不可用', '当前环境无法确认仅用于网页或 PDF，文档内容未修改。')
  }),
  生成回调命令('formula.insert', '公式', (上下文, 参数) => {
    const 键 = 参数 ?? 公式模板列表[0].键
    const html = 生成公式Html(键)
    if (html.length === 0) {
      上下文.notify('请选择公式模板')
      return
    }
    上下文.确认仅供网页或Pdf?.('公式', () => {
      上下文.插入内容(html)
      上下文.notify(`已插入「${键}」公式，可直接修改其中的占位内容`)
    })
    if (!上下文.确认仅供网页或Pdf) 报告文件错误(上下文, '公式暂不可用', '当前环境无法确认仅用于网页或 PDF，文档内容未修改。')
  }),
  生成回调命令('smartart.insert', 'SmartArt', (上下文, 参数) => {
    const 类型 = (参数 ?? '流程') as SmartArt类型
    const html = 生成SmartArtHtml(类型, 示例SmartArt节点)
    if (html.length === 0) {
      上下文.notify('SmartArt 节点为空，无法生成图形')
      return
    }
    上下文.确认仅供网页或Pdf?.('智能图形', () => {
      上下文.插入内容(html)
      上下文.notify(`已插入${类型}智能图形`)
    })
    if (!上下文.确认仅供网页或Pdf) 报告文件错误(上下文, '智能图形暂不可用', '当前环境无法确认仅用于网页或 PDF，文档内容未修改。')
  }),
  生成回调命令('table.draw', '绘制表格', (上下文) => 上下文.打开表格网格()),
]

/** 页面布局命令 */
const 布局命令: EditorCommand[] = [
  ...(
    [
      ['layout.margin', '页边距', '页边距'],
      ['layout.orientation', '纸张方向', '纸张方向'],
      ['layout.paperSize', '纸张大小', '纸张'],
      ['layout.columns', '分栏', '分栏'],
      ['layout.pageBorder', '页面边框', '页面边框'],
      ['layout.pageColor', '页面颜色', '页面颜色'],
    ] as Array<[string, string, keyof ViewState]>
  ).map(([id, label, 字段]) =>
    生成回调命令(id, label, (上下文, 参数) => {
      if (参数 === undefined || 参数.length === 0) {
        上下文.notify(`请先选择${label}`)
        return
      }
      上下文.setView({ [字段]: 参数 } as Partial<ViewState>)
      上下文.refresh()
    })
  ),
  生成回调命令('layout.watermark', '水印', (上下文, 参数) => {
    if (参数 === '无') {
      上下文.setView({ 水印: '无' })
      上下文.refresh()
      return
    }
    上下文.显示文件错误?.('水印暂不可用', '当前版本不能把文字水印可靠写入 DOCX 文件，已保持原页面设置。')
  }),
  // 行号依赖分页排版引擎，暂以提示告知进度，避免写入 ViewState 不存在的键
  生成回调命令('layout.lineNumbers', '行号', (上下文) => {
    上下文.notify('行号功能将在后续版本提供')
  }),
  生成回调命令('layout.break', '分隔符', (上下文) => 上下文.插入资源('分页符')),
  生成回调命令('layout.dropCap', '首字下沉', (上下文) => {
    const 已启用 = 上下文.读取内容().includes('wps-drop-cap')
    上下文.切换段落类名('wps-drop-cap')
    上下文.notify(已启用 ? '已取消首字下沉' : '已对当前段落应用首字下沉')
  }),
  生成回调命令('layout.textDirection', '文字方向', (上下文, 参数) => {
    const 目标 = 参数 === '竖排' ? '竖排' : '横排'
    上下文.setView({ 文字方向: 目标 })
    上下文.refresh()
  }),
]

/** 引用命令：目录基于文档中的标题层级生成 */
const 引用命令: EditorCommand[] = [
  生成回调命令('toc.insert', '目录', (上下文) => {
    const 大纲 = 提取大纲(上下文.读取内容())
    if (大纲.length === 0) {
      上下文.notify('文档中未找到标题，请先对段落应用标题样式')
      return
    }
    上下文.插入内容(`${生成目录Html(大纲)}<p><br></p>`)
    上下文.notify(`已插入目录，共 ${大纲.length} 项`)
  }),
  生成回调命令('toc.update', '更新目录', (上下文) => {
    const 原文 = 上下文.读取内容()
    const 大纲 = 提取大纲(原文)
    if (大纲.length === 0) {
      上下文.notify('文档中未找到标题，无法生成目录')
      return
    }
    const 目录区块 = /<div class="wps-toc"[\s\S]*?<\/div>/
    if (!目录区块.test(原文)) {
      上下文.notify('文档中尚无目录，请先插入目录')
      return
    }
    上下文.history.record({ html: 原文, selection: null })
    上下文.应用内容(原文.replace(目录区块, 生成目录Html(大纲)), null)
    上下文.notify(`目录已更新，共 ${大纲.length} 项`)
    上下文.refresh()
  }),
  生成回调命令('caption.insert', '插入题注', (上下文, 参数) => {
    const 类型: 编号类型 = 参数 === '图' ? '图' : '表'
    const 序号 = 统计题注(上下文.读取内容(), 类型) + 1
    // 追加空段落，避免连续插入的题注被并入同一段落
    上下文.插入内容(`${生成题注(类型, 序号)}<p><br></p>`)
    上下文.notify(`已插入「${类型} ${序号}」，可在其后补充说明文字`)
  }),
  生成回调命令('caption.tableOfFigures', '插入表目录', (上下文) => {
    const 条目 = 提取题注(上下文.读取内容())
    if (条目.length === 0) {
      上下文.notify('文档中尚无题注，请先插入题注')
      return
    }
    上下文.插入内容(`${生成图表目录Html(条目)}<p><br></p>`)
    上下文.notify(`已插入图表目录，共 ${条目.length} 项`)
  }),
  生成回调命令('crossref.insert', '交叉引用', (上下文, 参数) => {
    const 类型: 编号类型 = 参数 === '图' ? '图' : '表'
    const 条目 = 提取题注(上下文.读取内容()).filter((项) => 项.类型 === 类型)
    if (条目.length === 0) {
      上下文.notify(`文档中尚无${类型}题注，无法插入引用`)
      return
    }
    const 目标 = 条目[条目.length - 1]
    上下文.插入内容(`<span class="wps-crossref">（见${目标.文本}）</span>`)
    上下文.notify(`已插入对「${目标.文本}」的引用`)
  }),
  生成回调命令('field.insert', '文档部件', (上下文, 参数) => {
    const 现在 = new Date()
    const 日期文本 = `${现在.getFullYear()} 年 ${现在.getMonth() + 1} 月 ${现在.getDate()} 日`
    const 部件表: Record<string, string> = {
      日期: 日期文本,
      文件名: 上下文.当前文档名,
      标题: '文档标题',
    }
    const 文本 = 部件表[参数 ?? '日期'] ?? 日期文本
    上下文.插入内容(`<span class="wps-field">${文本}</span>`)
    上下文.notify(`已插入文档部件「${参数 ?? '日期'}」`)
  }),
  生成回调命令('citation.insert', '插入引文', (上下文) => {
    if (上下文.文献列表.length === 0) {
      上下文.notify('尚未添加文献，请先在「管理源」中录入')
      return
    }
    const 序号 = 提取引文序号(上下文.读取内容()).length + 1
    上下文.插入内容(生成引文标记(序号))
    上下文.notify(`已插入引文 [${序号}]`)
  }),
  生成回调命令('citation.manageSource', '管理源', (上下文) => 上下文.打开文献管理()),
  生成回调命令('bibliography.insert', '书目', (上下文) => {
    if (上下文.文献列表.length === 0) {
      上下文.notify('尚未添加文献，请先在「管理源」中录入')
      return
    }
    上下文.插入内容(`${生成书目Html(上下文.文献列表)}<p><br></p>`)
    上下文.notify(`已插入参考文献列表，共 ${上下文.文献列表.length} 条`)
  }),
]

/** 审阅命令 */
const 审阅命令: EditorCommand[] = [
  生成回调命令('spell.check', '拼写检查', (上下文) => 上下文.检查拼写()),
  生成回调命令('lang.convert', '简繁转换', (上下文, 参数) => {
    const 方向 = 参数 === '繁转简' ? '简' : '繁'
    const 原文 = 上下文.读取内容()
    const 结果 = 转换简繁带统计(原文, 方向)
    if (结果.转换数 === 0) {
      上下文.notify(方向 === '繁' ? '未发现可转换为繁体的字符' : '未发现可转换为简体的字符')
      return
    }
    上下文.history.record({ html: 原文, selection: null })
    上下文.应用内容(结果.文本, null)
    上下文.notify(`已转换 ${结果.转换数} 个字符`)
    上下文.refresh()
  }),
  生成回调命令('word.count', '字数统计', (上下文) => {
    const 统计 = countWords(上下文.读取内容().replace(/<[^>]+>/g, ''))
    上下文.notify(`字数：${统计.词数}，字符数：${统计.字符数}，段落数：${统计.段落数}`)
  }),
  生成回调命令('comment.new', '新建批注', (上下文) => {
    const 编号 = 提取批注(上下文.读取内容()).length + 1
    上下文.插入内容(生成批注(编号, '请补充批注内容'))
    上下文.notify(`已插入批注 ${编号}，可点击标记查看内容`)
  }),
  生成回调命令('comment.delete', '删除批注', (上下文) => {
    const 已有 = 提取批注(上下文.读取内容())
    if (已有.length === 0) {
      上下文.notify('文档中没有批注')
      return
    }
    const 原文 = 上下文.读取内容()
    let 文本 = 原文
    let 计数 = 0
    已有.forEach((项) => {
      const 结果 = 删除批注(文本, 项.编号)
      文本 = 结果.文本
      计数 += 结果.删除数
    })
    上下文.history.record({ html: 原文, selection: null })
    上下文.应用内容(文本, null)
    上下文.notify(`已删除全部批注，共 ${计数} 处`)
    上下文.refresh()
  }),
  生成回调命令('comment.show', '显示批注', (上下文) => {
    const 目标 = !上下文.view.显示批注
    上下文.setView({ 显示批注: 目标 })
    上下文.notify(目标 ? '已显示批注标记' : '已隐藏批注标记')
    上下文.refresh()
  }),
  生成回调命令('track.enable', '修订', (上下文) => {
    const 目标 = !上下文.view.修订模式
    上下文.setView({ 修订模式: 目标 })
    上下文.notify(目标 ? '已开启修订模式，此后插入的内容会带修订标记' : '已关闭修订模式')
    上下文.refresh()
  }),
  生成回调命令('track.accept', '接受修订', (上下文) => {
    const 原文 = 上下文.读取内容()
    if (统计修订(原文).插入数 + 统计修订(原文).删除数 === 0) {
      上下文.notify('文档中没有待处理的修订')
      return
    }
    const 结果 = 接受修订(原文)
    上下文.history.record({ html: 原文, selection: null })
    上下文.应用内容(结果.文本, null)
    上下文.notify(`已接受 ${结果.修订数} 处修订`)
    上下文.refresh()
  }),
  生成回调命令('track.reject', '拒绝修订', (上下文) => {
    const 原文 = 上下文.读取内容()
    if (统计修订(原文).插入数 + 统计修订(原文).删除数 === 0) {
      上下文.notify('文档中没有待处理的修订')
      return
    }
    const 结果 = 拒绝修订(原文)
    上下文.history.record({ html: 原文, selection: null })
    上下文.应用内容(结果.文本, null)
    上下文.notify(`已拒绝 ${结果.修订数} 处修订`)
    上下文.refresh()
  }),
  生成回调命令('protect.start', '保护文档', (上下文) => {
    const 目标 = !上下文.view.文档保护
    上下文.setView({ 文档保护: 目标 })
    上下文.notify(目标 ? '已开启文档保护，编辑区转为只读' : '已解除文档保护，恢复可编辑')
    上下文.refresh()
  }),
  生成回调命令('compare.start', '比较', (上下文) => 上下文.打开比较面板()),
  生成回调命令('merge.start', '合并', (上下文) => 上下文.打开比较面板()),
  /** 文字翻译：打开翻译面板，由容器负责具体调用链 */
  生成回调命令('translate.start', '翻译', (上下文) => 上下文.打开翻译面板()),
  生成回调命令('mailmerge.start', '邮件合并', (上下文) => 上下文.打开邮件合并面板()),
]

/** 视图命令 */
const 视图命令: EditorCommand[] = [
  ...(
    [
      ['view.page', '页面视图', '页面视图'],
      ['view.read', '阅读版式', '阅读版式'],
      ['view.web', 'Web 版式', 'Web 版式'],
      ['view.outline', '大纲视图', '大纲视图'],
      ['view.draft', '草稿', '草稿'],
    ] as Array<[string, string, ViewState['视图模式']]>
  ).map(([id, label, 模式]) =>
    生成回调命令(id, label, (上下文) => {
      上下文.setView({ 视图模式: 模式 })
      上下文.refresh()
    })
  ),
  ...(
    [
      ['view.ruler', '标尺', '标尺'],
      ['view.gridlines', '网格线', '网格线'],
      ['view.paragraphMark', '显示段落标记', '段落标记'],
    ] as Array<[string, string, '标尺' | '网格线' | '段落标记']>
  ).map(([id, label, 字段]) =>
    生成回调命令(id, label, (上下文) => {
      上下文.setView({ [字段]: !上下文.view[字段] } as Partial<ViewState>)
      上下文.refresh()
    })
  ),
  生成回调命令('view.navigation', '导航窗格', (上下文) => 上下文.切换导航窗格()),
  生成回调命令('view.zoomIn', '放大', (上下文) => {
    上下文.setView({ 缩放: 放大一档(上下文.view.缩放) ?? 上下文.view.缩放 })
    上下文.refresh()
  }),
  生成回调命令('view.zoomOut', '缩小', (上下文) => {
    上下文.setView({ 缩放: 缩小一档(上下文.view.缩放) ?? 上下文.view.缩放 })
    上下文.refresh()
  }),
  生成回调命令('view.zoomReset', '100%', (上下文) => {
    上下文.setView({ 缩放: 1 })
    上下文.refresh()
  }),
  生成回调命令('view.zoomFitWidth', '适应页宽', (上下文) => {
    const 容器=上下文.root.closest('.wps-editor-canvas'),纸张=容器?.querySelector<HTMLElement>('.wps-editor-canvas__paper')
    const 比例=容器?.clientWidth&&纸张?.offsetWidth?(容器.clientWidth-48)/纸张.offsetWidth:1
    上下文.setView({ 缩放: Math.min(64,Math.max(0.0833,比例)) })
    上下文.refresh()
  }),
]

function 是同一路径(左: string, 右: string): boolean {
  return 左.replace(/\\/g, '/').toLowerCase() === 右.replace(/\\/g, '/').toLowerCase()
}

function 报告文件错误(上下文: CommandContext, 标题: string, 原因: string): void {
  if (上下文.显示文件错误) 上下文.显示文件错误(标题, 原因)
  else 上下文.notify(`${标题}：${原因}`)
}

function 预期文件指纹(上下文: CommandContext, 保存路径: string): string | undefined {
  return 上下文.当前文档路径 && 是同一路径(上下文.当前文档路径, 保存路径)
    ? 上下文.当前文件指纹 : undefined
}

const 文字保存扩展 = new Set(['.docx', '.txt', '.md', '.json', '.html', '.htm', '.pdf'])

function 保存文本文件(上下文: CommandContext, 保存路径: string, 扩展: string, 正文Html: string, 提示: string): Promise<void> {
  let 输出: string
  if (扩展 === '.html' || 扩展 === '.htm') {
    输出 = 导出为Html(基准文件名(保存路径).replace(/\.[^.]+$/, ''), 正文Html)
  } else {
    const 损失 = 纯文本损失项(正文Html)
    if (损失.length > 0) {
      报告文件错误(上下文, '保存失败', `纯文本格式无法保存${损失.join('、')}。请另存为 DOCX 或导出网页，原文件尚未修改。`)
      return Promise.resolve()
    }
    输出 = 保存为纯文本(正文Html)
    if (扩展 === '.json') {
      try { JSON.parse(输出) } catch {
        报告文件错误(上下文, '保存失败', 'JSON 内容格式无效，原文件尚未修改。请检查后再保存。')
        return Promise.resolve()
      }
    }
  }
  return 桥接.saveToFile(保存路径, 输出, '文本' as const, 预期文件指纹(上下文, 保存路径)).then((结果) => {
    if (结果.成功) {
      上下文.设置文档路径?.(保存路径, 正文Html, 结果.文件指纹)
      上下文.notify(提示)
    } else {
      报告文件错误(上下文, '保存失败', 结果.错误 || '未知错误')
    }
  })
}

async function 完成Pdf导出(上下文: CommandContext, 路径: string): Promise<void> {
  if (!上下文.打开新文档) {
    上下文.notify(`PDF 已保存到：${路径}`)
    return
  }
  try {
    const 文件 = await 读取本地文件内容(路径)
    if (文件.类型 !== 'pdf' || !文件.内容) throw new Error('导出的 PDF 无法重新读取')
    上下文.打开新文档('pdf', 文件.内容, 路径)
    const 已记录 = await 记录最近文档(路径, 基准文件名(路径), 'pdf')
    if (已记录) 上下文.notify('PDF 已保存并打开')
  } catch (错误) {
    报告文件错误(上下文, 'PDF 已导出但无法打开', 错误 instanceof Error ? `${错误.message}。文件位置：${路径}` : `文件位置：${路径}`)
  }
}

/** 导出命令 */
const 导出命令: EditorCommand[] = [
  // 打开命令
  生成回调命令('file.open', '打开文件', (上下文) => {
    if (!桥接.可用) {
      上下文.notify('当前环境不支持打开文件功能，请使用打包后的版本')
      return
    }
    if (!上下文.打开新文档) {
      上下文.显示文件错误?.('打开文件失败', '无法创建新文档标签，当前文档未被修改')
      return
    }
    void 桥接.showOpenDialog().then(async (文件路径) => {
      if (!文件路径) return
      const 内容 = await 读取本地文件内容(文件路径)
      const 初始内容 = 内容.类型 === 'ppt' ? 内容.演示文稿 : 内容.类型 === 'table' ? (内容.工作表列表 ?? 内容.内容) : 内容.内容
      if (内容.文件指纹) 上下文.打开新文档?.(内容.类型, 初始内容, 文件路径, 内容.警告, 内容.页面设置, 内容.文件指纹)
      else 上下文.打开新文档?.(内容.类型, 初始内容, 文件路径, 内容.警告, 内容.页面设置)
      await 记录最近文档(文件路径, 基准文件名(文件路径), 内容.类型)
    }).catch((错误: unknown) => {
      const 文案 = 错误 instanceof Error ? 错误.message : '未知错误'
      if (上下文.显示文件错误) 上下文.显示文件错误('打开文件失败', 文案)
      else 上下文.notify(`打开文件失败：${文案}`)
    })
  }),
  
  生成回调命令('file.exportHtml', '导出为网页', (上下文) => 上下文.导出('html')),
  生成回调命令('file.exportText', '导出为文本', (上下文) => 上下文.导出('text')),
  
  // 保存命令
  生成回调命令('file.save', '保存', (上下文) => {
    if (桥接.可用) {
      if (上下文.保真风险 && 上下文.当前文档路径 && 是同一路径(上下文.当前文档路径, 上下文.保真风险.来源路径)) {
        上下文.提示保真风险?.(上下文.保真风险.警告)
        return
      }
      const 文档名: string = 上下文.当前文档名
      const 选择路径 = 上下文.当前文档路径 ?? 桥接.showSaveDialog(文档名, 'word' as const)
      Promise.resolve(选择路径).then((文件路径) => {
        if (文件路径) {
          const 内容 = 上下文.准备保存内容 ? 上下文.准备保存内容() : 上下文.读取内容()
          const 点索引 = 文件路径.lastIndexOf('.')
          let 扩展 = 点索引 >= 0 ? 文件路径.slice(点索引).toLowerCase() : ''
          // 文字文档的保存类型就是 docx：未带扩展名时补 .docx，不再落文本分支
          let 保存路径 = 文件路径
          if (扩展 === '') {
            保存路径 = `${文件路径}.docx`
            扩展 = '.docx'
          }
          if (!文字保存扩展.has(扩展)) {
            报告文件错误(上下文, '保存失败', '文字文档无法保存为该文件格式。请使用 DOCX、纯文本、网页或 PDF 格式。')
            return
          }
          if (上下文.保真风险 && 是同一路径(保存路径, 上下文.保真风险.来源路径)) {
            上下文.提示保真风险?.(上下文.保真风险.警告)
            return
          }
          if (上下文.检查保存路径 && !上下文.检查保存路径(保存路径)) return
          const 保存文本 = () => 保存文本文件(上下文, 保存路径, 扩展, 内容, '文件已保存')

          if (扩展 === '.docx') {
            // HTML 转 docx 模型并写入二进制文件
            const 页面设置快照 = 从视图提取页面设置(上下文.view)
            const 模型 = htmlToDocxModel(内容, 页面设置快照)
            if (模型.未覆盖.length > 0) {
              报告文件错误(上下文, '保存失败', `当前文档包含尚无法写入 DOCX 的内容：${模型.未覆盖.join('、')}。请先移除这些对象，或导出为网页保留当前显示内容。`)
              return
            }
            桥接.office.writeDocx(模型).then((结果: any) => {
              if (结果 && 结果.成功 && 结果.数据) {
                const 二进制数据 = Uint8Array.from(atob(结果.数据), (c) => c.charCodeAt(0))
                return 桥接.saveToFile(保存路径, 二进制数据, '二进制' as const, 预期文件指纹(上下文, 保存路径)).then((保存结果) => {
                  if (保存结果.成功) {
                    上下文.设置文档路径?.(保存路径, 内容, 保存结果.文件指纹, 页面设置快照)
                    上下文.notify('文件已保存')
                  } else {
                    报告文件错误(上下文, '保存失败', 保存结果.错误 || '未知错误')
                  }
                })
              }
              报告文件错误(上下文, '保存失败', 结果?.错误 || '文档格式转换失败，请检查内容后重试')
              return Promise.resolve()
            }).catch((error: any) => {
              报告文件错误(上下文, '保存失败', error?.message || '未知错误')
            })
          } else if (扩展 === '.pdf') {
            // PDF 必须走真实导出链路；按文本写盘会产出扩展名为 .pdf 的损坏文件
            桥接.pdf.exportToPath(内容, 保存路径).then((结果: any) => {
              if (结果 && 结果.成功) {
                return 完成Pdf导出(上下文, 保存路径)
              } else if (结果 && 结果.已取消) {
                // 用户取消导出，不作提示
              } else {
                报告文件错误(上下文, '保存失败', 结果?.错误 || '未知错误')
              }
            }).catch((error: any) => {
              报告文件错误(上下文, '保存失败', error?.message || '未知错误')
            })
          } else {
            // 其他格式：保存为文本
            return 保存文本()
          }
        }
      }).catch((error: any) => {
        报告文件错误(上下文, '保存失败', error?.message || '未知错误')
      })
    } else {
      上下文.notify('当前环境不支持保存功能，请使用打包后的版本')
    }
  }),
  
  // 另存为命令
  生成回调命令('file.saveAs', '另存为', (上下文) => {
    if (桥接.可用) {
      桥接.showSaveDialog(上下文.当前文档名, 'word' as const).then(async (文件路径) => {
        if (文件路径) {
          const 内容 = 上下文.准备保存内容 ? 上下文.准备保存内容() : 上下文.读取内容()
          const 点索引 = 文件路径.lastIndexOf('.')
          let 扩展 = 点索引 >= 0 ? 文件路径.slice(点索引).toLowerCase() : ''
          // 文字文档的另存为类型就是 docx：未带扩展名时补 .docx
          let 保存路径 = 文件路径
          if (扩展 === '') {
            保存路径 = `${文件路径}.docx`
            扩展 = '.docx'
          }
          if (!文字保存扩展.has(扩展)) {
            报告文件错误(上下文, '保存失败', '文字文档无法另存为该文件格式。请使用 DOCX、纯文本、网页或 PDF 格式。')
            return
          }
          if (上下文.保真风险) {
            if (是同一路径(保存路径, 上下文.保真风险.来源路径)) {
              上下文.提示保真风险?.(上下文.保真风险.警告)
              return
            }
            if (!上下文.确认保真另存 || !await 上下文.确认保真另存(上下文.保真风险.警告)) return
          }
          if (上下文.检查保存路径 && !上下文.检查保存路径(保存路径)) return
          const 保存文本 = () => 保存文本文件(上下文, 保存路径, 扩展, 内容, '文件已另存为')

          if (扩展 === '.docx') {
            const 页面设置快照 = 从视图提取页面设置(上下文.view)
            const 模型 = htmlToDocxModel(内容, 页面设置快照)
            if (模型.未覆盖.length > 0) {
              报告文件错误(上下文, '保存失败', `当前文档包含尚无法写入 DOCX 的内容：${模型.未覆盖.join('、')}。请先移除这些对象，或导出为网页保留当前显示内容。`)
              return
            }
            桥接.office.writeDocx(模型).then((结果: any) => {
              if (结果 && 结果.成功 && 结果.数据) {
                const 二进制数据 = Uint8Array.from(atob(结果.数据), (c) => c.charCodeAt(0))
                return 桥接.saveToFile(保存路径, 二进制数据, '二进制' as const, 预期文件指纹(上下文, 保存路径)).then((保存结果) => {
                  if (保存结果.成功) {
                    上下文.设置文档路径?.(保存路径, 内容, 保存结果.文件指纹, 页面设置快照)
                    上下文.notify('文件已另存为')
                  } else {
                    报告文件错误(上下文, '保存失败', 保存结果.错误 || '未知错误')
                  }
                })
              }
              报告文件错误(上下文, '保存失败', 结果?.错误 || '文档格式转换失败，请检查内容后重试')
              return Promise.resolve()
            }).catch((error: any) => {
              报告文件错误(上下文, '保存失败', error?.message || '未知错误')
            })
          } else if (扩展 === '.pdf') {
            // PDF 必须走真实导出链路；按文本写盘会产出扩展名为 .pdf 的损坏文件
            桥接.pdf.exportToPath(内容, 保存路径).then((结果: any) => {
              if (结果 && 结果.成功) {
                return 完成Pdf导出(上下文, 保存路径)
              } else if (结果 && 结果.已取消) {
                // 用户取消导出，不作提示
              } else {
                报告文件错误(上下文, '保存失败', 结果?.错误 || '未知错误')
              }
            }).catch((error: any) => {
              报告文件错误(上下文, '保存失败', error?.message || '未知错误')
            })
          } else {
            return 保存文本()
          }
        }
      }).catch((error: any) => {
        报告文件错误(上下文, '保存失败', error?.message || '未知错误')
      })
    } else {
      上下文.notify('当前环境不支持保存功能，请使用打包后的版本')
    }
  }),
  
  // PDF 导出命令
  生成回调命令('file.exportPdf', '导出为PDF', (上下文) => {
    if (桥接.可用) {
      const 文档名 = 上下文.当前文档名
      const html = 上下文.读取内容()
      桥接.exportToPdf(html, 文档名).then((结果) => {
        if (结果.成功 && '路径' in 结果 && typeof 结果.路径 === 'string' && 结果.路径.length > 0) {
          return 完成Pdf导出(上下文, 结果.路径)
        } else if ('已取消' in 结果 && 结果.已取消) {
          return
        } else {
          报告文件错误(上下文, 'PDF 导出失败', 结果.错误 || '导出后未返回文件路径')
        }
      }).catch((error: any) => {
        报告文件错误(上下文, 'PDF 导出失败', error?.message || '未知错误')
      })
    } else {
      上下文.notify('当前环境不支持 PDF 导出功能，请使用打包后的版本')
    }
  }),
]

/** 全部命令的合并结果 */
export const 命令表 = [
  ...格式化命令定义.map(([id, label, 指令]) => 生成格式化命令(id, label, 指令)),
  ...字体命令,
  ...段落命令,
  ...编辑命令,
  ...插入命令,
  ...布局命令,
  ...引用命令,
  ...审阅命令,
  ...视图命令,
  ...导出命令,
  ...未实现命令定义.map(([id, label]) => 未实现命令(id, label)),
].reduce<Record<string, EditorCommand>>((累计, 命令) => {
  累计[命令.id] = 命令
  return 累计
}, {})

export const 命令标识列表: string[] = Object.keys(命令表)

export function 查找命令(id: string): EditorCommand | undefined {
  return 命令表[id]
}

// ==================== HTML 到 Office 文档模型转换 ====================

/**
 * 将一个 HTML 字符串转换为 docx 模型。
 * 统一委托给 office/docModel 的解析器（内联样式、<font> 标签、标题、列表、
 * 表格、对齐、颜色、字号、字体的完整解析都在那里实现），
 * 避免此处再维护一份丢失样式的重复实现——此前正是这份重复实现导致保存后格式全丢。
 */
function 从视图提取页面设置(视图: ViewState): 文字页面设置 {
  return {
    纸张: 视图.纸张, 纸张方向: 视图.纸张方向, 页边距: 视图.页边距,
    分栏: 视图.分栏, 水印: 视图.水印, 页面边框: 视图.页面边框,
    页面颜色: 视图.页面颜色, 文字方向: 视图.文字方向,
    ...(视图.原始纸张 ? { 原始纸张: 视图.原始纸张 } : {}),
    ...(视图.原始页边距 ? { 原始页边距: 视图.原始页边距 } : {}),
    ...(视图.页眉Html ? { 页眉Html: 视图.页眉Html } : {}),
    ...(视图.页脚Html ? { 页脚Html: 视图.页脚Html } : {}),
  }
}

export function htmlToDocxModel(html: string, 页面设置?: 文字页面设置): 文档模型 {
  const 模型 = 解析文档(html, '正文', 页面设置)
  for (const [键, 内容] of [['页眉', 页面设置?.页眉Html], ['页脚', 页面设置?.页脚Html]] as const) {
    if (!内容) continue
    const 部分 = 解析文档(内容, 键, 页面设置)
    模型.未覆盖.push(...部分.未覆盖.map((项) => `${键}中的${项}`))
    模型[键] = 部分.段落
  }
  return { ...模型, ...(页面设置 ? { 页面设置 } : {}) }
}

