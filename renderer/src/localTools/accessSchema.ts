// Access 字段类型、建表模板、常用字段与常用查询的纯数据定义。
// 渲染层建表弹窗、表结构编辑、数据录入与查询区共用这一份定义；
// 不依赖 React，便于单测，将来做移动端只读展示也可直接复用。
// 所有中文名称都必须在 i18n/surfaceEnglish271Database.ts 中提供英文。

import type { Access字段信息, Access表信息 } from '../ipc/bridge'

export type 字段类型键值 = 'TEXT' | 'LONGTEXT' | 'INTEGER' | 'LONG' | 'DOUBLE' | 'CURRENCY' | 'DATETIME' | 'YESNO' | 'COUNTER' | 'GUID' | 'LONGBINARY'
export type 录入控件 = '文本' | '长文本' | '数字' | '日期' | '开关' | '自动编号' | '只读'

export interface 字段类型定义 {
  键: 字段类型键值
  名称: string
  说明: string
  /** 仅短文本需要长度 */
  有长度?: boolean
  控件: 录入控件
}

export const ACCESS字段类型: 字段类型定义[] = [
  { 键: 'TEXT', 名称: '短文本', 说明: '姓名、编号等 255 字以内的文字', 有长度: true, 控件: '文本' },
  { 键: 'LONGTEXT', 名称: '长文本', 说明: '备注、描述等较长文字', 控件: '长文本' },
  { 键: 'INTEGER', 名称: '整数', 说明: '数量、序号等不带小数的数字', 控件: '数字' },
  { 键: 'DOUBLE', 名称: '小数', 说明: '比例、重量等带小数的数字', 控件: '数字' },
  { 键: 'CURRENCY', 名称: '货币', 说明: '金额，按货币精度保存', 控件: '数字' },
  { 键: 'DATETIME', 名称: '日期时间', 说明: '日期或时间点', 控件: '日期' },
  { 键: 'YESNO', 名称: '是/否', 说明: '开关状态，只有是与否两种值', 控件: '开关' },
  { 键: 'COUNTER', 名称: '自动编号', 说明: '新增记录时自动递增，常用作主键', 控件: '自动编号' },
  { 键: 'GUID', 名称: '全局唯一标识', 说明: '跨库唯一的标识码', 控件: '文本' },
  { 键: 'LONGBINARY', 名称: '二进制对象', 说明: '图片、附件等二进制内容（只能查看大小）', 控件: '只读' },
]

/** 下拉里只列常用类型；GUID、二进制等只在复制已有表结构时出现。 */
export const 常用字段类型 = ACCESS字段类型.filter((项) => 项.键 !== 'GUID' && 项.键 !== 'LONGBINARY')

export function 读取类型定义(键: string): 字段类型定义 {
  return ACCESS字段类型.find((项) => 项.键 === 键) ?? ACCESS字段类型[0]
}

export interface 字段行 {
  /** 仅供列表渲染的稳定键 */
  标识: string
  名称: string
  类型: 字段类型键值
  /** 仅短文本使用；null 表示留空，按 255 处理 */
  长度: number | null
  主键: boolean
  必填: boolean
}

export type 字段模板 = Omit<字段行, '标识' | '长度'> & { 长度?: number }

let 行序号 = 0
export function 新字段行(局部: Partial<Omit<字段行, '标识'>> = {}): 字段行 {
  行序号 += 1
  return { 标识: `field-${Date.now().toString(36)}-${行序号}`, 名称: '', 类型: 'TEXT', 长度: 255, 主键: false, 必填: false, ...局部 }
}

export interface 建表模板 { 键: string; 名称: string; 字段: 字段模板[] }

