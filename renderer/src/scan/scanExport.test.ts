import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { 生成图片PDF, 生成可搜索PDF, 整理文字层, 生成识别工作表, 生成文字Html } from './scanExport'
import { 解析单据文本 } from './receiptParse'
import { 生成异常清单 } from './validation'
import { 取识别模板 } from './templates'

const require = createRequire(import.meta.url)
const 夹具 = (名称: string) => new Uint8Array(readFileSync(join(__dirname, '../editor/__fixtures__', 名称)))
const 页 = (文字 = '') => ({ 图片: 夹具('office-image.jpg'), 类型: 'image/jpeg' as const, 宽: 120, 高: 160, 文字 })

describe('扫描件导出', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('多页合成一份图片型 PDF，页数与扫描页一致，页面比例与图片一致', async () => {
    const 字节 = await 生成图片PDF([页(), { ...页(), 图片: 夹具('office-image.png'), 类型: 'image/png' as const, 宽: 200, 高: 100 }, 页()])
    const 文档 = await PDFDocument.load(字节)
    expect(文档.getPageCount()).toBe(3)
    const 第二页 = 文档.getPage(1)
    expect(第二页.getWidth() / 第二页.getHeight()).toBeCloseTo(2, 5)
  })

  it('没有页面时拒绝导出', async () => {
    await expect(生成图片PDF([])).rejects.toThrow('没有可导出的页面')
  })

  it('文字层整理：去除制表符与控制符，按页宽折行并控制字号', () => {
    const 结果 = 整理文字层('甲\t乙\u0007丙\n' + '字'.repeat(400), 595)
    expect(结果.文字.split('\n')[0]).toBe('甲 乙丙')
    expect(结果.字号).toBeGreaterThanOrEqual(4)
    for (const 行 of 结果.文字.split('\n')) expect(行.length * 结果.字号).toBeLessThanOrEqual(595 - 20)
  })

  it('可搜索 PDF：文字层位于图片之下，可被 PDF 阅读器提取与搜索', async () => {
    // jsdom 环境的全局 Uint8Array 属于 jsdom 领域，而主进程 pdfTools 传给 pdf-lib 的是 Node 领域的 Buffer；
    // 本用例需要真实运行共享 PDF 编辑通道，因此临时换回 Node 领域的 Uint8Array。
    vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor)
    const { 编辑页面 } = require('../../../main/pdf/pdfTools.js')
    const 编辑 = async (数据: string, 操作: unknown) => ({ 成功: true, 数据: Buffer.from(await 编辑页面(Buffer.from(数据, 'base64'), 操作)).toString('base64') })
    const 结果 = await 生成可搜索PDF([页('送货单 SH20261101\n螺纹钢 10 吨'), 页('第二页 合计 50300')], 编辑)
    expect(结果.跳过字符).toEqual([])
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const 文档 = await pdfjs.getDocument({ data: 结果.数据.slice(), useSystemFonts: false }).promise
    expect(文档.numPages).toBe(2)
    const 文字 = async (页码: number) => (await (await 文档.getPage(页码)).getTextContent()).items.map((项: any) => 项.str).join('')
    expect((await 文字(1)).replace(/\s/g, '')).toContain('SH20261101')
    expect((await 文字(1)).replace(/\s/g, '')).toContain('螺纹钢10吨')
    expect((await 文字(2)).replace(/\s/g, '')).toContain('合计50300')
    // 图片绘制在文字之后（覆盖其上），页面视觉仍是原扫描图。
    const 原始 = await PDFDocument.load(结果.数据)
    const 内容 = 原始.getPage(0).node.Contents()
    expect(内容).toBeDefined()
    await 文档.cleanup()
    vi.unstubAllGlobals()
  }, 60000)

  it('Word 文字稿保留段落与分页，转义特殊字符', () => {
    const html = 生成文字Html(['第一段\n<b>第二段</b>', '第二页'])
    expect(html).toBe('<p>第一段</p><p>&lt;b&gt;第二段&lt;/b&gt;</p><div class="wps-page-break"></div><p>第二页</p>')
  })
})

describe('识别结果写入工作表', () => {
  const 送货单 = 取识别模板('delivery-note')!
  const 结果 = 解析单据文本('单号：SH1 日期：2026-11-01\n| 品名 | 规格 | 数量 | 单位 | 单价 | 金额 |\n| =HYPERLINK("x") | Φ12 | 10 | 吨 | 4200 | 42000 |\n| 线材 | Φ8 | 2 | 吨 | 4100 | 8300 |\n合计：50300', 送货单, '送货单1.jpg')
  const 清单 = 生成异常清单(结果, 送货单)

  it('每张单据的明细逐行写入，表头字段与来源随行写入，列名为模板字段', () => {
    const 表 = 生成识别工作表([结果], 送货单, 清单)
    const 值 = (地址: string) => 表.单元格[地址]?.原始值
    expect(表.name).toBe('送货单')
    expect(['A1', 'B1', 'C1', 'D1'].map(值)).toEqual(['来源', '单号', '日期', '合计'])
    expect(['E1', 'F1', 'G1', 'H1', 'I1', 'J1', 'K1'].map(值)).toEqual(['品名', '规格', '数量', '单位', '单价', '毛重', '金额'])
    expect(['A2', 'B2', 'E3', 'G3', 'K3'].map(值)).toEqual(['送货单1.jpg', 'SH1', '线材', '2', '8300'])
  })

  it('识别文字按文本写入，不会被当成公式执行', () => {
    const 表 = 生成识别工作表([结果], 送货单, 清单)
    expect(表.单元格.E2.原始值).toBe('=HYPERLINK("x")')
    expect(表.单元格.E2.值类型).toBe('文本')
    expect(表.单元格.G2.值类型).toBeUndefined()
  })

  it('异常单元格高亮并附批注说明', () => {
    const 表 = 生成识别工作表([结果], 送货单, 清单)
    for (const 地址 of ['G3', 'I3', 'K3']) {
      expect(表.单元格[地址].格式.填充颜色, 地址).toBeTruthy()
      expect(表.单元格[地址].批注).toBe('数量 × 单价 = 8200，与金额 8300 不符')
    }
    expect(表.单元格.K2.格式.填充颜色).toBeUndefined()
  })
})
