import { describe, expect, it } from 'vitest'
import { 构建新文件, 校验创建文件 } from './createDocument'
import { 解析助手回复, 预览文字修改, 预览演示修改 } from './proposal'
import { 创建演示文稿 } from '../ppt/deck'
import { 创建表格 } from '../ppt/model/elements'
import { htmlToDocxModel } from '../editor/commands'
import { 构建演示保存模型 } from '../ppt/saveModel'
import { 导出为Xlsx } from '../sheet/sheetExport'
import type { Sheet } from '../sheet/model'
import type { 演示文稿 } from '../ppt/deck'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { 写入xlsx, 读取xlsx } = require('../../../main/office/xlsxCodec')
const { 写入pptx, 读取pptx } = require('../../../main/office/pptxCodec')
const { 生成docx } = require('../../../main/office/docxWriter')
const { 读取docx } = require('../../../main/office/docxReader')

describe('助手新建与扩展修改', () => {
  it('新建文字实际保存重开后保留内容，标签不会成为可执行 HTML', async () => {
    const 候选 = 构建新文件({ 种类: '创建文件', 类型: 'word', 名称: '工作计划', 内容: '年度计划\n<script>alert(1)</script>\n预算100元' })
    const 模型 = htmlToDocxModel(候选.内容 as string)
    expect(候选.名称).toBe('工作计划.docx')
    expect(模型.段落).toHaveLength(3)
    expect(JSON.stringify(模型)).toContain('预算100元')
    expect((候选.内容 as string)).not.toContain('<script>')
    const 重开 = await 读取docx(await 生成docx(模型))
    expect(JSON.stringify(重开)).toContain('预算100元')
  })
  it('表格实际保存重开后保留工作表、值和公式', async () => {
    const 候选 = 构建新文件({ 种类: '创建文件', 类型: 'table', 名称: '预算.xlsx', 内容: JSON.stringify([{ 名称: '预算', 行: [['项目', '金额'], ['场地', '100'], ['设备', '200'], ['合计', '=SUM(B2:B3)']] }]) })
    const 字节 = await 写入xlsx(导出为Xlsx(候选.内容 as Sheet[]))
    const 重开 = await 读取xlsx(字节)
    expect(JSON.stringify(重开)).toContain('场地')
    expect(JSON.stringify(重开)).toContain('SUM(B2:B3)')
    expect(JSON.stringify(重开)).toContain('预算')
  })
  it('新建演示的内容和助手动画经过 PPTX 编解码后保留', async () => {
    const 候选 = 构建新文件({ 种类: '创建文件', 类型: 'ppt', 名称: '汇报', 内容: JSON.stringify([{ 标题: '季度汇报', 要点: ['营收增长20%', '客户数100'] }, { 标题: '下一步', 要点: ['扩展产品'] }]) })
    const 文稿 = 候选.内容 as 演示文稿
    const 修改 = 预览演示修改(文稿, [{ 种类: '演示切换', 页码: 1, 效果: '淡入淡出', 持续毫秒: 700 }, { 种类: '演示对象动画', 页码: 1, 对象标识: 文稿.幻灯片列表[0].文本框列表[0].id, 效果: '淡入', 触发: '单击', 持续毫秒: 600 }])
    const 字节 = await 写入pptx(构建演示保存模型(修改, []))
    const 重开 = await 读取pptx(字节)
    expect(JSON.stringify(重开)).toContain('营收增长20%')
    expect(JSON.stringify(重开)).toContain('淡入淡出')
    expect(JSON.stringify(重开)).toContain('持续毫秒":600')
    expect(JSON.stringify(文稿)).not.toContain('动画序列')
  })
  it.each(['../覆盖.docx', 'CON.docx', ' con.docx', '预算.xlsx', 'a/b', '末尾.', 'COM1'])('拒绝无效名称或跨类型扩展名 %s', (名称) => {
    expect(() => 校验创建文件({ 类型: 'word', 名称, 内容: '正文' })).toThrow()
  })
  it('无效工作表和超大页数不会生成半个候选', () => {
    expect(() => 构建新文件({ 种类: '创建文件', 类型: 'table', 名称: '数据', 内容: JSON.stringify([{ 名称: '正常', 行: [['1']] }, { 名称: '正常', 行: [['2']] }]) })).toThrow('重复')
    expect(() => 构建新文件({ 种类: '创建文件', 类型: 'ppt', 名称: '汇报', 内容: JSON.stringify(Array.from({ length: 61 }, () => ({ 标题: '页', 要点: ['正文'] }))) })).toThrow('60')
  })
  it('长演示保留完整文字并适配字号，极长页明确要求拆页', async () => {
    const 标题 = '阶段计划'.repeat(30), 要点 = Array.from({ length: 6 }, () => '具体行动'.repeat(20))
    const 候选 = 构建新文件({ 种类: '创建文件', 类型: 'ppt', 名称: '长内容', 内容: JSON.stringify([{ 标题, 要点 }]) }).内容 as 演示文稿
    expect(候选.幻灯片列表[0].文本框列表[0].字号).toBeLessThan(34)
    expect(候选.幻灯片列表[0].文本框列表[1].字号).toBeLessThan(26)
    const 重开 = await 读取pptx(await 写入pptx(构建演示保存模型(候选, [])))
    expect(JSON.stringify(重开)).toContain(标题)
    expect(JSON.stringify(重开)).toContain(要点[0])
    expect(() => 构建新文件({ 种类: '创建文件', 类型: 'ppt', 名称: '过长', 内容: JSON.stringify([{ 标题: '标题', 要点: Array.from({ length: 12 }, () => '长'.repeat(130)) }]) })).toThrow('拆成更多页')
  })
  it('向空白文档插入内容，原始段落定位不因新增段落变化', () => {
    expect(预览文字修改('', [{ 种类: '文字插入', 位置: '末尾', 内容: '开场\n正文' }])).toBe('<p>开场</p><p>正文</p>')
    expect(预览文字修改('<p>原始</p>', [{ 种类: '文字插入', 位置: '开头', 内容: '前言' }, { 种类: '文字替换', 段落标识: '段落-1', 查找: '原始', 替换为: '新正文' }])).toBe('<p>前言</p><p>新正文</p>')
    expect(() => 预览文字修改('<p>原始</p>', [{ 种类: '文字插入', 位置: '之后', 段落标识: '段落-1', 原文: '错误', 内容: '尾部' }])).toThrow('原文')
  })
  it('演示原生表格修改保持配色，错误原值和动画对象拒绝执行', () => {
    const 文稿 = 创建演示文稿(), 表 = 创建表格(2, 2)
    表.表格!.单元格[0][0].文本 = '原指标'
    文稿.幻灯片列表[0].对象列表 = [表]
    const 候选 = 预览演示修改(文稿, [{ 种类: '演示表格写入', 页码: 1, 对象标识: 表.id, 行: 1, 列: 1, 原值: '原指标', 新值: '新指标' }])
    expect(候选.幻灯片列表[0].对象列表![0].表格!.单元格[0][0]).toEqual({ ...表.表格!.单元格[0][0], 文本: '新指标' })
    expect(() => 预览演示修改(文稿, [{ 种类: '演示表格写入', 页码: 1, 对象标识: 表.id, 行: 1, 列: 1, 原值: '错误', 新值: '新指标' }])).toThrow()
    expect(() => 预览演示修改(文稿, [{ 种类: '演示对象动画', 页码: 1, 对象标识: '缺失', 效果: '淡入', 触发: '单击', 持续毫秒: 500 }])).toThrow('引用')
  })
  it('不支持的操作和过长插入内容明确拒绝', () => {
    expect(() => 解析助手回复(JSON.stringify({ 回复: '候选', 修改: [{ 种类: '删除文件', 路径: 'C:/' }] }))).toThrow('不支持')
    expect(() => 解析助手回复(JSON.stringify({ 回复: '候选', 修改: [{ 种类: '文字插入', 位置: '末尾', 内容: '字'.repeat(200001) }] }))).toThrow('过长')
  })
})
