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
import { 解析字号, 磅值到档位 } from './fontOptions'
import { 桥接 } from '../ipc/bridge'

export interface ViewState {
  缩放: number
  标尺: boolean
  网格线: boolean
  段落标记: boolean
  视图模式: '页面视图' | '阅读版式' | 'Web 版式' | '大纲视图' | '草稿'
  纸张: string
  页边距: string
  分栏: string
  水印: string
  页面边框: string
  页面颜色: string
  文字方向: '横排' | '竖排'
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
  /** 触发文件下载 */
  下载: (内容: string, 文件名: string, 类型: string) => void
  打开查找: () => void
  导出: (格式: 'html' | 'text') => void
  检查拼写: () => void
  切换全选: () => void
  /** 插入结构化资源 */
  插入资源: (类型: InsertableKind) => void
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
  设置文档路径?: (路径: string) => void
  /** 打开表格网格选择器 */
  打开表格网格: () => void
  /** 打开文献管理面板 */
  打开文献管理: () => void
  /** 打开文档比较面板 */
  打开比较面板: () => void
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

const 未实现命令定义: Array<[string, string]> = [
  ['translate.start', '翻译'],
  ['mailmerge.start', '邮件合并'],
]

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
    上下文.执行格式化('fontSize', 磅值到档位(解析字号(参数)))
    上下文.refresh()
  }),
  生成回调命令('font.grow', '增大字号', (上下文) => {
    const 当前档位 = Number.parseInt(上下文.查询格式('fontSize'), 10)
    const 基准 = Number.isFinite(当前档位) && 当前档位 > 0 ? 当前档位 : 3
    if (基准 >= 7) {
      上下文.notify('字号已达上限')
      return
    }
    上下文.history.record({ html: 上下文.读取内容(), selection: null })
    上下文.执行格式化('fontSize', String(基准 + 1))
    上下文.refresh()
  }),
  生成回调命令('font.shrink', '减小字号', (上下文) => {
    const 当前档位 = Number.parseInt(上下文.查询格式('fontSize'), 10)
    const 基准 = Number.isFinite(当前档位) && 当前档位 > 0 ? 当前档位 : 3
    if (基准 <= 1) {
      上下文.notify('字号已达下限')
      return
    }
    上下文.history.record({ html: 上下文.读取内容(), selection: null })
    上下文.执行格式化('fontSize', String(基准 - 1))
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
    上下文.插入内容(`<div class="wps-chart" contenteditable="false">${svg}</div><p><br></p>`)
    上下文.notify(
      `已插入${类型}，数据为 ${示例图表数据.类别.join('、')} 的示例值，可在文档中替换`
    )
  }),
  生成回调命令('formula.insert', '公式', (上下文, 参数) => {
    const 键 = 参数 ?? 公式模板列表[0].键
    const html = 生成公式Html(键)
    if (html.length === 0) {
      上下文.notify('请选择公式模板')
      return
    }
    上下文.插入内容(html)
    上下文.notify(`已插入「${键}」公式，可直接修改其中的占位内容`)
  }),
  生成回调命令('smartart.insert', 'SmartArt', (上下文, 参数) => {
    const 类型 = (参数 ?? '流程') as SmartArt类型
    const html = 生成SmartArtHtml(类型, 示例SmartArt节点)
    if (html.length === 0) {
      上下文.notify('SmartArt 节点为空，无法生成图形')
      return
    }
    上下文.插入内容(html)
    上下文.notify(`已插入${类型}SmartArt`)
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
      ['layout.watermark', '水印', '水印'],
      ['layout.pageBorder', '页面边框', '页面边框'],
      ['layout.pageColor', '页面颜色', '页面颜色'],
      ['layout.lineNumbers', '行号', '行号'],
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
  生成回调命令('view.navigation', '导航窗格', (上下文) => 上下文.notify('该功能开发中')),
  生成回调命令('view.zoomIn', '放大', (上下文) => {
    上下文.setView({ 缩放: Math.min(2, Number((上下文.view.缩放 + 0.1).toFixed(2))) })
    上下文.refresh()
  }),
  生成回调命令('view.zoomOut', '缩小', (上下文) => {
    上下文.setView({ 缩放: Math.max(0.5, Number((上下文.view.缩放 - 0.1).toFixed(2))) })
    上下文.refresh()
  }),
  生成回调命令('view.zoomReset', '100%', (上下文) => {
    上下文.setView({ 缩放: 1 })
    上下文.refresh()
  }),
  生成回调命令('view.zoomFitWidth', '适应页宽', (上下文) => {
    上下文.setView({ 缩放: 1 })
    上下文.refresh()
  }),
]

/** 导出命令 */
const 导出命令: EditorCommand[] = [
  // 打开命令
  生成回调命令('file.open', '打开文件', (上下文) => {
    if (桥接.可用) {
      桥接.showOpenDialog().then((文件路径) => {
        if (文件路径) {
          桥接.readFile(文件路径).then((结果) => {
            if (结果.成功) {
              上下文.history.record({ html: 上下文.读取内容(), selection: null })
              上下文.应用内容(结果.内容 ?? '', null)
              上下文.设置文档路径?.(文件路径)
              上下文.refresh()
              上下文.notify('文件已打开')
            } else {
              上下文.notify(`打开文件失败：${结果.错误}`)
            }
          }).catch((error: any) => {
            上下文.notify(`打开文件失败：${error?.message || '未知错误'}`)
          })
        }
      }).catch((error: any) => {
        上下文.notify(`打开文件失败：${error?.message || '未知错误'}`)
      })
    } else {
      上下文.notify('当前环境不支持打开文件功能，请使用打包后的版本')
    }
  }),
  
  生成回调命令('file.exportHtml', '导出为网页', (上下文) => 上下文.导出('html')),
  生成回调命令('file.exportText', '导出为文本', (上下文) => 上下文.导出('text')),
  
  // 保存命令
  生成回调命令('file.save', '保存', (上下文) => {
    if (桥接.可用) {
      const 文档名: string = 上下文.当前文档名
      const 选择路径 = 上下文.当前文档路径 ?? 桥接.showSaveDialog(文档名)
      Promise.resolve(选择路径).then((文件路径) => {
        if (文件路径) {
          const 内容 = 上下文.读取内容()
          桥接.saveToFile(文件路径, 内容, '文本').then((结果) => {
            if (结果.成功) {
              上下文.设置文档路径?.(文件路径)
              上下文.notify('文件已保存')
            } else {
              上下文.notify(`保存失败：${结果.错误}`)
            }
          }).catch((error: any) => {
            上下文.notify(`保存失败：${error?.message || '未知错误'}`)
          })
        }
      }).catch((error: any) => {
        上下文.notify(`保存失败：${error?.message || '未知错误'}`)
      })
    } else {
      上下文.notify('当前环境不支持保存功能，请使用打包后的版本')
    }
  }),
  
  // 另存为命令
  生成回调命令('file.saveAs', '另存为', (上下文) => {
    if (桥接.可用) {
      桥接.showSaveDialog(上下文.当前文档名).then((文件路径) => {
        if (文件路径) {
          const 内容 = 上下文.读取内容()
          桥接.saveToFile(文件路径, 内容, '文本').then((结果) => {
            if (结果.成功) {
              上下文.设置文档路径?.(文件路径)
              上下文.notify('文件已另存为')
            } else {
              上下文.notify(`保存失败：${结果.错误}`)
            }
          }).catch((error: any) => {
            上下文.notify(`保存失败：${error?.message || '未知错误'}`)
          })
        }
      }).catch((error: any) => {
        上下文.notify(`保存失败：${error?.message || '未知错误'}`)
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
        if (结果.成功) {
          上下文.notify(`PDF 已导出到：${'路径' in 结果 ? (结果.路径 ?? '指定位置') : '指定位置'}`)
        } else {
          上下文.notify(`PDF 导出失败：${结果.错误}`)
        }
      }).catch((error: any) => {
        上下文.notify(`PDF 导出失败：${error?.message || '未知错误'}`)
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
