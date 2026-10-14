import { describe, it, expect } from 'vitest'
import codec from './textCodec'
import iconv from 'iconv-lite'
describe('文本编码保存与重开', () => {
  for (const encoding of ['utf8', 'utf16le', 'utf16be', 'gb18030']) {
    it(encoding, () => {
      const text = (encoding.startsWith('utf16') ? '\uFEFF' : '') + '编号,预算\r\n0012,中文'
      const original = iconv.encode(text, encoding)
      const read = codec.解码文本(original)
      expect(read.内容).toBe(text)
      expect(codec.编码文本(read.内容, read.文本编码)).toEqual(original)
    })
  }
  it('保留 UTF-8 BOM', () => expect(codec.解码文本(Buffer.from('\uFEFF中文')).内容).toBe('\uFEFF中文'))
  it('UTF-8 完整保留扩展汉字、组合音标、RTL、ZWJ emoji 与各类空格', () => {
    const text = '𠀀𠮷 e\u0301 العربية עברית 👩🏽‍💻🏳️‍🌈 \u00A0\u202F\u3000 &<>"\''
    expect(codec.解码文本(codec.编码文本(text, 'utf8')).内容).toBe(text)
  })
  it('不把截断 UTF-16 当作有效文本覆盖', () => expect(() => codec.解码文本(Buffer.from([255,254,65]))).toThrow())
  it('拒绝未知输出编码', () => expect(() => codec.编码文本('中文', 'unknown')).toThrow())
})
