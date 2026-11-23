function 转义Html(文本: string): string {
  return 文本.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function 文本转Html(文本: string): string {
  const 片段 = 文本.split(/(\r\n|\n|\r)/)
  const 换行名称 = (换行: string): 'crlf' | 'cr' | 'lf' => 换行 === '\r\n' ? 'crlf' : 换行 === '\r' ? 'cr' : 'lf'
  const 计数 = { crlf: 0, cr: 0, lf: 0 }
  for (let 索引 = 1; 索引 < 片段.length; 索引 += 2) 计数[换行名称(片段[索引])] += 1
  const 默认换行 = (Object.keys(计数) as Array<keyof typeof 计数>).reduce((当前, 候选) =>
    计数[候选] > 计数[当前] ? 候选 : 当前, 换行名称(片段[1] ?? '\n'))
  const 行列表: string[] = []
  for (let 索引 = 0; 索引 < 片段.length; 索引 += 2) {
    const 行 = 片段[索引]
    const 后续换行 = 片段[索引 + 1]
    const 属性 = ` data-seal-line-ending="${默认换行}"${后续换行 ? ` data-seal-break="${换行名称(后续换行)}"` : ''}`
    行列表.push(`<p${属性}>${行.length > 0 ? 转义Html(行) : '<br>'}</p>`)
  }
  return 行列表.join('')
}

/** 按 CSV 引号规则解析，避免逗号及换行落在引号中时错列。 */
export function Csv转表格Html(文本: string, 编码?: import('./ipc/bridge').文本编码, 分隔符 = ','): string {
  const BOM = 文本.startsWith('\uFEFF')
  if (BOM) 文本 = 文本.slice(1)
  let 换行: '\r\n' | '\r' | '\n' | undefined
  const 行列表: string[][] = []
  let 当前行: string[] = []
  let 单元格 = ''
  let 引号内 = false
  let 引号已结束 = false
  const 提交单元格 = () => {
    当前行.push(单元格)
    单元格 = ''
    引号已结束 = false
  }
  const 提交行 = () => {
    提交单元格()
    行列表.push(当前行)
    当前行 = []
  }
  for (let 位置 = 0; 位置 < 文本.length; 位置 += 1) {
    const 字符 = 文本[位置]
    if (引号内) {
      if (字符 === '"') {
        if (文本[位置 + 1] === '"') {
          单元格 += '"'
          位置 += 1
        } else {
          引号内 = false
          引号已结束 = true
        }
      } else {
        单元格 += 字符
      }
    } else if (字符 === 分隔符 || 字符 === '\n' || 字符 === '\r') {
      if (字符 === 分隔符) {
        提交单元格()
      } else {
        换行 ??= 字符 === '\r' && 文本[位置 + 1] === '\n' ? '\r\n' : 字符 as '\r' | '\n'
        提交行()
        if (字符 === '\r' && 文本[位置 + 1] === '\n') 位置 += 1
      }
    } else if (字符 === '"' && 单元格.length === 0 && !引号已结束) {
      引号内 = true
    } else if (引号已结束 || 字符 === '"') {
      throw new Error('CSV 文件引号格式无效')
    } else {
      单元格 += 字符
    }
  }
  if (引号内) throw new Error('CSV 文件引号未闭合')
  if (当前行.length > 0 || 单元格.length > 0 || (文本.length > 0 && !/[\r\n]$/.test(文本))) 提交行()
  const 行内容 = 行列表.map((行) => `<tr>${行.map((值) => `<td data-value-type="text">${转义Html(值)}</td>`).join('')}</tr>`).join('')
  const 来源 = encodeURIComponent(JSON.stringify({ 行字段数: 行列表.map(行 => 行.length), 换行: 换行 ?? '\r\n', 末尾换行: /[\r\n]$/.test(文本), BOM, ...(分隔符 !== ',' ? { 分隔符 } : {}), ...(编码 && 编码 !== 'utf8' ? { 编码 } : {}) }))
  return `<table data-seal-csv="${来源}"><tbody>${行内容}</tbody></table>`
}
