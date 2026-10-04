const { 校验字段, 非视觉, 文字, 颜色, 转EMU } = require('./shapes')
function 校验表格(对象) {
  校验字段(对象, ['id','类型','x','y','width','height','旋转','锁定','表格','子对象标识'])
  if (对象.旋转) throw new Error('原生表格暂不支持旋转')
  if (对象.子对象标识 !== undefined) throw new Error('表格不能携带组合成员')
  const 表 = 对象.表格
  校验字段(表, ['单元格','行高','列宽','合并'])
  if (!Array.isArray(表.单元格) || !Array.isArray(表.行高) || !Array.isArray(表.列宽) || !Array.isArray(表.合并) || !表.行高.length || !表.列宽.length || 表.行高.length > 30 || 表.列宽.length > 30 || 表.单元格.length !== 表.行高.length || [...表.行高,...表.列宽].some(值 => !Number.isFinite(值) || 值 <= 0)) throw new Error('原生表格行列无效')
  for (const 行 of 表.单元格) {
    if (!Array.isArray(行) || 行.length !== 表.列宽.length) throw new Error('原生表格单元格不完整')
    for (const 格 of 行) {
      校验字段(格,['文本','背景','颜色','字号','加粗','对齐'])
      if (typeof 格.文本 !== 'string' || typeof 格.加粗 !== 'boolean' || !Number.isFinite(格.字号) || 格.字号 <= 0 || !['left','center','right'].includes(格.对齐)) throw new Error('原生表格格式无效')
      颜色(格.背景); 颜色(格.颜色)
    }
  }
  const 占用 = new Set()
  for (const 项 of 表.合并) {
    校验字段(项,['行','列','行数','列数'])
    if (![项.行,项.列,项.行数,项.列数].every(Number.isInteger) || 项.行 < 0 || 项.列 < 0 || 项.行数 < 1 || 项.列数 < 1 || 项.行 + 项.行数 > 表.行高.length || 项.列 + 项.列数 > 表.列宽.length) throw new Error('原生表格合并范围无效')
    for (let r = 项.行; r < 项.行 + 项.行数; r++) for (let c = 项.列; c < 项.列 + 项.列数; c++) { const 键 = `${r}:${c}`; if (占用.has(键)) throw new Error('原生表格合并重叠'); 占用.add(键) }
  }
}
function 写入表格(对象, 编号) {
  校验表格(对象)
  const 表 = 对象.表格, 总宽 = 表.列宽.reduce((a,b) => a+b,0), 总高 = 表.行高.reduce((a,b) => a+b,0)
  const 行 = 表.单元格.map((单行,r) => `<a:tr h="${转EMU(表.行高[r] / 总高 * 对象.height)}">${单行.map((格,c) => {
    const 并 = 表.合并.find(项 => r >= 项.行 && r < 项.行 + 项.行数 && c >= 项.列 && c < 项.列 + 项.列数)
    const 属性 = 并 ? `${c === 并.列 && 并.列数 > 1 ? ` gridSpan="${并.列数}"` : ''}${r === 并.行 && 并.行数 > 1 ? ` rowSpan="${并.行数}"` : ''}${c > 并.列 ? ' hMerge="1"' : ''}${r > 并.行 ? ' vMerge="1"' : ''}` : ''
    return `<a:tc${属性}><a:txBody>${文字(格.文本,格)}</a:txBody><a:tcPr marL="76200" marR="76200" marT="50800" marB="50800">${['L','R','T','B'].map(边 => `<a:ln${边} w="12700"><a:solidFill><a:srgbClr val="B8C0CC"/></a:solidFill></a:ln${边}>`).join('')}<a:solidFill><a:srgbClr val="${颜色(格.背景)}"/></a:solidFill></a:tcPr></a:tc>`
  }).join('')}</a:tr>`).join('')
  return `<p:graphicFrame><p:nvGraphicFramePr>${非视觉(对象,编号)}<p:cNvGraphicFramePr><a:graphicFrameLocks noMove="${对象.锁定 ? 1 : 0}" noResize="${对象.锁定 ? 1 : 0}"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${转EMU(对象.x)}" y="${转EMU(对象.y)}"/><a:ext cx="${转EMU(对象.width)}" cy="${转EMU(对象.height)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid>${表.列宽.map(宽 => `<a:gridCol w="${转EMU(宽 / 总宽 * 对象.width)}"/>`).join('')}</a:tblGrid>${行}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
}
module.exports = { 写入表格, 校验表格 }
