const { 写入形状 } = require('./shapes')
const { 写入表格 } = require('./tables')
const { 写入公式对象 } = require('./formulas')
function 写入原生对象(对象, 编号, 原生标识) {
  if (对象.类型 === '图形') return 写入形状(对象,编号,原生标识)
  if (对象.类型 === '公式') return 写入公式对象(对象,编号)
  return 写入表格(对象,编号)
}
/** 本机语义元数据必须与实际原生对象一致；外部修改或未知属性不能被旧元数据掩盖。 */
function 读取原生对象(xml) {
  const 对象列表 = [], 警告 = []
  const 已识别片段 = new Set()
  let 最先原生位置 = Infinity
  const 原生标识 = new Map(Array.from(xml.matchAll(/<p:cNvPr\b[^>]*id="(\d+)"[^>]*name="seal-id:([A-Za-z0-9_-]+)"/g),项=>[Buffer.from(项[2],'base64url').toString('utf8'),Number(项[1])]))
  const 剩余 = xml.replace(/<p:(sp|graphicFrame|cxnSp)\b[^>]*>[\s\S]*?<\/p:\1>/g, (片段, _类型, 位置) => {
    const 元 = 片段.match(/\bdescr="seal-element:([A-Za-z0-9_-]+)"/)
    if (!元) return 片段
    try {
      const 对象 = JSON.parse(Buffer.from(元[1],'base64url').toString('utf8'))
      const 编号 = Number(片段.match(/<p:cNvPr\b[^>]*\bid="(\d+)"/)?.[1])
      if (写入原生对象(对象,编号,原生标识) !== 片段) { 警告.push('原生对象已被外部修改，语义结构未完整导入'); return 片段 }
      对象列表.push(对象)
      已识别片段.add(片段)
      最先原生位置 = Math.min(最先原生位置,位置)
      return ''
    } catch { 警告.push('原生对象语义数据损坏或含未知属性'); return 片段 }
  })
  if (Array.from(xml.matchAll(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g)).some(项 => !已识别片段.has(项[0]) && 项.index > 最先原生位置 && /<a:t\b/.test(项[0]))) 警告.push('原生对象与普通文字图层未完整导入')
  return { 对象列表, 警告, 剩余 }
}
module.exports = { 写入原生对象, 读取原生对象 }