export const ACCESS建表模板: 建表模板[] = [
  { 键: 'people', 名称: '人员信息', 字段: [
    { 名称: '编号', 类型: 'COUNTER', 主键: true, 必填: false },
    { 名称: '姓名', 类型: 'TEXT', 长度: 50, 主键: false, 必填: true },
    { 名称: '性别', 类型: 'TEXT', 长度: 10, 主键: false, 必填: false },
    { 名称: '出生日期', 类型: 'DATETIME', 主键: false, 必填: false },
    { 名称: '手机号', 类型: 'TEXT', 长度: 20, 主键: false, 必填: false },
    { 名称: '部门', 类型: 'TEXT', 长度: 100, 主键: false, 必填: false },
    { 名称: '在职', 类型: 'YESNO', 主键: false, 必填: false },
  ] },
  { 键: 'orders', 名称: '订单记录', 字段: [
    { 名称: '订单编号', 类型: 'COUNTER', 主键: true, 必填: false },
    { 名称: '客户名称', 类型: 'TEXT', 长度: 100, 主键: false, 必填: true },
    { 名称: '下单日期', 类型: 'DATETIME', 主键: false, 必填: true },
    { 名称: '订单金额', 类型: 'CURRENCY', 主键: false, 必填: true },
    { 名称: '订单状态', 类型: 'TEXT', 长度: 20, 主键: false, 必填: false },
    { 名称: '备注', 类型: 'LONGTEXT', 主键: false, 必填: false },
  ] },
  { 键: 'products', 名称: '商品明细', 字段: [
    { 名称: '商品编号', 类型: 'COUNTER', 主键: true, 必填: false },
    { 名称: '商品名称', 类型: 'TEXT', 长度: 100, 主键: false, 必填: true },
    { 名称: '规格', 类型: 'TEXT', 长度: 100, 主键: false, 必填: false },
    { 名称: '单价', 类型: 'CURRENCY', 主键: false, 必填: true },
    { 名称: '库存数量', 类型: 'INTEGER', 主键: false, 必填: false },
    { 名称: '上架', 类型: 'YESNO', 主键: false, 必填: false },
  ] },
  { 键: 'logs', 名称: '日志记录', 字段: [
    { 名称: '日志编号', 类型: 'COUNTER', 主键: true, 必填: false },
    { 名称: '记录时间', 类型: 'DATETIME', 主键: false, 必填: true },
    { 名称: '级别', 类型: 'TEXT', 长度: 20, 主键: false, 必填: false },
    { 名称: '操作人', 类型: 'TEXT', 长度: 50, 主键: false, 必填: false },
    { 名称: '内容', 类型: 'LONGTEXT', 主键: false, 必填: false },
  ] },
]

export const ACCESS常用字段: Array<{ 键: string; 名称: string; 字段: 字段模板 }> = [
  { 键: 'created', 名称: '创建时间', 字段: { 名称: '创建时间', 类型: 'DATETIME', 主键: false, 必填: false } },
  { 键: 'modified', 名称: '修改时间', 字段: { 名称: '修改时间', 类型: 'DATETIME', 主键: false, 必填: false } },
  { 键: 'note', 名称: '备注', 字段: { 名称: '备注', 类型: 'LONGTEXT', 主键: false, 必填: false } },
]

export function 模板转字段行(模板: 字段模板): 字段行 {
  return 新字段行({ ...模板, 长度: 模板.长度 ?? 255 })
}

