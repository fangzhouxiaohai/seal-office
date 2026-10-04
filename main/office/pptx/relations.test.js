const JSZip = require('jszip')
const { 解析部件路径, 读取部件 } = require('./parts')
const { 解析关系, 关联目标 } = require('./relations')

const 关系Xml = 目标 => `<Relationships><Relationship Id='rId1' Type='example/notesSlide' Target='${目标}'/></Relationships>`

describe('安全部件与关系解析', () => {
  it('读取单引号和实体属性，允许包内父目录与绝对部件路径', () => {
    expect(解析关系(关系Xml('../notesSlides/notes&amp;1.xml'), 'ppt/slides/slide1.xml').get('rId1').目标).toBe('ppt/notesSlides/notes&1.xml')
    expect(解析部件路径('ppt/slides/slide1.xml', '/ppt/notesSlides/notes1.xml')).toBe('ppt/notesSlides/notes1.xml')
  })
  it.each(['../../../evil.xml', '%2e%2e/%2e%2e/%2e%2e/evil.xml', 'C:/evil.xml', '//server/evil.xml', '..\\evil.xml', 'file:///evil.xml', '%252e%252e/evil.xml', 'a.xml#x', '%00.xml'])('拒绝不安全目标 %s', 目标 => {
    expect(() => 解析部件路径('ppt/slides/slide1.xml', 目标)).toThrow(/演示文件无效/)
  })
  it('拒绝重复标识、未闭合根、嵌套关系和文档类型声明', () => {
    for (const xml of [关系Xml('a.xml').replace('</Relationships>', "<Relationship Id='rId1' Type='example/notesSlide' Target='b.xml'/></Relationships>"), '<Relationships>', '<Relationships><Other/></Relationships>', '<!DOCTYPE Relationships><Relationships/>']) {
      expect(() => 解析关系(xml, 'ppt/slides/slide1.xml')).toThrow(/关系文件/)
    }
  })
  it('外部关系不读取本地文件，内部关联缺失必须报错', async () => {
    const 包 = new JSZip()
    包.file('ppt/slides/_rels/slide1.xml.rels', 关系Xml('https://example.com/a').replace("Target=", "TargetMode='External' Target="))
    expect(await 关联目标(包, 'ppt/slides/slide1.xml', 'notesSlide')).toEqual([])
    包.file('ppt/slides/_rels/slide1.xml.rels', 关系Xml('../notesSlides/missing.xml'))
    await expect(关联目标(包, 'ppt/slides/slide1.xml', 'notesSlide')).rejects.toThrow(/不存在/)
  })
  it('拒绝被压缩包读取器归一化的原始越界名称', async () => {
    const 原包 = new JSZip()
    原包.file('../../ppt/slides/slide1.xml', '正文')
    const 包 = await JSZip.loadAsync(await 原包.generateAsync({ type: 'nodebuffer' }))
    expect(() => 读取部件(包, 'ppt/slides/slide1.xml')).toThrow(/不安全/)
  })
})
