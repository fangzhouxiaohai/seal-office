const JSZip = require('jszip')
const { 规范公式函数名 } = require('./xlsxFunctionNames')
const { 读取xlsx, 写入xlsx } = require('./xlsxCodec')

describe('OOXML 未来函数存储名', () => {
  it('只补完整的已知函数调用，不改文本、表名、结构化字段、未知函数和已有前缀', () => {
    const 公式 = 'IF(A1>0,norm.dist (A1,0,1,TRUE),"NORM.DIST(A1)")+\'TEXTJOIN(A1)\'!A1+Table1[CONCAT(A1)]+_xlfn.XLOOKUP(A1,B1:B3,C1:C3)+XLOOKUP(A1,B1:B3,C1:C3)+CUSTOM(A1)+NETWORKDAYS.INTL(A1,A2)'
    expect(规范公式函数名(公式)).toBe(公式.replace('norm.dist (', '_xlfn.NORM.DIST (').replace('+XLOOKUP(', '+_xlfn.XLOOKUP('))
    expect(规范公式函数名('FILTER(A1:A3,A1:A3>0)+SORT(A1:A3)+_xlfn.UNIQUE(A1:A3)'))
      .toBe('_xlfn._xlws.FILTER(A1:A3,A1:A3>0)+_xlfn._xlws.SORT(A1:A3)+_xlfn.UNIQUE(A1:A3)')
    expect(规范公式函数名('_xlfn.NORM.DIST(0,0,1,TRUE)+TEXTJOIN(",",TRUE,A1:A3)'))
      .toBe('_xlfn.NORM.DIST(0,0,1,TRUE)+_xlfn.TEXTJOIN(",",TRUE,A1:A3)')
  })

  it('新输入的未来函数实际写入标准名，来源公式原拼写显式保留，缓存仍有类型', async () => {
    const 数据 = await 写入xlsx({ 行: [[{ 公式: 'NORM.DIST(0,0,1,TRUE)', 结果: 0.5 }, { 公式: 'XLOOKUP(1,C1:C2,D1:D2)', 结果: false }, { 公式: 'CONCAT("A","B")', 结果: 'AB', 保留公式拼写: true }]] })
    const 包 = await JSZip.loadAsync(数据), xml = await 包.file('xl/worksheets/sheet1.xml').async('string')
    expect(xml).toContain('_xlfn.NORM.DIST(0,0,1,TRUE)')
    expect(xml).toContain('_xlfn.XLOOKUP(1,C1:C2,D1:D2)')
    expect(xml).toContain('<f>CONCAT(&quot;A&quot;,&quot;B&quot;)</f>')
    const 来源 = (await 读取xlsx(数据)).工作表列表[0].元数据.公式来源
    expect(来源.A1).toMatchObject({ 原始值: '=_xlfn.NORM.DIST(0,0,1,TRUE)', 结果: 0.5 })
    expect(来源.B1.结果).toBe(false)
    expect(来源.C1).toMatchObject({ 原始值: '=CONCAT("A","B")', 结果: 'AB' })
  })
})
