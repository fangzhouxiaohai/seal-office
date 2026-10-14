const { 解码Xml实体, 是有效Xml码点 } = require('./xmlEntities')

describe('OOXML 实体与 Unicode 码点', () => {
  it('支持 BMP 之外的十六进制和十进制数字实体', () => {
    expect(解码Xml实体('&#x20000; &#128512; &amp;')).toBe('𠀀 😀 &')
  })

  it.each(['&#0;', '&#xD800;', '&#x110000;'])('拒绝 XML 1.0 中的非法码点 %s', (实体) => {
    expect(() => 解码Xml实体(实体, '测试文档')).toThrow('测试文档包含无效 XML 字符')
  })

  it('XML 1.0 边界判断包含制表、换行、回车和完整补充平面', () => {
    expect([0x9, 0xa, 0xd, 0x20, 0xd7ff, 0xe000, 0xfffd, 0x10000, 0x10ffff].every(是有效Xml码点)).toBe(true)
    expect([0, 0x1f, 0xd800, 0xdfff, 0xfffe, 0x110000].some(是有效Xml码点)).toBe(false)
  })
})
