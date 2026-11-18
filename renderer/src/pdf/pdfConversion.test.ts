import { describe, it, expect, vi } from 'vitest'
import { 转换PDF文字, 转换PDF图片 } from './pdfConversion'
import JSZip from 'jszip'

const mocks = vi.hoisted(() => ({
  close:vi.fn(), writeXlsx:vi.fn(), writeDocx:vi.fn(), text:vi.fn(), permissions:vi.fn(),
}))
vi.mock('./pdfLoader', () => ({ 载入PDF:async () => ({
  文档:{ numPages:2, getPermissions:mocks.permissions, getPage:async () => ({
    getTextContent:mocks.text, cleanup:vi.fn(),
    getViewport:({scale}:{scale:number}) => ({width:120*scale, height:240*scale}),
    render:() => ({promise:Promise.resolve()}),
  }) },
  关闭:mocks.close,
}) }))
vi.mock('../ipc/bridge', () => ({ 桥接:{ office:{ writeXlsx:mocks.writeXlsx, writeDocx:mocks.writeDocx } } }))

describe('PDF 内容转换', () => {
  it('导出可编辑文字并保留表格编号、数值和页边界', async () => {
    mocks.permissions.mockResolvedValue(null)
    mocks.text.mockResolvedValue({ items:['0012','18.75'].map((str,i) => ({
      str, transform:[1,0,0,1,i*100,200], height:12, width:24,
    })) })
    mocks.writeXlsx.mockResolvedValue({成功:true,数据:'xlsx'})
    mocks.writeDocx.mockResolvedValue({成功:true,数据:'docx'})
    expect(await 转换PDF文字('sample','xlsx','2')).toBe('xlsx')
    expect(mocks.writeXlsx).toHaveBeenCalledWith({工作表:[{名称:'第2页',数据:[[{值:'0012'},{值:18.75}]]}]})
    expect(await 转换PDF文字('sample','docx','')).toBe('docx')
    expect(mocks.writeDocx).toHaveBeenCalledWith({段落:[{文字:[{文本:'0012 18.75'}]},{类型:'分页符'},{文字:[{文本:'0012 18.75'}]}]})
    expect(await 转换PDF文字('sample','txt','1')).toBe('0012 18.75')
  })
  it('指出无文字层的页码，尊重复制权限', async () => {
    mocks.permissions.mockResolvedValue(null)
    mocks.text.mockResolvedValue({items:[]})
    await expect(转换PDF文字('sample','docx','2')).rejects.toThrow('第 2 页')
    mocks.permissions.mockResolvedValue(new Set())
    await expect(转换PDF文字('sample','txt','1')).rejects.toThrow('限制复制')
    await expect(转换PDF图片('sample','1')).rejects.toThrow('限制复制')
  })
  it('单页提供 PNG，多页压缩包按原始页码保存', async () => {
    mocks.permissions.mockResolvedValue(null)
    const bytes = new Uint8Array([137,80,78,71])
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback =>
      callback({arrayBuffer:async () => bytes.buffer} as Blob))
    try {
      expect(await 转换PDF图片('sample','2')).toEqual({extension:'png', bytes})
      const result = await 转换PDF图片('sample','1-2')
      const zip = await JSZip.loadAsync(result.bytes)
      expect(Object.keys(zip.files)).toEqual(['第1页.png', '第2页.png'])
      expect(await zip.file('第2页.png')!.async('uint8array')).toEqual(bytes)
      mocks.text.mockResolvedValue({items:[]})
      expect(await 转换PDF文字('sample','txt','2',async () => [['核对过的文字']])).toBe('核对过的文字')
    } finally { encode.mockRestore() }
  })
})
