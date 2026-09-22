// Ribbon 六个标签的功能声明：只描述有哪些组、哪些按钮、绑定哪条命令。
// 全部行为位于 commands.ts，此处不含任何逻辑处理。
import {
  分栏列表,
  突出显示颜色,
  字体列表,
  字体颜色,
  字号列表,
  页面边框列表,
  页边距列表,
  纸张列表,
  行距列表,
  水印列表,
} from '../fontOptions'

export type RibbonItemKind = 'large' | 'small' | 'dropdown'

export interface RibbonItemSpec {
  kind: RibbonItemKind
  commandId: string
  label: string
  icon: string
  /** 下拉按钮的可选值，支持字符串或键值对 */
  options?: Array<string | { label: string; value: string }>
  /** 下拉按钮的默认展示值 */
  currentValue?: string
  /** 点击时固定传入的参数，例如颜色值 */
  固定参数?: string
}

export interface RibbonGroupSpec {
  name: string
  items: RibbonItemSpec[]
}

export interface RibbonTabSpec {
  key: string
  label: string
  groups: RibbonGroupSpec[]
}

const 大 = (commandId: string, label: string, icon: string): RibbonItemSpec => ({
  kind: 'large',
  commandId,
  label,
  icon,
})

const 小 = (commandId: string, label: string, icon: string): RibbonItemSpec => ({
  kind: 'small',
  commandId,
  label,
  icon,
})

const 下拉 = (
  commandId: string,
  label: string,
  icon: string,
  options: Array<string | { label: string; value: string }>,
  currentValue?: string
): RibbonItemSpec => ({ kind: 'dropdown', commandId, label, icon, options, currentValue })

const 色板 = (列表: Array<{ 名称: string; 值: string }>) =>
  列表.map((项) => ({ label: 项.名称, value: 项.值 }))

const 开始标签: RibbonTabSpec = {
  key: 'start',
  label: '开始',
  groups: [
    {
      name: '剪贴板',
      items: [
        大('clipboard.paste', '粘贴', 'paste'),
        小('clipboard.cut', '剪切', 'cut'),
        小('clipboard.copy', '复制', 'copy'),
        小('clipboard.formatPainter', '格式刷', 'format-painter'),
      ],
    },
    {
      name: '字体',
      items: [
        下拉('font.name', '字体', 'doc-word', 字体列表, '宋体'),
        下拉('font.size', '字号', 'textbox', 字号列表, '五号'),
        小('font.grow', '增大字号', 'plus'),
        小('font.shrink', '减小字号', 'zoom-out'),
        小('font.bold', '加粗', 'bold'),
        小('font.italic', '斜体', 'italic'),
        小('font.underline', '下划线', 'underline'),
        小('font.strike', '删除线', 'strikethrough'),
        小('font.subscript', '下标', 'subscript'),
        小('font.superscript', '上标', 'superscript'),
        下拉('font.color', '字体颜色', 'language', 色板(字体颜色), '黑色'),
        下拉('font.highlight', '突出显示', 'shading', 色板(突出显示颜色), '无'),
        小('font.clear', '清除格式', 'retry'),
      ],
    },
    {
      name: '段落',
      items: [
        下拉('para.bullet', '项目符号', 'bullet-list', ['圆点', '方块', '空心圆'], '圆点'),
        下拉('para.number', '编号', 'numbered-list', ['阿拉伯数字', '中文数字', '字母'], '阿拉伯数字'),
        小('para.indentDecrease', '减少缩进', 'indent-decrease'),
        小('para.indentIncrease', '增加缩进', 'indent-increase'),
        小('para.alignLeft', '左对齐', 'align-left'),
        小('para.alignCenter', '居中', 'align-center'),
        小('para.alignRight', '右对齐', 'align-right'),
        小('para.alignJustify', '两端对齐', 'align-justify'),
        下拉('para.lineSpacing', '行距', 'line-spacing', 行距列表, '1.5'),
        小('para.shading', '段落底纹', 'shading'),
      ],
    },
    {
      name: '样式',
      items: [
        大('style.body', '正文', 'doc-empty'),
        大('style.heading1', '标题 1', 'doc-word'),
        大('style.heading2', '标题 2', 'doc-word'),
        大('style.heading3', '标题 3', 'doc-word'),
      ],
    },
    {
      name: '编辑',
      items: [
        大('edit.find', '查找', 'find-text'),
        大('edit.replace', '替换', 'replace-text'),
        小('edit.selectAll', '全选', 'grid'),
        小('edit.undo', '撤销', 'undo'),
        小('edit.redo', '重做', 'redo'),
      ],
    },
  ],
}

