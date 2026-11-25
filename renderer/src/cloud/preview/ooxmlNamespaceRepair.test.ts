import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { 修补OOXML命名空间, 补全命名空间 } from './ooxmlNamespaceRepair'

const 解析错误 = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror').length > 0

// 截图同款：abstractNum 上的 w15:restartNumberingAfterBreak 未在根元素声明
const 编号 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0" w15:restartNumberingAfterBreak="0"><w:nsid w:val="1"/><w14:x/></w:abstractNum></w:numbering>'

describe('OOXML 预览命名空间修补', () => {
  it('补全缺失的 w15、w14 声明后 XML 可被严格解析', () => {
    expect(解析错误(编号)).toBe(true)
    const 修补 = 补全命名空间(编号)
    expect(解析错误(修补)).toBe(false)
    expect(修补).toContain('xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"')
    expect(修补).toContain('xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"')
    expect(修补.startsWith('<?xml')).toBe(true)
  })

  it('已声明的前缀与 xml: 前缀不重复添加，合法文档原样返回', () => {
    const 合法 = '<w:document xmlns:w="urn:w" xmlns:w15="urn:w15"><w:p w15:x="1" xml:space="preserve"/></w:document>'
    expect(补全命名空间(合法)).toBe(合法)
  })

  it('未知前缀使用占位命名空间，保证可解析', () => {
    const 修补 = 补全命名空间('<a:root xmlns:a="urn:a"><a:x foo:bar="1"/></a:root>')
    expect(修补).toContain('xmlns:foo="urn:seal-office:preview:undeclared:foo"')
    expect(解析错误(修补)).toBe(false)
  })

  it('只修补预览副本：返回新的 DOCX 字节，其余部件不变；非 OOXML 原样返回', async () => {
    const 包 = new JSZip()
    包.file('word/numbering.xml', 编号)
    包.file('word/document.xml', '<w:document xmlns:w="urn:w"><w:body/></w:document>')
    const 原字节 = await 包.generateAsync({ type: 'uint8array' })
    const 结果 = await 修补OOXML命名空间('编号.docx', 原字节)
    expect(结果.已修补).toEqual(['word/numbering.xml'])
    const 新包 = await JSZip.loadAsync(结果.字节)
    expect(解析错误(await 新包.file('word/numbering.xml')!.async('string'))).toBe(false)
    expect(await 新包.file('word/document.xml')!.async('string')).toBe('<w:document xmlns:w="urn:w"><w:body/></w:document>')
    expect((await 修补OOXML命名空间('a.pdf', 原字节)).字节).toBe(原字节)
    expect((await 修补OOXML命名空间('坏.docx', new Uint8Array([1, 2, 3]))).已修补).toEqual([])
  })
})
