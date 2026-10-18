const JSZip = require('jszip')
const { 读取动态元数据, 动态元数据Xml, 未导入警告 } = require('./xlsxMetadata')
const { 读取xlsx, 写入xlsx } = require('./xlsxCodec')

describe('Office XLDAPR 动态数组元数据', () => {
  it('emits the lowercase extension URI required by native WPS without narrowing case-insensitive import', () => {
    const xml=动态元数据Xml()
    expect(xml).toContain('uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"')
    expect(读取动态元数据(xml.replace('{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}','{BDBB8CDC-FA1E-496E-A857-3C3F30C029C3}')).记录.get(1)).toBe(true)
  })
  it('按 Office 一基 cm/t 和零基 v 解析，不把相邻记录或未知类型当作动态数组', () => {
    const xml = 动态元数据Xml().replace('<cellMetadata count="1"><bk><rc t="1" v="0"/></bk>', '<cellMetadata count="3"><bk><rc t="1" v="7"/></bk><bk><rc t="1" v="0"/></bk><bk><rc t="2" v="0"/></bk>')
    const 结果 = 读取动态元数据(xml)
    expect([...结果.记录]).toEqual([[2, true]])
    expect(结果.未支持).toBe(true)
    expect(() => 读取动态元数据('<!DOCTYPE metadata><metadata/>')).toThrow('文档类型')
  })

  it.each([false, true])('公式、缓存、数组范围和元数据经过两次实际 XLSX 往返（前缀 %s）', async 前缀 => {
    let 数据 = await 写入xlsx({ 工作表: [{ 名称: '动态', 数据: [[{ 公式: '_xlfn.UNIQUE(C1:C2)', 结果: 0, 数组范围: 'A1:A2', 动态数组: true }, { 公式: 'SUM(C1:C2)', 结果: 3 }, '1'], ['2', '', '2']] }, { 名称: '第二张', 数据: [[{ 公式: '_xlfn._xlws.FILTER(B1:B2,B1:B2>0)', 结果: false, 数组范围: 'A1:A2', 动态数组: true }]] }] })
    if (前缀) {
      const 包 = await JSZip.loadAsync(数据)
      const xml = await 包.file('xl/metadata.xml').async('string')
      包.file('xl/metadata.xml', xml.replace(/xmlns="([^"]*)"/, 'xmlns:s="$1"').replace(/<(\/?)(metadata|metadataTypes|metadataType|futureMetadata|bk|extLst|ext|cellMetadata|rc)\b/g, '<$1s:$2'))
      const 工作表 = await 包.file('xl/worksheets/sheet1.xml').async('string')
      包.file('xl/worksheets/sheet1.xml', 工作表.replace('cm="1"', 'cm="2"'))
      包.file('xl/metadata.xml', (await 包.file('xl/metadata.xml').async('string')).replace('<s:cellMetadata count="1">', '<s:cellMetadata count="2"><s:bk><s:rc t="1" v="0"/></s:bk>'))
      数据 = await 包.generateAsync({ type: 'nodebuffer' })
    }
    for (let 次数 = 0; 次数 < 2; 次数++) {
      const 导入 = await 读取xlsx(数据)
      expect(导入.警告).not.toContain(未导入警告)
      expect(导入.工作表列表[0].元数据.公式来源.A1).toEqual({ 原始值: '=_xlfn.UNIQUE(C1:C2)', 结果: 0, 数组范围: 'A1:A2', 动态数组: true, 数组缓存: { A2: 2 } })
      expect(导入.工作表列表[0].元数据.公式来源.B1).not.toHaveProperty('动态数组')
      expect(导入.工作表列表[1].元数据.公式来源.A1).toMatchObject({ 动态数组: true, 结果: false })
      const 包 = await JSZip.loadAsync(数据)
      expect(await 包.file('xl/_rels/workbook.xml.rels').async('string')).toContain('/sheetMetadata')
      expect(await 包.file('[Content_Types].xml').async('string')).toContain('spreadsheetml.sheetMetadata+xml')
      数据 = await 写入xlsx({ 工作表: 导入.工作表列表.map(表 => ({ 名称: 表.名称, 数据: [[...Object.values(表.元数据.公式来源).map(来源 => ({ 公式: 来源.原始值.slice(1), ...来源 }))]] })) })
    }
  })

  it('混合富值或未来扩展继续报告保真边界，损坏 cm 不能静默标记成功', async () => {
    const 数据 = await 写入xlsx({ 行: [[{ 公式: '_xlfn.UNIQUE(B1:B2)', 数组范围: 'A1:A2', 动态数组: true, 结果: '' }]] })
    const 包 = await JSZip.loadAsync(数据)
    包.file('xl/metadata.xml', (await 包.file('xl/metadata.xml').async('string')).replace('</metadata>', '<valueMetadata count="1"><bk><rc t="9" v="0"/></bk></valueMetadata></metadata>'))
    包.file('xl/worksheets/sheet1.xml', (await 包.file('xl/worksheets/sheet1.xml').async('string')).replace('cm="1"', 'cm="9"'))
    const 导入 = await 读取xlsx(await 包.generateAsync({ type: 'nodebuffer' }))
    expect(导入.警告).toContain(未导入警告)
    expect(导入.工作表列表[0].元数据.公式来源.A1).toMatchObject({ 结果: '', 数组范围: 'A1:A2' })
    expect(导入.工作表列表[0].元数据.公式来源.A1).not.toHaveProperty('动态数组')
  })

  it('通过 sheetMetadata 关系读取不同目录和 Strict 命名空间，不依赖固定文件名', async () => {
    const 包 = await JSZip.loadAsync(await 写入xlsx({ 行: [[{ 公式: '_xlfn.UNIQUE(B1:B2)', 数组范围: 'A1:A2', 动态数组: true, 结果: { error: '#N/A' } }]] }))
    包.file('xl/customData/arrays.xml', await 包.file('xl/metadata.xml').async('string')); 包.remove('xl/metadata.xml')
    包.file('xl/_rels/workbook.xml.rels', (await 包.file('xl/_rels/workbook.xml.rels').async('string')).replace('Target="metadata.xml"', 'Target="/xl/customData/arrays.xml"'))
    包.file('[Content_Types].xml', (await 包.file('[Content_Types].xml').async('string')).replace('/xl/metadata.xml', '/xl/customData/arrays.xml'))
    for (const 部件 of Object.values(包.files)) {
      if (部件.dir || !/\.(?:xml|rels)$/.test(部件.name)) continue
      包.file(部件.name, (await 部件.async('string')).replaceAll('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'http://purl.oclc.org/ooxml/spreadsheetml/main').replaceAll('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships'))
    }
    const 导入 = await 读取xlsx(await 包.generateAsync({ type: 'nodebuffer' }))
    expect(导入.警告).not.toContain(未导入警告)
    expect(导入.工作表列表[0].元数据.公式来源.A1).toMatchObject({ 动态数组: true, 结果: { error: '#N/A' } })
  })
})
