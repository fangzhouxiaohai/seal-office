import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { 拆分书页, 清除彩色笔迹, 擦除笔画 } from './scanTransforms'
import { 扫描模式列表 } from './scanModes'
import { 生成照片工作表, 证件排版, 生成证件PDF } from './modeExport'
import type { 像素图 } from './imageProcessing'

const 白图 = (宽: number, 高: number): 像素图 => ({ 宽, 高, 数据: new Uint8ClampedArray(宽 * 高 * 4).fill(255) })
const 点 = (图: 像素图, x: number, y: number, 颜色: number[]) => 图.数据.set([...颜色, 255], (y * 图.宽 + x) * 4)
const 读 = (图: 像素图, x: number, y: number) => Array.from(图.数据.slice((y * 图.宽 + x) * 4, (y * 图.宽 + x) * 4 + 3))
const 图片 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWQAAAABJRU5ErkJggg=='), 字 => 字.charCodeAt(0))
const 页 = { 图片, 类型: 'image/png' as const, 宽: 428, 高: 270, 文字: '' }

describe('移动扫描模式', () => {
  it('提供九个独立入口', () => { expect(new Set(扫描模式列表).size).toBe(9) })
  it('按偏离中心的书缝拆分，按阅读顺序保留所有原像素', () => {
    const 图 = 白图(100, 30)
    for (let y = 0; y < 图.高; y++) for (let x = 39; x <= 41; x++) 点(图, x, y, [42, 42, 42])
    点(图, 2, 5, [11, 12, 13]); 点(图, 98, 5, [21, 22, 23])
    const [左, 右] = 拆分书页(图)
    expect(左.宽).toBeGreaterThanOrEqual(39); expect(左.宽).toBeLessThanOrEqual(42)
    expect(左.宽 + 右.宽).toBe(100); expect(读(左, 2, 5)).toEqual([11, 12, 13]); expect(读(右, 98 - 左.宽, 5)).toEqual([21, 22, 23])
    expect(拆分书页(白图(11, 5)).map(页 => 页.宽)).toEqual([6, 5])
  })
  it('擦除红蓝笔迹时保留黑色印刷字；手动擦除能覆盖黑墨且不改动原图', () => {
    const 图 = 白图(30, 20)
    点(图, 5, 5, [180, 23, 30]); 点(图, 8, 5, [23, 32, 151]); 点(图, 15, 10, [10, 10, 10]); 点(图, 28, 18, [22, 22, 22])
    const 彩 = 清除彩色笔迹(图)
    expect(读(彩, 5, 5)).toEqual([255, 255, 255]); expect(读(彩, 8, 5)).toEqual([255, 255, 255]); expect(读(彩, 15, 10)).toEqual([10, 10, 10])
    const 擦 = 擦除笔画(彩, [{ 半径: 0.07, 路径: [{ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }] }])
    expect(读(擦, 15, 10)).toEqual([255, 255, 255]); expect(读(擦, 28, 18)).toEqual([22, 22, 22]); expect(读(图, 5, 5)).toEqual([180, 23, 30])
  })
  it('通用表格保留识别出的行列、空列、前导零和字面公式，无法分列给出错误', () => {
    const 表 = 生成照片工作表('| 编号 | 备注 | 数量 |\n| --- | --- | --- |\n| 001 | | 7 |\n| =A1 | 原文 | 0 |', 1)
    expect(表.单元格.A2.原始值).toBe('001'); expect(表.单元格.B2).toBeUndefined(); expect(表.单元格.C2.原始值).toBe('7')
    expect(表.单元格.A3).toMatchObject({ 原始值: '=A1', 值类型: '文本' })
    expect(生成照片工作表('编号\t备注\n003\t值', 2).name).toContain('2')
    expect(() => 生成照片工作表('只看到普通文字', 1)).toThrow(/行列/)
  })
  it('身份证正反面按同一张 A4 纵向排版，缺反面拒绝导出；其他证件单面逐页', async () => {
    expect(() => 证件排版([页], '身份证')).toThrow(/反面/)
    const 位置 = 证件排版([页, 页], '身份证')[0]; expect(位置[0].y).toBeGreaterThan(位置[1].y); expect(位置[0].width * 25.4 / 72).toBeCloseTo(85.6)
    for (const 种类 of ['护照', '户口本', '其他'] as const) expect(证件排版([页, 页], 种类)).toHaveLength(2)
    const 文档 = await PDFDocument.load(await 生成证件PDF([页, 页], '身份证'))
    expect(文档.getPageCount()).toBe(1); expect(文档.getPage(0).getWidth() * 25.4 / 72).toBeCloseTo(210); expect(文档.getPage(0).getHeight() * 25.4 / 72).toBeCloseTo(297)
  })
})
