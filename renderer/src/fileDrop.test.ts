import { describe, expect, it } from 'vitest'
import { 在局部投放区, 分组拖入文件, 携带文件, 读取拖入路径 } from './fileDrop'

/** 造一个只有 types 与 files 的 DataTransfer 替身 */
const 造拖放数据 = (文件列表: Array<{ name: string; path?: string }>) => {
  const files = 文件列表.map((项) => Object.assign(new File(['字节'], 项.name), 项.path === undefined ? {} : { path: 项.path }))
  return { types: ['Files'], files } as unknown as DataTransfer
}

describe('拖入文件打开', () => {
  it('从拖放数据取出本机路径，保持顺序并去重', () => {
    const 数据 = 造拖放数据([
      { name: 'a.docx', path: 'D:\\资料\\a.docx' },
      { name: 'b.pdf', path: 'D:\\资料\\b.pdf' },
      { name: 'a.docx', path: 'D:\\资料\\a.docx' },
    ])
    expect(读取拖入路径(数据)).toEqual(['D:\\资料\\a.docx', 'D:\\资料\\b.pdf'])
  })

  it('没有本机路径的条目被忽略，避免把内存文件当成本地文件打开', () => {
    const 数据 = 造拖放数据([{ name: '截图.png' }, { name: 'c.txt', path: 'D:\\c.txt' }])
    expect(读取拖入路径(数据)).toEqual(['D:\\c.txt'])
  })

  it('区分系统文件拖入与页面内拖动，页面内拖动不触发打开', () => {
    expect(携带文件({ types: ['Files'] } as unknown as DataTransfer)).toBe(true)
    expect(携带文件({ types: ['text/plain', 'application/x-seal-image'] } as unknown as DataTransfer)).toBe(false)
    expect(携带文件(null)).toBe(false)
  })

  it('按扩展名分组，不支持的类型单独返回以便如实提示', () => {
    const 分组 = 分组拖入文件([
      'D:\\a\\报告.docx', 'D:\\a\\数据.XLSX', 'D:\\a\\幻灯片.pptx', 'D:\\a\\说明.pdf',
      'D:\\a\\表格.csv', 'D:\\a\\备忘.txt', 'D:\\a\\说明.md', 'D:\\a\\页面.html',
      'D:\\a\\程序.exe', 'D:\\a\\无扩展名',
    ])
    expect(分组.可打开).toHaveLength(8)
    expect(分组.不支持).toEqual(['D:\\a\\程序.exe', 'D:\\a\\无扩展名'])
  })

  it('空列表与全不支持时分组结果稳定', () => {
    expect(分组拖入文件([])).toEqual({ 可打开: [], 不支持: [] })
    expect(分组拖入文件(['D:\\a\\b.exe'])).toEqual({ 可打开: [], 不支持: ['D:\\a\\b.exe'] })
  })

  it('识别编辑区自己的投放区，避免抢走幻灯片舞台的图片投放', () => {
    const 舞台 = document.createElement('div')
    舞台.setAttribute('data-seal-dropzone', '幻灯片图片')
    const 内部 = document.createElement('span')
    舞台.appendChild(内部)
    document.body.appendChild(舞台)
    try {
      expect(在局部投放区(内部)).toBe(true)
      expect(在局部投放区(舞台)).toBe(true)
      expect(在局部投放区(document.body)).toBe(false)
      expect(在局部投放区(null)).toBe(false)
    } finally {
      舞台.remove()
    }
  })
})