const 插入标签: RibbonTabSpec = {
  key: 'insert',
  label: '插入',
  groups: [
    {
      name: '页面',
      items: [
        大('page.cover', '封面', 'doc-empty'),
        大('page.blank', '空白页', 'page-break'),
        大('page.break', '分页符', 'page-break'),
      ],
    },
    {
      name: '表格',
      items: [大('table.insert', '表格', 'table'), 大('table.draw', '绘制表格', 'gridlines')],
    },
    {
      name: '插图',
      items: [
        大('image.insert', '图片', 'image'),
        大('shape.insert', '形状', 'shape'),
        下拉('chart.insert', '图表', 'chart', ['柱形图', '折线图', '饼图'], '柱形图'),
        下拉('smartart.insert', 'SmartArt', 'flow', ['流程', '层级', '循环'], '流程'),
        大('textbox.insert', '文本框', 'textbox'),
      ],
    },
    {
      name: '页眉页脚',
      items: [
        大('header.edit', '页眉', 'header'),
        大('footer.edit', '页脚', 'footer'),
        大('pagenumber.insert', '页码', 'page-number'),
      ],
    },
    {
      name: '文本',
      items: [
        大('wordart.insert', '艺术字', 'wordart'),
        下拉(
          'formula.insert',
          '公式',
          'formula',
          [
            { label: '分数', value: '分数' },
            { label: '平方根', value: '平方根' },
            { label: '求和', value: '求和' },
            { label: '积分', value: '积分' },
            { label: '上标', value: '上标' },
            { label: '下标', value: '下标' },
          ],
          '公式'
        ),
        大('datetime.insert', '日期时间', 'calendar'),
        大('symbol.insert', '符号', 'symbol'),
        大('footnote.insert', '脚注', 'footnote'),
        大('endnote.insert', '尾注', 'endnote'),
      ],
    },
    {
      name: '链接',
      items: [
        大('link.insert', '超链接', 'link'),
        大('bookmark.insert', '书签', 'bookmark'),
        大('crossref.insert', '交叉引用', 'crossref'),
      ],
    },
  ],
}

const 布局标签: RibbonTabSpec = {
  key: 'layout',
  label: '页面布局',
  groups: [
    {
      name: '页面设置',
      items: [
        下拉('layout.margin', '页边距', 'margin', 页边距列表, '常规'),
        下拉('layout.orientation', '纸张方向', 'orientation', ['纵向', '横向'], '纵向'),
        下拉('layout.paperSize', '纸张大小', 'paper-size', 纸张列表, 'A4'),
        下拉('layout.columns', '分栏', 'columns', 分栏列表, '一栏'),
        大('layout.break', '分隔符', 'page-break'),
        大('layout.lineNumbers', '行号', 'line-numbers'),
      ],
    },
    {
      name: '页面背景',
      items: [
        下拉('layout.watermark', '水印', 'watermark', 水印列表, '无'),
        下拉('layout.pageBorder', '页面边框', 'page-border', 页面边框列表, '无'),
        下拉('layout.pageColor', '页面颜色', 'page-color', 色板(突出显示颜色), '无'),
      ],
    },
    {
      name: '段落',
      items: [
        大('layout.dropCap', '首字下沉', 'paragraph-mark'),
        下拉('layout.textDirection', '文字方向', 'orientation', ['横排', '竖排'], '横排'),
      ],
    },
  ],
}

