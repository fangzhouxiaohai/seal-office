import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { 从Html表格构建工作表 } from './sheetImport'
import { 导出为Xlsx, 导出为Html表格 } from './sheetExport'
import { 读取单元格, 写入单元格, 创建工作表, 插入列, 删除列, 设置格式 } from './model'

const require = createRequire(import.meta.url)
const { 写入xlsx, 读取xlsx } = require('../../../main/office/xlsxCodec')
const { writeSeal, readSeal } = require('../../../main/office/sealFormat')
const ExcelJS = require('exceljs')

it('整列默认布局不扩大编辑范围，标准与专属格式往返仍保存远端默认格式', async () => {
  const 布局 = [{ 起列: 0, 止列: 16383, 宽度: 63, 格式: { 字体: '宋体', 字号: 12 } }]
  const 表 = 从Html表格构建工作表('<table><tr><td>合成内容</td></tr></table>', '布局', undefined, {
    列布局: 布局, 默认行高: 20.8, 默认列宽: 63, 视图: { 缩放: 70 },
    列宽: Object.fromEntries(Array.from({ length: 16384 }, (_, 列) => [列, 63])),
    单元格格式: { R39: { 加粗: true } },
  } as any)!
  expect(表.列数).toBe(18)
  expect(表.行数).toBe(39)
  expect(表.列宽[0]).toBe(63)
  expect(表.行高[0]).toBe(20.8)
  expect((表 as any).列布局).toEqual(布局)
  expect((表 as any).视图).toEqual({ 缩放: 70 })
  const 专属 = await readSeal('slxls', await writeSeal('table', { 工作表列表: [表] }))
  const 模型 = 导出为Xlsx(专属.工作表列表)!
  expect((模型.工作表[0] as any).列布局).toEqual(布局)
  const 读回 = await 读取xlsx(await 写入xlsx(模型))
  expect(读回.工作表列表[0].元数据.列布局.some((项: any) => 项.止列 === 16383 && 项.格式.字体 === '宋体')).toBe(true)
  expect(读回.工作表列表[0].元数据.视图.缩放).toBe(70)
})

it('实际远端数据、合并和验证仍决定编辑边界，不能为提速截断', () => {
  const 表 = 从Html表格构建工作表('<table><tr><td>合成内容</td></tr></table>', '保留', undefined, {
    单元格格式: { AZ120: { 加粗: true } },
    合并区域: ['AX119:AZ120'],
    单元格验证: { BA121: { 类型: '整数', 最小值: 1, 最大值: 5, 允许空白: true } },
  })!
  expect(表.行数).toBe(121)
  expect(表.列数).toBe(53)
  expect(表.单元格.AZ120.格式.加粗).toBe(true)
  expect(表.单元格.BA121.数据验证).toBeDefined()
})

it('旧转换记录的远端列宽仍可保存，不能因缩小编辑范围丢失', () => {
  const 表 = 从Html表格构建工作表('<table><tr><td>内容</td></tr></table>', '旧转换', undefined, { 列宽: { 0: 60, 16383: 126 } })!
  expect(表.列数).toBeLessThan(30)
  expect(表.列布局).toEqual([{ 起列: 0, 止列: 0, 宽度: 60 }, { 起列: 16383, 止列: 16383, 宽度: 126 }])
})

it('空白格继承整列格式，输入及插入删除列后默认布局仍对齐', () => {
  let 表 = 从Html表格构建工作表('<table><tr><td>内容</td></tr></table>', '继承', undefined, {
    列布局: [{ 起列: 1, 止列: 16383, 宽度: 63, 格式: { 字体: '宋体', 字号: 12 } }],
  })!
  expect(读取单元格(表, 'B2').格式).toMatchObject({ 字体: '宋体', 字号: 12 })
  表 = 写入单元格(表, 'B2', '123')
  expect(表.单元格.B2.格式.字体).toBe('宋体')
  表 = 插入列(表, 0)
  expect(表.列布局?.[0]).toMatchObject({ 起列: 2, 止列: 16383 })
  expect(读取单元格(表, 'C3').格式.字体).toBe('宋体')
  表 = 删除列(表, 0)
  expect(表.列布局?.[0]).toMatchObject({ 起列: 1, 止列: 16382 })
})

it('打印和网页导出使用来源字号的点单位', () => {
  const 表 = 从Html表格构建工作表('<table><tr><td>字号</td></tr></table>', '字号', undefined, { 单元格格式: { A1: { 字号: 12 } } })!
  expect(导出为Html表格(表, '字号')).toContain('font-size: 12pt')
})

