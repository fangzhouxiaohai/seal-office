import { describe, expect, it } from 'vitest'
import {
  ACCESS字段类型, ACCESS建表模板, ACCESS常用字段, ACCESS命令模板, ACCESS常用查询, ACCESS筛选运算,
  新字段行, 生成建表定义, 校验字段行, 校验字段名, 由表结构复制字段行, 字段类型键, 字段录入控件, 读取类型定义, 生成常用查询SQL, 引用标识符,
  type 字段行,
} from './accessSchema'
import { 翻译界面文本 } from '../i18n/interfaceLanguage'

const 行 = (局部: Partial<字段行>): 字段行 => ({ ...新字段行(), ...局部 })

describe('Access 字段类型定义', () => {
  it('类型下拉显示中文名，内部类型与升级计划对照表一致', () => {
    const 对照 = Object.fromEntries(ACCESS字段类型.map((项) => [项.名称, 项.键]))
    expect(对照).toMatchObject({ 短文本: 'TEXT', 长文本: 'LONGTEXT', 整数: 'INTEGER', 小数: 'DOUBLE', 货币: 'CURRENCY', 日期时间: 'DATETIME', '是/否': 'YESNO', 自动编号: 'COUNTER' })
    for (const 类型 of ACCESS字段类型) expect(类型.名称).not.toMatch(/[A-Z]{3,}/)
  })

  it('只有短文本显示长度，长度默认 255', () => {
    expect(ACCESS字段类型.filter((项) => 项.有长度).map((项) => 项.键)).toEqual(['TEXT'])
    expect(新字段行().长度).toBe(255)
  })

  it('所有类型名、说明、模板名、常用字段名、查询标签都有英文映射', () => {
    const 文案 = [
      ...ACCESS字段类型.flatMap((项) => [项.名称, 项.说明]),
      ...ACCESS建表模板.flatMap((项) => [项.名称, ...项.字段.map((字段) => 字段.名称)]),
      ...ACCESS常用字段.flatMap((项) => [项.名称, 项.字段.名称]),
      ...ACCESS常用查询.map((项) => 项.名称),
      ...ACCESS命令模板.map((项) => 项.名称),
      ...ACCESS筛选运算.map((项) => 项.名称),
    ]
    expect(文案.filter((文本) => /[㐀-鿿]/u.test(翻译界面文本(文本, 'en-US')))).toEqual([])
  })
})

describe('字段名即时校验', () => {
  it('空、重名（不区分大小写）、非法字符分别给出中文原因', () => {
    expect(校验字段名('', [])).toBe('请输入字段名')
    expect(校验字段名('  ', [])).toBe('请输入字段名')
    expect(校验字段名('Name', ['name'])).toBe('字段名重复')
    expect(校验字段名('金额.合计', [])).toBe('字段名不能包含 . ! ` [ ] 等符号')
    expect(校验字段名(' 前导空格', [])).toBe('字段名不能以空格开头')
    expect(校验字段名('a'.repeat(65), [])).toBe('字段名不能超过 64 个字符')
    expect(校验字段名('客户 名称（华东）', ['编号'])).toBeNull()
  })

  it('整表校验逐行返回错误，重名只标在后出现的行', () => {
    const 错误 = 校验字段行([行({ 名称: '编号', 类型: 'COUNTER', 主键: true }), 行({ 名称: '编号' }), 行({ 名称: '' })])
    expect(错误[1]).toBe('字段名重复')
    expect(错误[2]).toBe('请输入字段名')
    expect(错误[0]).toBeUndefined()
  })
})

describe('建表定义生成', () => {
  it('自动编号由类型决定、不再需要额外开关；短文本带长度', () => {
    const 定义 = 生成建表定义([
      行({ 名称: '编号', 类型: 'COUNTER', 主键: true }),
      行({ 名称: '姓名', 类型: 'TEXT', 长度: 50, 必填: true }),
      行({ 名称: '入职日期', 类型: 'DATETIME' }),
    ])
    expect(定义).toEqual({
      字段: [
        { 名称: '编号', 类型: 'COUNTER', 必填: false },
        { 名称: '姓名', 类型: 'TEXT(50)', 必填: true },
        { 名称: '入职日期', 类型: 'DATETIME', 必填: false },
      ],
      主键: ['编号'],
    })
  })

  it('短文本长度留空或越界时按 255 处理', () => {
    expect(生成建表定义([行({ 名称: 'a', 长度: null })]).字段[0].类型).toBe('TEXT(255)')
    expect(生成建表定义([行({ 名称: 'a', 长度: 999 })]).字段[0].类型).toBe('TEXT(255)')
  })

  it('每个快捷模板生成的字段类型与约束和模板定义完全一致', () => {
    for (const 模板 of ACCESS建表模板) {
      const 行列表 = 模板.字段.map((字段) => 行(字段))
      expect(Object.keys(校验字段行(行列表))).toEqual([])
      const 定义 = 生成建表定义(行列表)
      expect(定义.字段.map((项) => 项.名称)).toEqual(模板.字段.map((项) => 项.名称))
      expect(定义.主键).toEqual(模板.字段.filter((项) => 项.主键).map((项) => 项.名称))
      for (const [序号, 字段] of 模板.字段.entries()) {
        const 期望类型 = 字段.类型 === 'TEXT' ? `TEXT(${字段.长度 ?? 255})` : 字段.类型
        expect(定义.字段[序号]).toEqual({ 名称: 字段.名称, 类型: 期望类型, 必填: 字段.必填 === true })
      }
    }
    expect(ACCESS建表模板.map((项) => 项.名称)).toEqual(['人员信息', '订单记录', '商品明细', '日志记录'])
  })
})

