import { 载入PDF } from './pdfLoader'
import { 解析页码 } from './pdfCommands'
import { 桥接 } from '../ipc/bridge'

/** 按文字基线组成行，按字块间距区分表格列；保留编号的前导零。 */
export function 提取文字行(items: Array<{ str:string; transform:number[]; width:number; height:number }>) {
  const rows: Array<{ y:number; height:number; items:typeof items }> = []
  for (const item of items.filter(item => item.str.trim()).sort((a,b) => b.transform[5]-a.transform[5])) {
    let row = rows[rows.length-1]
    if (!row || Math.abs(row.y-item.transform[5]) > Math.max(1, Math.min(row.height,item.height)*0.4)) {
      row = { y:item.transform[5], height:item.height, items:[] }; rows.push(row)
    }
    row.items.push(item)
  }
  return rows.map(row => {
    const cells:string[] = []
    let right = 0
    for (const item of row.items.sort((a,b) => a.transform[4]-b.transform[4])) {
      const gap = item.transform[4]-right
      if (!cells.length || gap > Math.max(4,row.height*0.9)) cells.push(item.str)
      else cells[cells.length-1] += (gap > row.height*0.15 ? ' ' : '') + item.str
      right = item.transform[4]+item.width
    }
    return cells
  })
}

export async function 转换PDF文字(data:string, format:'docx'|'xlsx'|'txt', range:string) {
  const { 文档, 关闭 } = await 载入PDF(data)
  try {
    const permissions = await 文档.getPermissions()
    if (permissions && !permissions.has(16)) throw new Error('此 PDF 限制复制内容')
    const pages = range.trim() ? 解析页码(range) : Array.from({length:文档.numPages}, (_,i)=>i+1)
    if (pages.some(n=>n>文档.numPages)) throw new Error(`文档共有 ${文档.numPages} 页，请检查范围`)
    const paragraphs:object[] = [], sheets:object[] = [], text:string[] = []
    for (const pageNumber of pages) {
      const page = await 文档.getPage(pageNumber)
      const content = await page.getTextContent()
      const rows = 提取文字行(content.items.filter(item=>'str' in item))
      if (!rows.length) throw new Error(`第 ${pageNumber} 页没有可提取的文字，请先进行 OCR 或选择其他页`)
      const lines = rows.map(row=>row.join(' '))
      if (format==='xlsx') {
        if (!rows.some(row=>row.length>1)) throw new Error(`第 ${pageNumber} 页没有可识别的表格列`)
        sheets.push({ 名称:`第${pageNumber}页`, 数据:rows.map(row=>row.map(value=>({
          值:/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && value.replace(/\D/g,'').length<=15 ? Number(value) : value,
        }))) })
      } else if (format==='docx') {
        if (paragraphs.length) paragraphs.push({类型:'分页符'})
        for (const line of lines) paragraphs.push({文字:[{文本:line}]})
      } else text.push(lines.join('\n'))
      page.cleanup()
    }
    if (format==='txt') return text.join('\n\n')
    const out = format==='docx' ? await 桥接.office.writeDocx({段落:paragraphs}) : await 桥接.office.writeXlsx({工作表:sheets})
    if (!out?.成功 || !out.数据) throw new Error(out?.错误 || '转换文件生成失败')
    return out.数据
  } finally { 关闭() }
}
