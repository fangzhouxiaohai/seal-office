import { describe, it, expect, vi } from 'vitest'
import { 粘贴数据HTML, 粘贴图片文件, 读取系统剪贴板 } from './clipboard'

const 数据 = (项: Record<string, string>, 文件: File[] = []) => ({
  getData: (类型: string) => 项[类型] ?? '',
  files: 文件,
  items: 文件.map(f => ({ kind: 'file', type: f.type, getAsFile: () => f })),
}) as unknown as DataTransfer

describe('粘贴事件数据', () => {
  it('纯文本转为转义后的 HTML', () => {
    expect(粘贴数据HTML(数据({ 'text/plain': '<a>\n第二行' }))).toBe('&lt;a&gt;<br>第二行')
  })
  it('没有文本时返回 null', () => {
    expect(粘贴数据HTML(数据({}))).toBeNull()
  })
  it('截图只有图片数据时取出图片文件', () => {
    const 图 = new File(['x'], 'image.png', { type: 'image/png' })
    expect(粘贴图片文件(数据({}, [图]))).toEqual([图])
    expect(粘贴图片文件(数据({ 'text/plain': '文字' }))).toEqual([])
  })
})

describe('读取系统剪贴板', () => {
  it('截图只有图片时返回图片文件', async () => {
    const 图 = new Blob(['png'], { type: 'image/png' })
    vi.stubGlobal('navigator', { clipboard: { read: async () => [{ types: ['image/png'], getType: async () => 图 }] } })
    const 结果 = await 读取系统剪贴板()
    expect(结果.图片).toHaveLength(1)
    expect(结果.图片[0].type).toBe('image/png')
    expect(结果.文本).toBe('')
    vi.unstubAllGlobals()
  })
  it('文字剪贴板返回文本', async () => {
    vi.stubGlobal('navigator', { clipboard: { read: async () => [{ types: ['text/plain'], getType: async () => new Blob(['甲\t乙'], { type: 'text/plain' }) }] } })
    expect(await 读取系统剪贴板()).toEqual({ 图片: [], 文本: '甲\t乙' })
    vi.unstubAllGlobals()
  })
  it('不支持 read 时退回 readText', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: async () => '纯文本' } })
    expect(await 读取系统剪贴板()).toEqual({ 图片: [], 文本: '纯文本' })
    vi.unstubAllGlobals()
  })
  it('无法读取时抛出中文错误', async () => {
    vi.stubGlobal('navigator', {})
    await expect(读取系统剪贴板()).rejects.toThrow('当前环境无法读取系统剪贴板')
    vi.unstubAllGlobals()
  })
})
