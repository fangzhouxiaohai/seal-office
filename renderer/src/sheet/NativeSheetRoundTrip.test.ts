import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { 读取本地文件内容 } from '../fileOpen'
import { 写出办公文档 } from '../office/writeDocument'
import { 创建工作表, 写入单元格, 设置格式, 设置数据验证, 设置批注, 重算工作簿, type Sheet } from './model'
import { 从Html表格构建工作表 } from './sheetImport'

const require = createRequire(import.meta.url)
const seal = require('../../../main/office/sealFormat.js')
const xlsx = require('../../../main/office/xlsxCodec.js')
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
const original = window.electronAPI
afterEach(() => { window.electronAPI = original })

it('slxls 完整工作簿三轮保存重开，保留动态数组、空表、Unicode、全部编辑元数据且不走 XLSX 转换', async () => {
  const path = 'E:/test/本机完整模型.slxls'
  let data = ''
  const writeXlsx = vi.fn(() => { throw new Error('专属格式不得依赖 XLSX 编解码') })
  window.electronAPI = {
    readFile: async () => ({ 成功: true, 内容: data, 二进制: true, 扩展名: 'slxls', 文件指纹: 'native-sheet-proof' }),
    office: { writeXlsx,
      writeSeal: async (type: string, payload: unknown) => ({ 成功: true, 数据: (await seal.writeSeal(type, payload)).toString('base64') }),
      readSeal: async (extension: string, encoded: string) => ({ 成功: true, ...await seal.readSeal(extension, Buffer.from(encoded, 'base64')) }),
    },
  } as any
  let main = 写入单元格(创建工作表('动态 𠀀', 12, 8), 'D1', '3')
  main = 写入单元格(main, 'A1', '=SEQUENCE(D1,2,10)')
  main = 写入单元格(main, 'D2', '00123')
  main = 写入单元格(main, 'D3', '中文 العربية e\u0301 👩🏽‍💻 &<>')
  main = 设置批注(main, 'D3', '编辑批注𠮷')
  main = 设置格式(main, 'D3', { 加粗: true, 自动换行: true, 字体颜色: '#2463EB', 填充颜色: '#FFF3B0', 边框: { 下: true }, 边框颜色: { 下: '#123456' } })
  main = 设置数据验证(main, 'D4', { 类型: '列表', 选项: ['待办', '完成'], 允许空白: true })
  main = { ...main, 冻结: { 行: 1, 列: 2 }, 筛选: { 列: 3, 值: '00123' }, 日期系统1904: true, 公式兼容模式: 'WPS',
    页面设置: { 方向: '跟随打印机', 页边距: '窄', 纸张大小: 'Letter' },
    图片: [{ id: 'native-picture', 格式: 'png', 数据: png, 行: 6, 列: 2, 宽: 32, 高: 24 }],
  }
  const blank = { ...创建工作表('预留空表'), 日期系统1904: true, 公式兼容模式: 'WPS' as const }
  let sheets: Sheet[] = [main, blank]
  for (let cycle = 0; cycle < 3; cycle++) {
    sheets = 重算工作簿([写入单元格(sheets[0], 'D1', `${cycle + 2}`), sheets[1]])
    const payload = { 工作表列表: sheets, 警告: [] }
    const result = await 写出办公文档('table', path, undefined, undefined, payload)
    data = result.数据
    const decoded = await seal.readSeal('slxls', Buffer.from(data, 'base64'))
    expect(decoded.工作表列表).toEqual(sheets)
    expect(decoded.警告).toEqual([])
    const opened = await 读取本地文件内容(path)
    expect(opened.类型).toBe('table')
    expect(opened.工作表列表).toEqual(sheets)
    expect(opened.文件指纹).toBe('native-sheet-proof')
    sheets = opened.工作表列表 as Sheet[]
    expect(sheets[0].单元格[`B${cycle + 2}`].计算值).toBe(10 + (cycle + 1) * 2 + 1)
    expect(sheets[0].单元格.D3.批注).toBe('编辑批注𠮷')
    expect(sheets[0].图片![0].数据).toBe(png)
    expect(sheets[1].单元格).toEqual({})
  }
  expect(writeXlsx).not.toHaveBeenCalled()
})

it('来源公式的布尔/错误数组缓存保存为 slxls 后逐字段保留，不重写为字符串', async () => {
  const imported = await xlsx.读取xlsx(await xlsx.写入xlsx({ 工作表: [{ 名称: '未来函数缓存', 数据: [[
    { 公式: '_xlfn.UNKNOWN_ARRAY()', 数组范围: 'A1:C1', 动态数组: true, 结果: 1 },
    { 值: false }, { 值: { error: '#N/A' } },
  ]] }] }))
  const source = imported.工作表列表[0]
  const sheet = 重算工作簿([从Html表格构建工作表(source.html, source.名称, source.页面设置, source.元数据)!])[0]
  expect(sheet.单元格.A1.公式来源!.数组缓存).toEqual({ B1: false, C1: { error: '#N/A' } })
  let payload = { 工作表列表: [sheet], 警告: [] }
  for (let cycle = 0; cycle < 3; cycle++) {
    const result = await seal.readSeal('slxls', await seal.writeSeal('table', payload))
    expect(result.工作表列表).toEqual(payload.工作表列表)
    expect(result.工作表列表[0].单元格.B1.布尔结果).toBe(false)
    expect(result.工作表列表[0].单元格.C1.计算错误).toBe(true)
    payload = { 工作表列表: result.工作表列表, 警告: result.警告 }
  }
})