/** Access 字段名不允许 . ! ` [ ]、控制字符，且不能以空格开头，最长 64 字符。 */
export function 校验字段名(名称: string, 其他名称: string[]): string | null {
  if (!名称.trim()) return '请输入字段名'
  if (/^\s/.test(名称)) return '字段名不能以空格开头'
  if (/[.!`[\]\x00-\x1f]/.test(名称)) return '字段名不能包含 . ! ` [ ] 等符号'
  if (名称.length > 64) return '字段名不能超过 64 个字符'
  const 小写 = 名称.trim().toLocaleLowerCase()
  if (其他名称.some((项) => 项.trim().toLocaleLowerCase() === 小写)) return '字段名重复'
  return null
}

/** 返回 行序号 → 错误 的映射；无错误时为空对象。重名只标在后出现的行，首个保持可用。 */
export function 校验字段行(行列表: 字段行[]): Record<number, string> {
  const 错误: Record<number, string> = {}
  行列表.forEach((行, 序号) => {
    const 结果 = 校验字段名(行.名称, 行列表.slice(0, 序号).map((项) => 项.名称))
    if (结果) 错误[序号] = 结果
  })
  return 错误
}

function 文本长度(长度: number | null): number {
  return 长度 !== null && Number.isInteger(长度) && 长度 >= 1 && 长度 <= 255 ? 长度 : 255
}

export function 生成类型文本(行: Pick<字段行, '类型' | '长度'>): string {
  return 行.类型 === 'TEXT' ? `TEXT(${文本长度(行.长度)})` : 行.类型
}

export function 生成建表定义(行列表: 字段行[]): { 字段: Array<{ 名称: string; 类型: string; 必填: boolean }>; 主键: string[] } {
  return {
    字段: 行列表.map((行) => ({ 名称: 行.名称.trim(), 类型: 生成类型文本(行), 必填: 行.类型 === 'COUNTER' ? false : 行.必填 })),
    主键: 行列表.filter((行) => 行.主键).map((行) => 行.名称.trim()),
  }
}

// OLE DB 类型码：3 整型、2 短整型、17 字节、4 单精度、5 双精度、6 货币、131 小数、
// 7/133/135 日期、11 布尔、72 GUID、128/204/205 二进制、129/130/200-203 文本。
export function 字段类型键(字段: Pick<Access字段信息, 'type' | 'dataType' | 'maxLength' | 'autoIncrement'>): 字段类型键值 {
  if (字段.autoIncrement) return 'COUNTER'
  const 名 = String(字段.type || '').toUpperCase()
  if (/COUNTER|AUTOINCREMENT/.test(名)) return 'COUNTER'
  if (/YESNO|BOOLEAN|\bBIT\b/.test(名)) return 'YESNO'
  if (/CURRENCY|MONEY/.test(名)) return 'CURRENCY'
  if (/DATE|TIME/.test(名)) return 'DATETIME'
  if (/LONGTEXT|MEMO|NTEXT/.test(名)) return 'LONGTEXT'
  if (/DOUBLE|SINGLE|FLOAT|DECIMAL|NUMERIC|REAL/.test(名)) return 'DOUBLE'
  if (/INTEGER|LONG|SHORT|BYTE|INT/.test(名)) return 'INTEGER'
  if (/GUID/.test(名)) return 'GUID'
  if (/BINARY|OLE|IMAGE/.test(名)) return 'LONGBINARY'
  if (/TEXT|CHAR/.test(名)) return 'TEXT'
  const 码 = Number(字段.dataType)
  if (码 === 11) return 'YESNO'
  if (码 === 6) return 'CURRENCY'
  if (码 === 7 || 码 === 133 || 码 === 135) return 'DATETIME'
  if (码 === 4 || 码 === 5 || 码 === 131) return 'DOUBLE'
  if (码 === 2 || 码 === 3 || 码 === 17 || 码 === 20) return 'INTEGER'
  if (码 === 72) return 'GUID'
  if (码 === 128 || 码 === 204 || 码 === 205) return 'LONGBINARY'
  if (码 === 129 || 码 === 130 || 码 === 200 || 码 === 202) return 字段.maxLength === 0 ? 'LONGTEXT' : 'TEXT'
  if (码 === 201 || 码 === 203) return 'LONGTEXT'
  return 'TEXT'
}

export function 字段录入控件(字段: Pick<Access字段信息, 'type' | 'dataType' | 'maxLength' | 'autoIncrement'>): 录入控件 {
  return 读取类型定义(字段类型键(字段)).控件
}

export function 由表结构复制字段行(表: Pick<Access表信息, 'columns' | 'primaryKey'>): 字段行[] {
  return 表.columns.map((字段) => {
    const 类型 = 字段类型键(字段)
    const 长度 = 类型 === 'TEXT' && typeof 字段.maxLength === 'number' && 字段.maxLength > 0 ? 字段.maxLength : 255
    return 新字段行({
      名称: 字段.name,
      类型,
      长度,
      主键: 表.primaryKey.includes(字段.name),
      // 是/否在 Access 中天然不可为空、自动编号不需要必填，复制时不额外勾选
      必填: 类型 !== 'COUNTER' && 类型 !== 'YESNO' && 字段.nullable === false,
    })
  })
}

export function 引用标识符(名称: string): string {
  return `[${名称.replace(/]/g, ']]')}]`
}

export type 常用查询键 = 'all' | 'filter' | 'count' | 'recent'
export const ACCESS常用查询: Array<{ 键: 常用查询键; 名称: string }> = [
  { 键: 'all', 名称: '查全部' },
  { 键: 'filter', 名称: '按条件筛选' },
  { 键: 'count', 名称: '统计行数' },
  { 键: 'recent', 名称: '最近 100 条' },
]

export type 筛选运算 = 'eq' | 'ne' | 'contains' | 'gt' | 'lt' | 'empty' | 'notEmpty'
export const ACCESS筛选运算: Array<{ 键: 筛选运算; 名称: string; 需要值: boolean }> = [
  { 键: 'eq', 名称: '等于', 需要值: true },
  { 键: 'ne', 名称: '不等于', 需要值: true },
  { 键: 'contains', 名称: '包含', 需要值: true },
  { 键: 'gt', 名称: '大于', 需要值: true },
  { 键: 'lt', 名称: '小于', 需要值: true },
  { 键: 'empty', 名称: '为空', 需要值: false },
  { 键: 'notEmpty', 名称: '不为空', 需要值: false },
]

type 查询表 = Pick<Access表信息, 'name' | 'primaryKey'>
export interface 筛选条件 { 字段: string; 运算: 筛选运算; 值?: string | number | boolean | null }

/** 生成只读 SQL；筛选值一律走参数，避免引号与注入问题。 */
export function 生成常用查询SQL(键: 常用查询键, 表: 查询表, 条件?: 筛选条件): { SQL: string; 参数: Array<string | number | boolean | null> } {
  const 表名 = 引用标识符(表.name)
  if (键 === 'count') return { SQL: `SELECT COUNT(*) AS [行数] FROM ${表名}`, 参数: [] }
  if (键 === 'recent') {
    const 排序 = 表.primaryKey.length ? ` ORDER BY ${表.primaryKey.map((名称) => `${引用标识符(名称)} DESC`).join(', ')}` : ''
    return { SQL: `SELECT TOP 100 * FROM ${表名}${排序}`, 参数: [] }
  }
  if (键 === 'filter' && 条件?.字段) {
    const 列 = 引用标识符(条件.字段)
    const 值 = 条件.值 ?? null
    switch (条件.运算) {
      case 'empty': return { SQL: `SELECT * FROM ${表名} WHERE ${列} IS NULL`, 参数: [] }
      case 'notEmpty': return { SQL: `SELECT * FROM ${表名} WHERE ${列} IS NOT NULL`, 参数: [] }
      case 'contains': return { SQL: `SELECT * FROM ${表名} WHERE ${列} LIKE ?`, 参数: [`%${String(值 ?? '')}%`] }
      case 'ne': return { SQL: `SELECT * FROM ${表名} WHERE ${列} <> ?`, 参数: [值] }
      case 'gt': return { SQL: `SELECT * FROM ${表名} WHERE ${列} > ?`, 参数: [值] }
      case 'lt': return { SQL: `SELECT * FROM ${表名} WHERE ${列} < ?`, 参数: [值] }
      default: return { SQL: `SELECT * FROM ${表名} WHERE ${列} = ?`, 参数: [值] }
    }
  }
  return { SQL: `SELECT * FROM ${表名}`, 参数: [] }
}

type 模板表 = Pick<Access表信息, 'name' | 'primaryKey' | 'columns'> | null
const 占位表名 = '[表名]'

function 可写字段(表: 模板表): string[] {
  return 表 ? 表.columns.filter((字段) => !(字段.autoIncrement || /COUNTER|AUTOINCREMENT/i.test(字段.type))).map((字段) => 引用标识符(字段.name)) : ['[字段1]', '[字段2]']
}

/** SQL 编辑器“插入命令”下拉；以当前表为上下文生成可直接修改的完整语句。 */
export const ACCESS命令模板: Array<{ 键: string; 名称: string; 生成: (表: 模板表) => string }> = [
  { 键: 'select', 名称: '查询 SELECT', 生成: (表) => `SELECT TOP 100 * FROM ${表 ? 引用标识符(表.name) : 占位表名};` },
  { 键: 'insert', 名称: '插入 INSERT', 生成: (表) => { const 列 = 可写字段(表); return `INSERT INTO ${表 ? 引用标识符(表.name) : 占位表名} (${列.join(', ')}) VALUES (${列.map(() => 'NULL').join(', ')});` } },
  { 键: 'update', 名称: '更新 UPDATE', 生成: (表) => { const 列 = 可写字段(表); const 键 = 表?.primaryKey[0] ? 引用标识符(表.primaryKey[0]) : '[编号]'; return `UPDATE ${表 ? 引用标识符(表.name) : 占位表名} SET ${列[0] ?? '[字段1]'} = NULL WHERE ${键} = 1;` } },
  { 键: 'delete', 名称: '删除 DELETE', 生成: (表) => { const 键 = 表?.primaryKey[0] ? 引用标识符(表.primaryKey[0]) : '[编号]'; return `DELETE FROM ${表 ? 引用标识符(表.name) : 占位表名} WHERE ${键} = 1;` } },
  { 键: 'create', 名称: '建表 CREATE TABLE', 生成: () => 'CREATE TABLE [新表] ([编号] COUNTER PRIMARY KEY, [名称] TEXT(255) NOT NULL, [创建时间] DATETIME);' },
]
