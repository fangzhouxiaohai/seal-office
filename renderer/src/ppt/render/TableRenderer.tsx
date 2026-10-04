import type { 演示对象 } from '../deck'
export function TableRenderer({ 对象 }: { 对象: 演示对象 }) {
  const 表 = 对象.表格
  if (!表) throw new Error('表格缺少单元格数据')
  const 总高 = 表.行高.reduce((a,b) => a+b,0), 总宽 = 表.列宽.reduce((a,b) => a+b,0)
  return <table style={{ width: '100%', height: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontFamily: 'Microsoft YaHei, sans-serif' }}><colgroup>{表.列宽.map((宽,c) => <col key={c} style={{ width: `${宽/总宽*100}%` }}/>)}</colgroup><tbody>{表.单元格.map((行,r) => <tr key={r} style={{ height: `${表.行高[r]/总高*100}%` }}>{行.map((格,c) => {
    const 并 = 表.合并.find(项 => r >= 项.行 && r < 项.行+项.行数 && c >= 项.列 && c < 项.列+项.列数)
    if (并 && (r !== 并.行 || c !== 并.列)) return null
    return <td key={c} rowSpan={并?.行数} colSpan={并?.列数} style={{ border: '1px solid #B8C0CC', padding: '4px 6px', background: 格.背景, color: 格.颜色, fontSize: 格.字号, fontWeight: 格.加粗 ? 600 : 400, textAlign: 格.对齐, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.3 }}>{格.文本}</td>
  })}</tr>)}</tbody></table>
}
