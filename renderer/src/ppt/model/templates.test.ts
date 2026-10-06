import { describe, expect, it } from 'vitest'
import { 创建演示文稿, 创建幻灯片, type 演示文稿 } from '../deck'
import { 内置主题列表, 默认主题标识 } from './themes'
import { 创建默认母版 } from './masters'
import {
  从文稿创建模板,
  创建模板库,
  应用本地模板,
  收集模板资源,
  读取模板库,
  预览本地模板,
} from './templates'

const 默认主题 = 内置主题列表.find((项) => 项.标识 === 默认主题标识)!

const 造文稿 = (): 演示文稿 => {
  const 母版 = 创建默认母版()
  const 版式 = 母版.版式列表[1]
  const 页 = 创建幻灯片('标题和内容', '一页')
  页.版式标识 = 版式.标识
  页.母版标识 = 母版.标识
  页.备注 = '演讲备注'
  页.对象列表 = [{ id: '图片一', 类型: '图片', x: 10, y: 10, width: 200, height: 200, 资源标识: '指纹一' }]
  return {
    ...创建演示文稿(),
    主题: 默认主题,
    母版列表: [母版],
    页面尺寸: { 宽: 960, 高: 540 },
    幻灯片列表: [页],
    资源索引: { 指纹一: { 指纹: '指纹一', 类型: 'image/png', 字节数: 64 } },
  }
}

describe('本地模板预览、应用与资源归档', () => {
  it('从文稿创建模板保留主题、母版、页面尺寸与资源条目', () => {
    const 模板 = 从文稿创建模板(造文稿(), '我的模板')

    expect(模板.名称).toBe('我的模板')
    expect(模板.主题.标识).toBe(默认主题标识)
    expect(模板.母版列表).toHaveLength(1)
    expect(模板.页面尺寸).toEqual({ 宽: 960, 高: 540 })
    expect(模板.资源).toEqual([{ 标识: '指纹一', 类型: 'image/png', 数据: '' }])
  })

  it('预览本地模板不修改文稿', () => {
    const 文稿 = 造文稿()
    const 模板 = 从文稿创建模板(造文稿(), '模板')
    const 快照 = JSON.stringify(文稿)

    const 预览 = 预览本地模板(文稿, 模板)

    expect(JSON.stringify(文稿)).toBe(快照)
    expect(预览.文稿.主题?.标识).toBe(模板.主题.标识)
    expect(预览.变更.更新文本框).toBeGreaterThanOrEqual(0)
  })

  it('应用本地模板合并资源索引并保留文字、图片、备注与链接', () => {
    const 模板来源 = 造文稿()
    const 模板 = 从文稿创建模板(模板来源, '模板')
    const 目标 = 造文稿()
    目标.幻灯片列表[0].文本框列表[0].text = '原标题'
    目标.幻灯片列表[0].文本框列表[0].颜色引用 = '文本1'
    目标.幻灯片列表[0].文本框列表[0].颜色 = 默认主题.配色.文本1
    const 目标框 = 目标.幻灯片列表[0].文本框列表[0]
    const 目标图片 = 目标.幻灯片列表[0].对象列表![0]

    const 结果 = 应用本地模板(目标, 模板)

    expect(结果.幻灯片列表[0].文本框列表[0].id).toBe(目标框.id)
    expect(结果.幻灯片列表[0].文本框列表[0].text).toBe('原标题')
    expect(结果.幻灯片列表[0].对象列表![0]).toEqual(目标图片)
    expect(结果.幻灯片列表[0].备注).toBe('演讲备注')
    expect(结果.资源索引?.指纹一.类型).toBe('image/png')
    expect(结果.母版列表?.[0].标识).toBe(创建默认母版().标识)
    expect(结果.页面尺寸).toEqual({ 宽: 960, 高: 540 })
  })

  it('收集模板资源列出背景引用与缺失', () => {
    const 模板 = 从文稿创建模板(造文稿(), '模板')
    模板.主题 = { ...模板.主题, 背景: { 类型: '图片', 资源标识: '指纹一' } }
    模板.资源 = []
    const 结果 = 收集模板资源(模板)
    expect(结果.引用).toEqual(['指纹一'])
    expect(结果.缺失).toEqual(['指纹一'])
    expect(() => 应用本地模板(造文稿(), 模板)).toThrow(/资源/)
  })

  it('模版库保存、列出与删除', () => {
    const 数据 = new Map<string, string>()
    const 后端 = {
      getItem: (键: string) => 数据.get(键) ?? null,
      setItem: (键: string, 值: string) => { 数据.set(键, 值) },
      removeItem: (键: string) => { 数据.delete(键) },
    }
    const 库 = 创建模板库(后端)
    const 模板 = 从文稿创建模板(造文稿(), '库模板')

    库.保存(模板)
    expect(读取模板库(库).map((项) => 项.名称)).toEqual(['库模板'])
    库.删除(模板.标识)
    expect(读取模板库(库)).toEqual([])
  })

  it('拒绝损坏的模板数据', () => {
    expect(() => 从文稿创建模板({ ...造文稿(), 主题: undefined }, '模板')).toThrow(/主题/)
    expect(() => 应用本地模板(造文稿(), null as never)).toThrow(/模板/)
  })
})