it('在继承列格式的空白格上加粗不会清除字体、填充和数字格式', () => {
  const 表 = 从Html表格构建工作表('<table><tr><td>内容</td></tr></table>', '格式继承', undefined, {
    列布局: [{ 起列: 1, 止列: 3, 格式: { 字体: '宋体', 字号: 12, 填充颜色: '#FF0000', 数字格式: '百分比', 小数位: 2 } }],
  })!
  const 修改 = 写入单元格(设置格式(表, 'B2', { 加粗: true }), 'B2', '0.5')
  expect(修改.单元格.B2.格式).toMatchObject({ 字体: '宋体', 填充颜色: '#FF0000', 加粗: true, 数字格式: '百分比' })
  expect(修改.单元格.B2.显示值).toBe('50.00%')
})

it('编辑余量不写成额外数据，连续保存重开工作区尺寸保持稳定', async () => {
  const html = `<table>${Array.from({ length: 39 }, (_, 行) => `<tr>${Array.from({ length: 18 }, (_, 列) => `<td>${行 === 38 && 列 === 17 ? '末格' : ''}</td>`).join('')}</tr>`).join('')}</table>`
  let 表 = 从Html表格构建工作表(html, '稳定范围', undefined, { 默认行高: 20.8, 默认列宽: 63, 列布局: [{ 起列: 0, 止列: 16383, 宽度: 63 }] })!
  const 初始尺寸 = [表.行数, 表.列数]
  for (let 次数 = 0; 次数 < 3; 次数++) {
    const 结果 = await 读取xlsx(await 写入xlsx(导出为Xlsx(表)))
    const 来源 = 结果.工作表列表[0]
    表 = 从Html表格构建工作表(来源.html, 来源.名称, 来源.页面设置, 来源.元数据)!
    expect([表.行数, 表.列数]).toEqual(初始尺寸)
    expect(表.单元格.R39.原始值).toBe('末格')
  }
})

it.each([{}, { font: { name: 'Arial', size: 12 } }])('显式单元格样式不会在保存时重新套用列默认样式：%j', async 样式 => {
  const 工作簿 = new ExcelJS.Workbook(), 原表 = 工作簿.addWorksheet('显式格式')
  原表.getColumn(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } }
  原表.getColumn(1).numFmt = '0.00%'
  原表.getCell('A1').value = 0.5
  原表.getCell('A1').style = 样式
  const 读入 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
  const 来源 = 读入.工作表列表[0]
  const 表 = 从Html表格构建工作表(来源.html, 来源.名称, 来源.页面设置, 来源.元数据)!
  expect(表.单元格.A1.显示值).toBe('0.5')
  const 字节 = await 写入xlsx(导出为Xlsx(表))
  const 独立读回 = new ExcelJS.Workbook()
  await 独立读回.xlsx.load(字节)
  const 格 = 独立读回.worksheets[0].getCell('A1')
  expect(格.numFmt).toBeUndefined()
  expect(格.fill?.fgColor).toBeUndefined()
  const 结果 = await 读取xlsx(字节)
  const 重开 = 从Html表格构建工作表(结果.html, '显式格式', undefined, 结果.工作表列表[0].元数据)!
  expect(重开.单元格.A1.显示值).toBe('0.5')
})

it('标准文件缩放受标准范围约束，专属模型保留用户大倍率视图', async () => {
  const 表 = 从Html表格构建工作表('<table><tr><td>缩放</td></tr></table>')!
  表.视图 = { 缩放: 6400, 普通缩放: 8.33, 显示网格线: false }
  const 模型 = 导出为Xlsx(表)!
  expect(模型.工作表[0].视图).toEqual({ 缩放: 400, 普通缩放: 10, 显示网格线: false })
  expect(表.视图.缩放).toBe(6400)
  const 原生 = await readSeal('slxls', await writeSeal('table', { 工作表列表: [表] }))
  expect(原生.工作表列表[0].视图.缩放).toBe(6400)
})

it('旧版大范围模型只导出实际单元格，不生成百万级空白占位', async () => {
  const 表 = 写入单元格(创建工作表('旧范围', 44, 16384), 'XFD39', '合成远端标识')
  const 模型 = 导出为Xlsx([表])!
  const 数据 = 模型.工作表[0].数据
  expect(数据.length).toBe(39)
  expect(数据.slice(0, 38).every((行) => Object.keys(行).length === 0)).toBe(true)
  expect(Object.keys(数据[38])).toEqual(['16383'])
  expect(数据[38][16383]).toBe('合成远端标识')
  const 字节 = await 写入xlsx(模型)
  expect(字节.length).toBeLessThan(50000)
})
