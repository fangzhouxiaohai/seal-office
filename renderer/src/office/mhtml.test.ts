import { describe, expect, it } from 'vitest'
import { 读取单文件网页 } from './mhtml'
import { 文字文本输出 } from '../editor/exportDoc'
describe('单文件网页及 XML', () => {
  it('MHTML 写出真实 MIME，中文和内嵌图片可保存重开', () => {
    const html = '<p>中文正文</p><img src="data:image/png;base64,aGVsbG8=">'
    const 内容 = 文字文本输出('报告.mhtml', html)
    expect(内容).toContain('MIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8')
    expect(读取单文件网页(内容).trim()).toBe(html)
  })
  it('读取 multipart 网页与 CID 图片、quoted-printable 中文', () => {
    const MIME = 'Content-Type: multipart/related; boundary="seal"\r\n\r\n--seal\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<p>=E4=B8=AD=E6=96=87</p><img src="cid:photo">\r\n--seal\r\nContent-Type: image/png\r\nContent-ID: <photo>\r\nContent-Transfer-Encoding: base64\r\n\r\naGVsbG8=\r\n--seal--\r\n'
    expect(读取单文件网页(MIME)).toBe('<p>中文</p><img src="data:image/png;base64,aGVsbG8=">')
  })
  it('拒绝损坏或不含 HTML 的网页，XML 保存前验证结构', () => {
    expect(() => 读取单文件网页('Content-Type: text/plain\n\nhello')).toThrow('未包含')
    expect(文字文本输出('a.xml', '<p>&lt;root&gt;中文&lt;/root&gt;</p>')).toBe('<root>中文</root>')
    expect(() => 文字文本输出('a.xml', '<p>&lt;root&gt;</p>')).toThrow('XML 内容格式无效')
  })
})
