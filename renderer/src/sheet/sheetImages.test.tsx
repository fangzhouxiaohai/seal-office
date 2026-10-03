import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import GridView from './GridView'
import { 创建工作表, 插入行, 删除列, 添加图片, 删除图片 } from './model'
import { 从Html表格构建工作表 } from './sheetImport'
import { 导出为Xlsx } from './sheetExport'
import { 读取xlsx, 写入xlsx } from '../../../main/office/xlsxCodec.js'

const 图片 = {
  id: '图片一',
  格式: 'png' as const,
  数据: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg==',
  行: 1,
  列: 2,
  宽: 40,
  高: 30,
}

describe('工作表图片闭环', () => {
  it('图片随工作表模型保存，并在行列操作时保持锚点', () => {
    const 表 = 添加图片(创建工作表('图片', 4, 4), 图片)
    expect(表.图片).toEqual([图片])
    const 插行后 = 插入行(表, 1)
    expect(插行后.图片?.[0]).toMatchObject({ 行: 2, 列: 2 })
    const 删列后 = 删除列(插行后, 1)
    expect(删列后.图片?.[0]).toMatchObject({ 行: 2, 列: 1 })
    expect(删除图片(删列后, 图片.id).图片).toEqual([])
    const 边界图 = 添加图片(创建工作表('边界', 500, 50), { ...图片, 行: 499, 列: 49 })
    expect(() => 插入行(边界图, 0)).toThrow('图片')
  })

  it('XLSX 写入模型保留图片，并从读取元数据恢复图片', () => {
    const 表 = 添加图片(创建工作表('图片', 4, 4), 图片)
    expect(导出为Xlsx(表)?.工作表[0].图片).toEqual([图片])
    const 重新导入 = 从Html表格构建工作表('<table><tr><td>内容</td></tr></table>', '图片', undefined, { 图片: [图片] })
    expect(重新导入?.图片).toEqual([图片])
    const 远处图片 = { ...图片, 行: 15, 列: 20 }
    const 只有远处图片 = 从Html表格构建工作表('<table><tr><td></td></tr></table>', '图片', undefined, { 图片: [远处图片] })
    expect(只有远处图片?.图片).toEqual([远处图片])
    expect(只有远处图片?.行数).toBeGreaterThan(远处图片.行)
    expect(只有远处图片?.列数).toBeGreaterThan(远处图片.列)
  })

  it('渲染模型经主进程编码与解码后恢复图片内容、位置和尺寸', async () => {
    const 原表 = 添加图片(创建工作表('图片往返', 8, 8), 图片)
    const 写入模型 = 导出为Xlsx(原表)
    expect(写入模型).not.toBeNull()
    const 文件字节 = await 写入xlsx(写入模型!)
    const 读取结果 = await 读取xlsx(文件字节)
    expect(读取结果.警告).not.toContain('图片或媒体未导入')
    expect(读取结果.警告).not.toContain('绘图对象未导入')
    if (!读取结果.工作表列表) throw new Error('工作簿未返回工作表')
    const 表数据 = 读取结果.工作表列表[0]
    const 恢复表 = 从Html表格构建工作表(表数据.html, 表数据.名称, undefined, 表数据.元数据)
    const { id: _本机标识, ...持久图片 } = 图片
    expect(恢复表?.图片).toMatchObject([持久图片])
    expect(导出为Xlsx(恢复表!)?.工作表[0].图片).toMatchObject([持久图片])
  })

  it('网格显示图片并允许删除', () => {
    const 删除 = vi.fn()
    const 表 = 添加图片(创建工作表('图片', 4, 4), 图片)
    render(<GridView
      工作表={表}
      选区={{ 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 0 } }}
      编辑地址={null}
      编辑值=""
      on选中={() => {}}
      on双击={() => {}}
      on编辑值变化={() => {}}
      on提交编辑={() => {}}
      on取消编辑={() => {}}
      on选中整列={() => {}}
      on选中整行={() => {}}
      on全选={() => {}}
      on删除图片={删除}
    />)
    const 图像 = screen.getByRole('img', { name: '工作表图片' }) as HTMLImageElement
    expect(图像.src).toContain('data:image/png;base64,')
    fireEvent.click(screen.getByRole('button', { name: '删除 C2 的图片' }))
    expect(删除).toHaveBeenCalledWith(图片.id)
  })
})
