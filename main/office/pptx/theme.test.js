const JSZip = require('jszip')
const {
  主题Xml,
  读取主题,
  写入主题,
  槽到方案色,
  方案色到槽,
  写入主题色引用,
  读取主题色引用,
  匹配主题标识,
} = require('./theme')

const 测试主题 = {
  标识: '海豹-锐蓝',
  名称: '海豹锐蓝',
  配色: {
    背景1: '#FFFFFF', 文本1: '#10233F', 背景2: '#EEF3FF', 文本2: '#4A5C78',
    强调1: '#1B4FD8', 强调2: '#00A0C6', 强调3: '#F2994A', 强调4: '#6C4BD8', 强调5: '#C0392B', 强调6: '#147D8C',
    超链接: '#1B4FD8',
  },
  字体: { 标题: '微软雅黑', 正文: '微软雅黑' },
}

describe('主题部件的原生读写', () => {
  it('生成真实 theme1.xml 配色与字体方案', () => {
    const xml = 主题Xml(测试主题)
    expect(xml).toContain('<a:theme')
    expect(xml).toContain('name="海豹锐蓝"')
    expect(xml).toContain('<a:clrScheme name="海豹锐蓝">')
    expect(xml).toMatch(/<a:dk1><a:srgbClr val="10233F"\/><\/a:dk1>/)
    expect(xml).toMatch(/<a:lt1><a:srgbClr val="FFFFFF"\/><\/a:lt1>/)
    expect(xml).toMatch(/<a:accent1><a:srgbClr val="1B4FD8"\/><\/a:accent1>/)
    expect(xml).toMatch(/<a:hlink><a:srgbClr val="1B4FD8"\/><\/a:hlink>/)
    expect(xml).toContain('<a:majorFont><a:latin typeface="微软雅黑"')
    expect(xml).toContain('<a:minorFont><a:latin typeface="微软雅黑"')
    // 格式方案必须保留，否则 Office 打开会降级
    expect(xml).toContain('<a:fmtScheme name="Office">')
    expect(() => 主题Xml({ ...测试主题, 配色: {} })).toThrow(/主题/)
  })

  it('读取主题还原配色、字体与名称', () => {
    const 读取 = 读取主题(主题Xml(测试主题))
    expect(读取.名称).toBe('海豹锐蓝')
    expect(读取.配色).toEqual(测试主题.配色)
    expect(读取.字体).toEqual(测试主题.字体)
    expect(读取.标识).toBe('导入主题-海豹锐蓝')
    expect(匹配主题标识(读取, [测试主题])).toBe('海豹-锐蓝')
    expect(读取主题('<a:theme></a:theme>')).toBeNull()
  })

  it('槽位与方案色双向映射覆盖全部主题色槽', () => {
    for (const [槽, 方案色] of [['文本1', 'tx1'], ['背景1', 'bg1'], ['文本2', 'tx2'], ['背景2', 'bg2'], ['强调1', 'accent1'], ['强调6', 'accent6'], ['超链接', 'hlink']]) {
      expect(槽到方案色(槽)).toBe(方案色)
      expect(方案色到槽(方案色)).toBe(槽)
    }
    expect(() => 槽到方案色('不存在')).toThrow(/主题色/)
    expect(方案色到槽('不存在')).toBeNull()
  })

  it('写入主题部件替换全部 theme 部件', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('ppt/theme/theme1.xml', '<a:theme name="Office Theme"></a:theme>')
    压缩包.file('ppt/theme/theme2.xml', '<a:theme name="Office Theme"></a:theme>')
    await 写入主题(压缩包, 测试主题)
    const 一 = await 压缩包.file('ppt/theme/theme1.xml').async('string')
    const 二 = await 压缩包.file('ppt/theme/theme2.xml').async('string')
    expect(一).toBe(主题Xml(测试主题))
    expect(二).toBe(主题Xml(测试主题))
  })

  it('主题色引用只在目标形状内替换为 schemeClr', () => {
    const xml = '<p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="seal-id:Ym94LWE"/></p:nvSpPr>'
      + '<p:txBody><a:p><a:r><a:rPr><a:solidFill><a:srgbClr val="10233F"/></a:solidFill></a:rPr><a:t>标题</a:t></a:r></a:p></p:txBody></p:sp>'
      + '<p:sp><p:nvSpPr><p:cNvPr id="3" name="seal-id:Ym94LWI"/></p:nvSpPr>'
      + '<p:txBody><a:p><a:r><a:rPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr><a:t>显式黑</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>'
    const 更新 = 写入主题色引用(xml, [{ 框标识: 'box-a', 槽: '文本1' }], (标识) => `seal-id:${Buffer.from(标识, 'utf8').toString('base64url')}`)
    expect(更新).toContain('<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>')
    expect(更新).toContain('<a:srgbClr val="000000"/>')
    expect(读取主题色引用(更新.match(/<p:sp>[\s\S]*?<\/p:sp>/)[0])).toBe('文本1')
    expect(读取主题色引用(更新.match(/<p:sp>[\s\S]*?<\/p:sp>/g)[1])).toBeNull()
  })
})
