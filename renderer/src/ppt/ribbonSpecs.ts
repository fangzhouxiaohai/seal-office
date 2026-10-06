// 演示文稿 Ribbon 八标签声明。
import type { RibbonTabSpec } from '../editor/ribbon/tabSpecs'

const 大 = (commandId: string, label: string, icon: string) => ({
  kind: 'large' as const,
  commandId,
  label,
  icon,
})

const 小 = (commandId: string, label: string, icon: string) => ({
  kind: 'small' as const,
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
) => ({ kind: 'dropdown' as const, commandId, label, icon, options, currentValue })

const 开始标签: RibbonTabSpec = {
  key: 'start',
  label: '开始',
  groups: [
    {
      name: '文件',
      items: [
        大('file.open', '打开', 'open'),
        大('file.save', '保存', 'save'),
        大('file.saveAs', '另存为', 'save-as'),
      ],
    },
    {
      name: '剪贴板',
      items: [大('clipboard.paste', '粘贴', 'paste'), 小('clipboard.copy', '复制', 'copy')],
    },
    {
      name: '撤销',
      items: [小('edit.undo', '撤销', 'undo'), 小('edit.redo', '重做', 'redo')],
    },
    {
      name: '幻灯片',
      items: [
        大('slide.new', '新建幻灯片', 'plus'),
        大('slide.duplicate', '复制幻灯片', 'copy'),
        大('slide.delete', '删除幻灯片', 'close'),
      ],
    },
    {
      name: '字体',
      items: [
        小('text.bold', '加粗', 'bold'),
        小('text.italic', '斜体', 'italic'),
        小('text.underline', '下划线', 'underline'),
        小('text.sizeUp', '增大字号', 'plus'),
        小('text.sizeDown', '减小字号', 'zoom-out'),
        下拉('text.color', '字体颜色', 'language', [
          { label: '自动颜色', value: 'automatic' },
          { label: '黑色', value: '#1A1D24' },
          { label: '白色', value: '#FFFFFF' },
          { label: '红色', value: '#E34D59' },
          { label: '深红', value: '#C00000' },
          { label: '橙色', value: '#ED7D31' },
          { label: '深橙', value: '#E65100' },
          { label: '黄色', value: '#FFC000' },
          { label: '深黄', value: '#BF8F00' },
          { label: '绿色', value: '#70AD47' },
          { label: '深绿', value: '#0070C0' },
          { label: '青色', value: '#00B0F0' },
          { label: '蓝色', value: '#2B6CF6' },
          { label: '深蓝', value: '#002060' },
          { label: '紫色', value: '#7030A0' },
          { label: '深紫', value: '#4A148C' },
          { label: '灰色-80%', value: '#404040' },
          { label: '灰色-50%', value: '#808080' },
          { label: '灰色-30%', value: '#BFBFBF' },
        ], '字体颜色'),
      ],
    },
    {
      name: '段落',
      items: [
        小('para.alignLeft', '左对齐', 'align-left'),
        小('para.alignCenter', '居中', 'align-center'),
        小('para.alignRight', '右对齐', 'align-right'),
      ],
    },
    {
      name: '绘图',
      items: [大('box.new', '文本框', 'textbox')],
    },
  ],
}

const 插入标签: RibbonTabSpec = {
  key: 'insert',
  label: '插入',
  groups: [
    {
      name: '表格',
      items: [大('insert.table', '表格', 'table')],
    },
    {
      name: '插图',
      items: [
        大('insert.picture', '图片', 'image'),
        大('insert.chart', '图表', 'chart'),
        下拉('insert.shape', '图形', 'textbox', ['矩形','圆角矩形','椭圆','菱形','三角形','箭头']),
        下拉('insert.icon', '矢量图标', 'textbox', ['星形','爱心']),
        下拉('insert.diagram', '语义图', 'textbox', ['流程','层级','循环','脑图']),
        大('insert.wordart', '艺术字', 'textbox'),
      ],
    },
    {
      name: '文本',
      items: [大('box.new', '文本框', 'textbox')],
    },
    {
      name: '符号与对象',
      items: [
        大('insert.formula', '公式', 'textbox'),
        大('insert.symbol', '符号', 'textbox'),
        大('insert.attachment', '附件', 'export-file'),
      ],
    },
    {
      name: '媒体',
      items: [大('insert.media', '音频与视频', 'image')],
    },
  ],
}

const 设计标签: RibbonTabSpec = {
  key: 'design',
  label: '设计',
  groups: [
    {
      name: '主题',
      items: [
        下拉('design.background', '背景色', 'page-color', ['白色', '浅蓝', '浅绿', '浅灰', '深色'], '白色'),
      ],
    },
    {
      name: '自定义',
      items: [
        下拉('design.layout', '版式', 'page-view', [
          { label: '标题幻灯片', value: '标题幻灯片' },
          { label: '标题和内容', value: '标题和内容' },
          { label: '空白', value: '空白' },
        ], '标题和内容'),
      ],
    },
  ],
}

const 切换标签: RibbonTabSpec = {
  key: 'transition',
  label: '切换',
  groups: [
    {
      name: '切换到此幻灯片',
      items: [
        大('transition.fade', '淡入淡出', 'flow'),
        大('transition.push', '推进', 'arrow-left'),
      ],
    },
  ],
}

const 动画标签: RibbonTabSpec = {
  key: 'animation',
  label: '动画',
  groups: [
    {
      name: '动画',
      items: [
        大('animation.appear', '出现', 'page-view'),
        大('animation.fade', '淡出', 'flow'),
      ],
    },
  ],
}

const 放映标签: RibbonTabSpec = {
  key: 'slideshow',
  label: '幻灯片放映',
  groups: [
    {
      name: '开始放映幻灯片',
      items: [
        大('slideshow.start', '从头开始', 'page-view'),
        大('slideshow.current', '从当前开始', 'page-view'),
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
      items: [大('review.spell', '排版检查', 'spell-check')],
    },
    {
      name: '批注',
      items: [
        大('review.comment', '新建批注', 'comment'),
        小('review.commentPrevious', '上一条', 'arrow-left'),
        小('review.commentNext', '下一条', 'arrow-left'),
        小('review.commentToggle', '显示批注', 'navigation'),
      ],
    },
    {
      name: '中文简繁',
      items: [
        大('review.langToSimplified', '繁转简', 'language'),
        大('review.langToTraditional', '简转繁', 'language'),
      ],
    },
    {
      name: '文档',
      items: [
        大('review.finalize', '文档定稿', 'track'),
        大('review.compare', '文档比对', 'compare'),
      ],
    },
  ],
}

const 视图标签: RibbonTabSpec = {
  key: 'view',
  label: '视图',
  groups: [
    {
      name: '演示文稿视图',
      items: [
        大('view.normal', '普通', 'page-view'),
        大('view.slideSorter', '幻灯片浏览', 'grid'),
        大('view.notes', '备注页', 'doc-empty'),
      ],
    },
    {
      name: '显示',
      items: [大('view.gridlines', '网格线', 'gridlines')],
    },
    {
      name: '显示比例',
      items: [大('view.zoomIn', '放大', 'zoom-in'), 大('view.zoomOut', '缩小', 'zoom-out')],
    },
    {
      name: '导出',
      items: [大('file.exportDialog', '导出', 'export-file'), 大('file.exportHtml', '导出为网页', 'export-file')],
    },
  ],
}

export const 演示标签: RibbonTabSpec[] = [
  开始标签,
  插入标签,
  设计标签,
  切换标签,
  动画标签,
  放映标签,
  审阅标签,
  视图标签,
]
