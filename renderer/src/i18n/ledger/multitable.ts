// 文案台账 · 多维表格图标按钮（2.8.1 第五节）：记录行、字段条与页脚入口的读屏名称、提示与确认文案。
import type { 台账条目 } from './types'

export const 多维表格文案 = {
  'multitable.actions': { zh: '操作', en: 'Actions' },
  'multitable.record.untitled': { zh: '未命名记录', en: 'Untitled record' },
  'multitable.record.edit': { zh: '编辑记录：{name}', en: 'Edit record: {name}' },
  'multitable.record.delete': { zh: '删除记录：{name}', en: 'Delete record: {name}' },
  'multitable.record.delete.title': { zh: '删除记录', en: 'Delete record' },
  'multitable.record.delete.one': { zh: '删除记录「{name}」？可先导出备份。', en: 'Delete the record “{name}”? You can export a backup first.' },
  'multitable.record.delete.many': { zh: '删除所选 {count} 条记录？可先导出备份。', en: 'Delete {count} selected records? You can export a backup first.', enOne: 'Delete {count} selected record? You can export a backup first.' },
  'multitable.record.delete.ok': { zh: '删除记录', en: 'Delete record' },
  'multitable.field.settings': { zh: '设置字段「{name}」', en: 'Field settings: {name}' },
  'multitable.field.delete': { zh: '删除字段：{name}', en: 'Delete field: {name}' },
  'multitable.field.delete.last': { zh: '至少保留一个字段，不能删除', en: 'A table needs at least one field, so this one can’t be deleted' },
  'multitable.field.delete.title': { zh: '删除字段', en: 'Delete field' },
  'multitable.field.delete.content': { zh: '删除字段「{name}」？{count} 条记录中的该字段值将一并删除，可先导出备份。', en: 'Delete the field “{name}”? Its values in {count} records will also be deleted. You can export a backup first.', enOne: 'Delete the field “{name}”? Its value in {count} record will also be deleted. You can export a backup first.' },
  'multitable.field.delete.ok': { zh: '删除字段', en: 'Delete field' },
  'multitable.export.csv': { zh: '导出当前视图 CSV', en: 'Export current view as CSV' },
  'multitable.cancel': { zh: '取消', en: 'Cancel' },
} satisfies Record<string, 台账条目>
