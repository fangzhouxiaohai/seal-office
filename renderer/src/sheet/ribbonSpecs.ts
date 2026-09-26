// 表格 Ribbon 七标签声明：只描述有哪些组、哪些按钮、绑定哪条命令。
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
      items: [
        大('clipboard.paste', '粘贴', 'paste'),
        小('clipboard.cut', '剪切', 'cut'),
        小('clipboard.copy', '复制', 'copy'),
      ],
    },
    {
      name: '撤销',
      items: [小('edit.undo', '撤销', 'undo'), 小('edit.redo', '重做', 'redo')],
    },
    {
      name: '字体',
      items: [
        小('cell.bold', '加粗', 'bold'),
        小('cell.italic', '斜体', 'italic'),
        小('cell.underline', '下划线', 'underline'),
        下拉('cell.fontColor', '字体颜色', 'language', [
          { label: '红色', value: '#E34D59' },
          { label: '蓝色', value: '#2B6CF6' },
          { label: '黑色', value: '#1A1D24' },
        ], '字体颜色'),
        下拉('cell.fill', '填充颜色', 'shading', [
          { label: '浅蓝', value: '#EBF1FE' },
          { label: '浅绿', value: '#E8F7F1' },
          { label: '浅黄', value: '#FFF3B0' },
        ], '填充颜色'),
      ],
    },
    {
      name: '对齐方式',
      items: [
        小('cell.alignLeft', '左对齐', 'align-left'),
        小('cell.alignCenter', '居中', 'align-center'),
        小('cell.alignRight', '右对齐', 'align-right'),
        小('cell.wrap', '自动换行', 'align-justify'),
        小('cell.mergeCenter', '合并后居中', 'table'),
      ],
    },
    {
      name: '数字',
      items: [
        下拉('number.format', '数字格式', 'word-count', [
          { label: '常规', value: 'number.plain' },
          { label: '百分比', value: 'number.percent' },
          { label: '货币', value: 'number.currency' },
          { label: '千位分隔', value: 'number.thousand' },
        ], '常规'),
      ],
    },
    {
      name: '编辑',
      items: [
        大('edit.sum', '自动求和', 'chart'),
        大('edit.clear', '清除内容', 'retry'),
        大('data.sortAsc', '升序', 'sort'),
        大('data.sortDesc', '降序', 'sort'),
      ],
    },
  ],
}

const 插入标签: RibbonTabSpec = {
  key: 'insert',
  label: '插入',
  groups: [
    {
      name: '表格',
      items: [大('insert.pivot', '数据透视表', 'table')],
    },
    {
      name: '插图',
      items: [
        大('insert.picture', '图片', 'image'),
        大('insert.chart', '图表', 'chart'),
      ],
    },
    {
      name: '文本',
      items: [大('symbol.insert', '符号', 'symbol')],
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
        下拉('layout.margin', '页边距', 'margin', ['常规', '窄', '适中', '宽'], '常规'),
        下拉('layout.orientation', '纸张方向', 'orientation', ['纵向', '横向'], '纵向'),
        下拉('layout.paperSize', '纸张大小', 'paper-size', ['A4', 'A5', 'B5', 'Letter'], 'A4'),
      ],
    },
    {
      name: '工作表选项',
      items: [小('view.gridlines', '网格线', 'gridlines')],
    },
  ],
}

const 公式标签: RibbonTabSpec = {
  key: 'formula',
  label: '公式',
  groups: [
    {
      name: '函数库',
      items: [
        大('edit.sum', '自动求和', 'chart'),
        大('formula.logical', '逻辑', 'formula'),
        大('formula.lookup', '查找与引用', 'crossref'),
        大('formula.financial', '财务', 'word-count'),
      ],
    },
    {
      name: '计算',
      items: [大('formula.calculate', '开始计算', 'retry')],
    },
  ],
}

const 数据标签: RibbonTabSpec = {
  key: 'data',
  label: '数据',
  groups: [
    {
      name: '排序和筛选',
      items: [
        大('data.sortAsc', '升序', 'sort'),
        大('data.sortDesc', '降序', 'sort'),
        大('data.filter', '筛选', 'gridlines'),
      ],
    },
    {
      name: '数据工具',
      items: [
        大('data.removeDuplicates', '删除重复项', 'retry'),
        大('data.textToColumns', '分列', 'columns'),
        大('data.validation', '数据验证', 'spell-check'),
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
      items: [大('spell.check', '拼写检查', 'spell-check')],
    },
    {
      name: '更改',
      items: [
        大('review.comment', '批注', 'comment'),
        大('review.protect', '保护工作表', 'settings'),
      ],
    },
  ],
}

const 视图标签: RibbonTabSpec = {
  key: 'view',
  label: '视图',
  groups: [
    {
      name: '工作簿视图',
      items: [
        大('view.normal', '普通', 'page-view'),
        大('view.pageLayout', '页面布局', 'page-view'),
      ],
    },
    {
      name: '窗口',
      items: [
        大('view.freeze', '冻结窗格', 'gridlines'),
        大('view.split', '拆分', 'columns'),
      ],
    },
    {
      name: '显示',
      items: [小('view.gridlines', '网格线', 'gridlines')],
    },
    {
      name: '导出',
      items: [
        大('file.exportCsv', '导出为 CSV', 'export-file'),
        大('file.exportHtml', '导出为网页', 'export-file'),
        大('file.exportXlsx', '导出为表格', 'export-file'),
      ],
    },
  ],
}

export const 表格标签: RibbonTabSpec[] = [
  开始标签,
  插入标签,
  布局标签,
  公式标签,
  数据标签,
  审阅标签,
  视图标签,
]