const 引用标签: RibbonTabSpec = {
  key: 'reference',
  label: '引用',
  groups: [
    {
      name: '目录',
      items: [大('toc.insert', '目录', 'toc'), 大('toc.update', '更新目录', 'retry')],
    },
    {
      name: '脚注',
      items: [大('footnote.insert', '插入脚注', 'footnote'), 大('endnote.insert', '插入尾注', 'endnote')],
    },
    {
      name: '题注',
      items: [
        下拉(
          'caption.insert',
          '插入题注',
          'caption',
          [
            { label: '插入表题注', value: '表' },
            { label: '插入图题注', value: '图' },
          ],
          '插入题注'
        ),
        大('caption.tableOfFigures', '插入表目录', 'toc'),
        下拉(
          'crossref.insert',
          '交叉引用',
          'crossref',
          [
            { label: '引用表题注', value: '表' },
            { label: '引用图题注', value: '图' },
          ],
          '交叉引用'
        ),
      ],
    },
    {
      name: '引文与书目',
      items: [
        大('citation.insert', '插入引文', 'comment'),
        大('citation.manageSource', '管理源', 'doc-empty'),
        大('bibliography.insert', '书目', 'toc'),
      ],
    },
  ],
}

const 审阅标签: RibbonTabSpec = {
  key: 'review',
  label: '审阅',
  groups: [
    {
      name: '校对',
      items: [大('spell.check', '拼写检查', 'spell-check'), 大('word.count', '字数统计', 'word-count')],
    },
    {
      name: '语言',
      items: [
        下拉(
          'lang.convert',
          '简繁转换',
          'language',
          [
            { label: '简体转繁体', value: '简转繁' },
            { label: '繁体转简体', value: '繁转简' },
          ],
          '简转繁'
        ),
        大('translate.start', '翻译', 'language'),
      ],
    },
    {
      name: '批注',
      items: [
        大('comment.new', '新建批注', 'comment'),
        大('comment.delete', '删除批注', 'comment'),
        大('comment.show', '显示批注', 'comment'),
      ],
    },
    {
      name: '修订',
      items: [
        大('track.enable', '修订', 'track'),
        大('track.accept', '接受修订', 'track'),
        大('track.reject', '拒绝修订', 'track'),
      ],
    },
    {
      name: '更改',
      items: [
        大('compare.start', '比较', 'compare'),
        大('merge.start', '合并', 'compare'),
        大('protect.start', '保护文档', 'settings'),
        下拉(
          'field.insert',
          '文档部件',
          'doc-empty',
          [
            { label: '插入日期', value: '日期' },
            { label: '插入文件名', value: '文件名' },
            { label: '插入标题', value: '标题' },
          ],
          '文档部件'
        ),
        大('mailmerge.start', '邮件合并', 'users'),
      ],
    },
  ],
}

const 视图标签: RibbonTabSpec = {
  key: 'view',
  label: '视图',
  groups: [
    {
      name: '视图',
      items: [
        大('view.page', '页面视图', 'page-view'),
        大('view.read', '阅读版式', 'read-view'),
        大('view.web', 'Web 版式', 'web-view'),
        大('view.outline', '大纲视图', 'outline-view'),
        大('view.draft', '草稿', 'draft-view'),
      ],
    },
    {
      name: '显示',
      items: [
        大('view.ruler', '标尺', 'ruler'),
        大('view.gridlines', '网格线', 'gridlines'),
        大('view.navigation', '导航窗格', 'navigation'),
        大('view.paragraphMark', '段落标记', 'paragraph-mark'),
      ],
    },
    {
      name: '显示比例',
      items: [
        大('view.zoomIn', '放大', 'zoom-in'),
        大('view.zoomOut', '缩小', 'zoom-out'),
        大('view.zoomReset', '100%', 'zoom-reset'),
        大('view.zoomFitWidth', '适应页宽', 'fit-width'),
      ],
    },
    {
      name: '导出',
      items: [
        大('file.exportHtml', '导出为网页', 'export-file'),
        大('file.exportText', '导出为文本', 'export-file'),
      ],
    },
  ],
}

export const RIBBON_TABS: RibbonTabSpec[] = [
  开始标签,
  插入标签,
  布局标签,
  引用标签,
  审阅标签,
  视图标签,
]
