export const toolId = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
export type FieldType = '文本' | '数字' | '日期' | '状态' | '复选' | '链接'
export interface BaseField { id: string; name: string; type: FieldType; options?: string[]; required?: boolean }
export interface BaseRecord { id: string; values: Record<string, string | number | boolean>; updated: number }
export interface BaseTable { id: string; name: string; fields: BaseField[]; records: BaseRecord[] }
export interface MultiBase { schema: 1; tables: BaseTable[] }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max = 200): value is string => typeof value === 'string' && value.length <= max
export function validateRecord(table: BaseTable, record: BaseRecord): string | null {
  for (const field of table.fields) {
    const value = record.values[field.id]
    if (value === undefined || value === '') { if (field.required) return `${field.name}不能为空`; continue }
    if (field.type === '数字' && (typeof value !== 'number' || !Number.isFinite(value))) return `${field.name}必须是有效数字`
    if (field.type === '复选' && typeof value !== 'boolean') return `${field.name}必须是复选值`
    if (!['数字', '复选'].includes(field.type) && !text(value, 10000)) return `${field.name}内容无效`
    if (field.type === '日期' && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) return `${field.name}日期无效`
    if (field.type === '状态' && !field.options?.includes(String(value))) return `${field.name}不在可选状态中`
    if (field.type === '链接' && (typeof value !== 'string' || !/^https?:\/\//i.test(value))) return `${field.name}请输入http或https链接`
  }
  return null
}
export function parseBase(raw: string): MultiBase {
  if (raw.length > 5_000_000) throw new Error('多维表格备份超过5 MB')
  const value: unknown = JSON.parse(raw)
  if (!object(value) || value.schema !== 1 || !Array.isArray(value.tables) || value.tables.length < 1 || value.tables.length > 20) throw new Error('多维表格备份结构无效')
  const tableIds = new Set<string>()
  const tables = value.tables.map((item): BaseTable => {
    if (!object(item) || !text(item.id) || !item.id || tableIds.has(item.id) || !text(item.name, 80) || !item.name.trim() || !Array.isArray(item.fields) || !item.fields.length || item.fields.length > 32 || !Array.isArray(item.records) || item.records.length > 2000) throw new Error('数据表名称、字段或记录数量无效')
    tableIds.add(item.id)
    const ids = new Set<string>()
    const fields = item.fields.map((f): BaseField => {
      if (!object(f) || !text(f.id) || !f.id || ids.has(f.id) || !text(f.name, 80) || !f.name.trim() || !['文本','数字','日期','状态','复选','链接'].includes(String(f.type))) throw new Error('字段定义无效')
      ids.add(f.id)
      if (f.options !== undefined && (!Array.isArray(f.options) || f.options.length > 30 || f.options.some(o => !text(o, 80) || !o.trim()) || new Set(f.options).size !== f.options.length)) throw new Error('状态选项无效')
      if (f.type === '状态' && (!Array.isArray(f.options) || !f.options.length)) throw new Error('状态字段至少需要一个选项')
      return { id: f.id, name: f.name, type: f.type as FieldType, ...(f.options ? { options: f.options as string[] } : {}), ...(f.required === true ? { required: true } : {}) }
    })
    const recordIds = new Set<string>(), table: BaseTable = { id: item.id, name: item.name, fields, records: [] }
    table.records = item.records.map((r): BaseRecord => {
      if (!object(r) || !text(r.id) || !r.id || recordIds.has(r.id) || !object(r.values) || typeof r.updated !== 'number' || !Number.isFinite(r.updated) || Object.keys(r.values).some(id => !ids.has(id))) throw new Error('记录内容或标识无效')
      recordIds.add(r.id)
      const values: BaseRecord['values'] = Object.fromEntries(Object.entries(r.values)) as BaseRecord['values']
      const record = { id: r.id, updated: r.updated, values }, invalid = validateRecord(table, record)
      if (invalid) throw new Error(invalid)
      return record
    })
    return table
  })
  return { schema: 1, tables }
}
export function newBaseTable(name = '项目任务'): BaseTable {
  return { id: toolId(), name, fields: [{ id: 'title', name: '事项', type: '文本', required: true }, { id: 'owner', name: '负责人', type: '文本' }, { id: 'status', name: '状态', type: '状态', options: ['待开始','进行中','已完成'] }, { id: 'date', name: '截止日期', type: '日期' }, { id: 'amount', name: '预算', type: '数字' }], records: [] }
}
export interface LocalNote { id: string; title: string; text: string; notebook: string; tags: string[]; pinned: boolean; trashed: boolean; updated: number }
export interface NotesData { schema: 1; notes: LocalNote[] }
export function parseNotes(raw: string): NotesData {
  if (raw.length > 5_000_000) throw new Error('笔记备份超过5 MB')
  const value: unknown = JSON.parse(raw)
  if (!object(value) || value.schema !== 1 || !Array.isArray(value.notes) || value.notes.length > 500) throw new Error('笔记备份无效')
  const ids = new Set<string>()
  const notes = value.notes.map((n): LocalNote => {
    if (!object(n) || !text(n.id) || !n.id || ids.has(n.id) || !text(n.title, 200) || !text(n.text, 1_000_000) || !text(n.notebook, 80) || !Array.isArray(n.tags) || n.tags.length > 20 || n.tags.some(tag => !text(tag, 80)) || typeof n.updated !== 'number' || !Number.isFinite(n.updated) || typeof n.pinned !== 'boolean' || typeof n.trashed !== 'boolean') throw new Error('笔记内容或标识无效')
    ids.add(n.id); return { id: n.id, title: n.title, text: n.text, notebook: n.notebook, tags: [...new Set(n.tags as string[])], updated: n.updated, pinned: n.pinned, trashed: n.trashed }
  })
  return { schema: 1, notes }
}
export function recordsCsv(table: BaseTable): string {
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return '\uFEFF' + [table.fields.map(f => quote(f.name)).join(','), ...table.records.map(r => table.fields.map(f => quote(r.values[f.id])).join(','))].join('\r\n')
}
/** Excel worksheet names are case-insensitively unique and cannot contain these characters. */
export function excelTableNames(tables: Pick<BaseTable, 'name'>[]): string[] {
  const used = new Set<string>()
  return tables.map(table => {
    const base = table.name.replace(/[\\/?*\[\]:]/g, '_').replace(/^'+|'+$/g, '').trim() || '数据表'
    let name = base.slice(0, 31), suffix = 1
    while (used.has(name.toLocaleLowerCase())) { const tail = ` (${++suffix})`; name = base.slice(0, 31 - tail.length) + tail }
    used.add(name.toLocaleLowerCase()); return name
  })
}
