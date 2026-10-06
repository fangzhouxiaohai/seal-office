// 演示文稿 Ribbon 八标签声明。
import type { RibbonTabSpec } from '../editor/ribbon/tabSpecs'
import { 全部切换 } from './model/transitions'

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
    {
      name: '智能素材',
      items: [
        大('insert.generate', '智能生成', 'aippt'),
        大('insert.assets', '素材库', 'image'),
      ],
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
        大('design.theme', '主题面板', 'page-color'),
        下拉('design.theme.apply', '应用主题', 'page-color', [
          { label: '海豹默认', value: '海豹-默认' },
          { label: '海豹锐蓝', value: '海豹-锐蓝' },
          { label: '海豹墨绿', value: '海豹-墨绿' },
          { label: '海豹暖橙', value: '海豹-暖橙' },
          { label: '海豹石板', value: '海豹-石板' },
          { label: '海豹深色', value: '海豹-深色' },
        ], '海豹-默认'),
        下拉('design.color.apply', '配色方案', 'language', ['默认', '锐蓝', '墨绿', '暖橙', '石板', '深色'], '默认'),
      ],
    },
    {
      name: '字体',
      items: [
        下拉('design.font.title', '标题字体', 'bold', ['微软雅黑', '思源黑体', '等线', '宋体', '黑体'], '微软雅黑'),
        下拉('design.font.body', '正文字体', 'textbox', ['微软雅黑', '思源宋体', '等线', '宋体', '楷体'], '微软雅黑'),
      ],
    },
    {
      name: '背景',
      items: [
        下拉('design.background', '背景色', 'page-color', ['白色', '浅蓝', '浅绿', '浅灰', '深色'], '白色'),
        下拉('design.background.gradient', '渐变背景', 'flow', [
          { label: '浅蓝到白', value: '浅蓝:白色' },
          { label: '浅绿到白', value: '浅绿:白色' },
          { label: '浅灰到深色', value: '浅灰:深色' },
        ], '浅蓝:白色'),
        小('design.background.image', '图片背景', 'image'),
        小('design.background.all', '应用到全部', 'copy'),
        小('design.background.clear', '清除背景', 'close'),
      ],
    },
    {
      name: '智能美化',
      items: [
        大('design.beautify', '智能美化', 'aippt'),
        大('insert.generate', '生成与美化', 'ai'),
      ],
    },
    {
      name: '页脚',
      items: [
        下拉('design.footer.text', '页脚', 'textbox', ['海豹办公', '公司名称', '内部资料'], '海豹办公'),
        小('design.footer.date', '日期', 'doc-empty'),
        小('design.footer.pageNumber', '页码', 'grid'),
        小('design.footer.firstPageOff', '首页不显示', 'close'),
      ],
    },
    {
      name: '自定义',
      items: [
        大('design.master', '幻灯片母版', 'grid'),
        小('design.master.sync', '同步占位符', 'flow'),
        小('design.inherit.release', '解除继承', 'close'),
        小('design.inherit.restore', '恢复继承', 'undo'),
        下拉('design.layout.apply', '版式', 'page-view', [
          { label: '标题幻灯片', value: '标题幻灯片' },
          { label: '标题和内容', value: '标题和内容' },
          { label: '空白', value: '空白' },
        ], '标题和内容'),
      ],
    },
    {
      name: '幻灯片大小',
      items: [
        下拉('design.size.16:9', '16:9', 'page-view', [{ label: '宽屏 16:9', value: '16:9' }], '16:9'),
        下拉('design.size.4:3', '4:3', 'page-view', [{ label: '标准 4:3', value: '4:3' }], '4:3'),
        小('design.size.orientation', '方向', 'page-view'),
        下拉('design.size.custom', '自定义', 'page-view', [
          { label: '1280×720', value: '1280:720' },
          { label: '1600×900', value: '1600:900' },
        ], '1280:720'),
      ],
    },
    {
      name: '美化',
      items: [
        大('design.beautify.page', '本机美化当前页', 'spell-check'),
        小('design.beautify.all', '本机美化全部', 'spell-check'),
        小('design.beautify.preview', '预览美化', 'page-view'),
        大('design.check', '检查与美化面板', 'spell-check'),
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
        下拉('transition.effect', '切换效果库', 'flow', [...全部切换], '淡入淡出'),
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
    {
      name: '智能讲 PPT',
      items: [大('slideshow.narrate', '讲稿与讲解音频', 'comment')],
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
      name: '智能审阅',
      items: [
        小('review.translate', '翻译', 'language'),
        小('review.proofread', '语义校对', 'comment'),
      ],
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
