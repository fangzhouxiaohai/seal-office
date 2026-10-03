// 文件通道内容转缓冲测试
const { 内容转缓冲 } = require('./fileChannel')

describe('fileChannel.内容转缓冲', () => {
  it('Buffer 原样返回', () => {
    const 缓冲 = Buffer.from([1, 2, 3])
    expect(内容转缓冲(缓冲, '二进制')).toBe(缓冲)
  })

  it('Uint8Array 拷贝为 Buffer（保留二进制字节）', () => {
    const 字节 = new Uint8Array([0x50, 0x4b, 0x03, 0x04]) // "PK\x03\x04"
    const 缓冲 = 内容转缓冲(字节, '二进制')
    expect(Buffer.isBuffer(缓冲)).toBe(true)
    expect(Array.from(缓冲)).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it('base64 字符串按二进制解码', () => {
    const 原文 = Buffer.from([0x50, 0x4b, 0x03, 0x04])
    const base64 = 原文.toString('base64')
    const 缓冲 = 内容转缓冲(base64, '二进制')
    expect(Array.from(缓冲)).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it('普通字符串按 UTF-8 处理', () => {
    const 缓冲 = 内容转缓冲('海豹办公', '文本')
    expect(缓冲.toString('utf8')).toBe('海豹办公')
  })

  it('非 base64 的字符串以二进制保存时按 UTF-8 回退', () => {
    const 缓冲 = 内容转缓冲('不是base64!!', '二进制')
    expect(缓冲.toString('utf8')).toBe('不是base64!!')
  })
})
describe('保存/打开对话框过滤器映射', () => {
  const { 保存过滤器映射, 打开过滤器映射 } = require('./fileChannel')

  it('每种文档类型都有专属的保存过滤器，不再混杂 html/json', () => {
    expect(保存过滤器映射.word).toEqual([{ name: '文字文档', extensions: ['docx'] }])
    expect(保存过滤器映射.table).toEqual([{ name: '表格文档', extensions: ['xlsx'] }])
    expect(保存过滤器映射.ppt).toEqual([{ name: '演示文档', extensions: ['pptx'] }])
    expect(保存过滤器映射.pdf).toEqual([{ name: 'PDF 文件', extensions: ['pdf'] }])
  })

  it('打开过滤器与保存类型对应，表格支持旧版 json 兼容', () => {
    expect(打开过滤器映射.table).toEqual([{ name: '表格文档', extensions: ['xlsx', 'json'] }])
    expect(打开过滤器映射.word[0].extensions).toContain('docx')
    expect(打开过滤器映射.ppt[0].extensions).toContain('pptx')
  })
})
