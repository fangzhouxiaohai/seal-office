import { describe, expect, it } from 'vitest'
import { excelTableNames, newBaseTable, parseBase, parseNotes, recordsCsv, validateRecord } from './workspaceTools'
describe('本机应用服务真实数据', () => {
  it('严格保存多表、数字零、布尔false、中文与可编辑字段', () => {
    const table = newBaseTable(); table.fields.push({ id: 'check', name: '已验收', type: '复选' })
    table.records = [{ id: 'record', updated: 1, values: { title: '中文😀\n项目', amount: 0, check: false, status: '待开始', date: '2026-10-18' } }]
    const data = { schema: 1, tables: [table, newBaseTable('客户名单')] }
    expect(parseBase(JSON.stringify(data))).toEqual(data)
    expect(recordsCsv(table)).toContain('"中文😀\n项目"'); expect(recordsCsv(table)).toContain('"0","false"')
  })
  it('无效日期、必填、字段转换或不匹配的状态拒绝保存而不篡改原模型', () => {
    const table = newBaseTable(), record = { id: 'a', updated: 1, values: { title: '', amount: 0 } }
    expect(validateRecord(table, record)).toMatch(/不能为空/)
    expect(validateRecord(table, { ...record, values: { title: '计划', date: '2026-02-30' } })).toMatch(/日期无效/)
    expect(validateRecord(table, { ...record, values: { title: '计划', status: '越界状态' } })).toMatch(/可选状态/)
    const before = JSON.stringify(table)
    expect(() => parseBase(JSON.stringify({ schema: 1, tables: [{ ...table, records: [{ ...record, values: { title: '计划', amount: '不是数字' } }] }] }))).toThrow(/有效数字/)
    expect(JSON.stringify(table)).toBe(before)
  })
  it('拒绝重复标识、超预算及未知字段，CSV引号换行保持原文', () => {
    const table = newBaseTable(); table.records = [{ id:'r', updated:1, values:{title:'a,"b"\r\nc'} }]
    expect(recordsCsv(table)).toContain('"a,""b""\r\nc"')
    expect(() => parseBase(JSON.stringify({ schema:1,tables:[table,table] }))).toThrow()
    expect(() => parseBase(' '.repeat(5_000_001))).toThrow(/5 MB/)
    expect(() => parseBase(JSON.stringify({schema:1,tables:[{...table,records:[{id:'x',updated:1,values:{unknown:'bad'}}]}]}))).toThrow(/标识/)
  })
  it('笔记备份保持正文、回收站、置顶与标签；非法数据不覆盖已有内容', () => {
    const note = { id:'n',title:'😀笔记',text:'# 标题\n\n- [x] 完成\n<script>原样文本</script>',notebook:'工作',tags:['项目','项目'],pinned:true,trashed:true,updated:1 }
    expect(parseNotes(JSON.stringify({schema:1,notes:[note]})).notes[0]).toEqual({...note,tags:['项目']})
    expect(() => parseNotes(JSON.stringify({schema:1,notes:[note,note]}))).toThrow()
    expect(() => parseNotes('{bad')).toThrow()
  })
  it('多个同名或含Excel保留字符的数据表导出时名称合法，保留内部表名', () => {
    const tables = [{ name: '客户/项目' }, { name: '客户:项目' }, { name: 'A'.repeat(40) }, { name: 'a'.repeat(40) }, { name: "'" }]
    const before = JSON.stringify(tables), names = excelTableNames(tables)
    expect(names).toEqual(['客户_项目', '客户_项目 (2)', 'A'.repeat(31), 'a'.repeat(27) + ' (2)', '数据表'])
    expect(JSON.stringify(tables)).toBe(before)
  })
})