describe('从已有表复制结构与类型识别', () => {
  const 表 = {
    name: '客户', type: 'TABLE', primaryKey: ['编号'], indexes: [],
    columns: [
      { name: '编号', type: '', dataType: 3, nullable: false, autoIncrement: true },
      { name: '姓名', type: '', dataType: 130, maxLength: 50, nullable: false },
      { name: '简介', type: '', dataType: 130, maxLength: 0, nullable: true },
      { name: '余额', type: '', dataType: 6, nullable: true },
      { name: '启用', type: '', dataType: 11, nullable: false },
      { name: '注册时间', type: '', dataType: 7, nullable: true },
      { name: '分数', type: '', dataType: 5, nullable: true },
    ],
  }

  it('按 OLE DB 类型码还原中文类型、长度、主键与必填', () => {
    expect(由表结构复制字段行(表).map(({ 名称, 类型, 长度, 主键, 必填 }) => ({ 名称, 类型, 长度, 主键, 必填 }))).toEqual([
      { 名称: '编号', 类型: 'COUNTER', 长度: 255, 主键: true, 必填: false },
      { 名称: '姓名', 类型: 'TEXT', 长度: 50, 主键: false, 必填: true },
      { 名称: '简介', 类型: 'LONGTEXT', 长度: 255, 主键: false, 必填: false },
      { 名称: '余额', 类型: 'CURRENCY', 长度: 255, 主键: false, 必填: false },
      { 名称: '启用', 类型: 'YESNO', 长度: 255, 主键: false, 必填: false },
      { 名称: '注册时间', 类型: 'DATETIME', 长度: 255, 主键: false, 必填: false },
      { 名称: '分数', 类型: 'DOUBLE', 长度: 255, 主键: false, 必填: false },
    ])
  })

  it('录入控件由字段类型决定', () => {
    const 控件 = Object.fromEntries(表.columns.map((字段) => [字段.name, 字段录入控件(字段)]))
    expect(控件).toEqual({ 编号: '自动编号', 姓名: '文本', 简介: '长文本', 余额: '数字', 启用: '开关', 注册时间: '日期', 分数: '数字' })
    expect(字段类型键({ type: 'COUNTER' })).toBe('COUNTER')
    expect(读取类型定义('CURRENCY').名称).toBe('货币')
  })
})

describe('常用查询与命令模板', () => {
  it('标识符按 Access 规则加方括号并转义右括号', () => {
    expect(引用标识符('客户]表')).toBe('[客户]]表]')
  })

  it('查全部、统计行数、最近 100 条生成只读 SQL，最近 100 条按主键倒序', () => {
    const 表 = { name: '订单 明细', primaryKey: ['编号'], columns: [{ name: '编号', type: '', dataType: 3, nullable: false }] }
    expect(生成常用查询SQL('all', 表)).toEqual({ SQL: 'SELECT * FROM [订单 明细]', 参数: [] })
    expect(生成常用查询SQL('count', 表)).toEqual({ SQL: 'SELECT COUNT(*) AS [行数] FROM [订单 明细]', 参数: [] })
    expect(生成常用查询SQL('recent', 表)).toEqual({ SQL: 'SELECT TOP 100 * FROM [订单 明细] ORDER BY [编号] DESC', 参数: [] })
    expect(生成常用查询SQL('recent', { ...表, primaryKey: [] })).toEqual({ SQL: 'SELECT TOP 100 * FROM [订单 明细]', 参数: [] })
  })

  it('按条件筛选使用参数化查询，值不拼进 SQL', () => {
    const 表 = { name: '客户', primaryKey: [], columns: [] }
    expect(生成常用查询SQL('filter', 表, { 字段: '姓名', 运算: 'contains', 值: "O'Brien" })).toEqual({ SQL: 'SELECT * FROM [客户] WHERE [姓名] LIKE ?', 参数: ["%O'Brien%"] })
    expect(生成常用查询SQL('filter', 表, { 字段: '年龄', 运算: 'gt', 值: 30 })).toEqual({ SQL: 'SELECT * FROM [客户] WHERE [年龄] > ?', 参数: [30] })
    expect(生成常用查询SQL('filter', 表, { 字段: '备注', 运算: 'empty' })).toEqual({ SQL: 'SELECT * FROM [客户] WHERE [备注] IS NULL', 参数: [] })
  })

  it('命令模板覆盖 SELECT/INSERT/UPDATE/DELETE/CREATE TABLE，生成可直接修改执行的完整语句', () => {
    const 表 = { name: '客户', primaryKey: ['编号'], columns: [{ name: '编号', type: '', nullable: false, autoIncrement: true }, { name: '姓名', type: '', nullable: true }] }
    const 文本 = ACCESS命令模板.map((项) => 项.生成(表))
    expect(文本.map((项) => 项.split(/\s/)[0])).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE'])
    expect(文本[1]).toBe('INSERT INTO [客户] ([姓名]) VALUES (NULL);')
    expect(文本[3]).toContain('WHERE [编号] = ')
    expect(ACCESS命令模板[0].生成(null)).toBe('SELECT TOP 100 * FROM [表名];')
  })
})
