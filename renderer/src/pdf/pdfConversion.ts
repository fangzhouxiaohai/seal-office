import { 载入PDF, 编码PDF数据 } from './pdfLoader'
import { 解析页码 } from './pdfCommands'
import { 桥接 } from '../ipc/bridge'
import JSZip from 'jszip'
import type { PDFPageProxy } from 'pdfjs-dist'

async function 渲染页面图片(page: PDFPageProxy) {
  const canvas = document.createElement('canvas')
  try {
    const size = page.getViewport({scale: 1})
    const scale = Math.min(2, 16384 / Math.max(size.width, size.height), Math.sqrt(16000000 / (size.width * size.height)))
    const viewport = page.getViewport({scale})
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))
    await page.render({canvas, viewport}).promise
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value =>
      value ? resolve(value) : reject(new Error('页面图片生成失败')), 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

export async function 转换PDF图片(data:string, range:string) {
  const { 文档, 关闭 } = await 载入PDF(data)
  try {
    const permissions = await 文档.getPermissions()
    if (permissions && !permissions.has(16)) throw new Error('此 PDF 限制复制内容')
    const pages = range.trim() ? 解析页码(range) : Array.from({length:文档.numPages}, (_,i)=>i+1)
    if (pages.some(n=>n>文档.numPages)) throw new Error(`文档共有 ${文档.numPages} 页，请检查范围`)
    const zip = new JSZip()
    for (const number of pages) {
      const page = await 文档.getPage(number)
      try {
        const bytes = await 渲染页面图片(page)
        if (pages.length===1) return {extension:'png',bytes}
        zip.file(`第${String(number).padStart(String(文档.numPages).length,'0')}页.png`,bytes)
      } finally { page.cleanup() }
    }
    return {extension:'zip',bytes:await zip.generateAsync({type:'uint8array'})}
  } finally { 关闭() }
}

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

export async function 转换PDF演示(数据: string, 范围: string): Promise<Uint8Array> {
  const { 文档, 关闭 } = await 载入PDF(数据)
  try {
    const 权限 = await 文档.getPermissions()
    if (权限 && !权限.has(16)) throw new Error('此 PDF 限制复制内容')
    const 页码 = 范围.trim() ? 解析页码(范围) : Array.from({ length: 文档.numPages }, (_, i) => i + 1)
    if (!页码.length || 页码.some(n => n > 文档.numPages)) throw new Error(`文档共有 ${文档.numPages} 页，请检查范围`)
    const 演示 = new (await import('pptxgenjs')).default()
    let 版宽 = 0, 版高 = 0
    for (const n of 页码) {
      const 页 = await 文档.getPage(n)
      try {
        const { width, height } = 页.getViewport({ scale: 1 })
        if (!版宽) {
          const 比例 = 12 / Math.max(width, height)
          版宽 = width * 比例; 版高 = height * 比例
          演示.defineLayout({ name: '扫描页面', width: 版宽, height: 版高 }); 演示.layout = '扫描页面'
        }
        const 比例 = Math.min(版宽 / width, 版高 / height), w = width * 比例, h = height * 比例
        const 图片 = await 渲染页面图片(页)
        演示.addSlide().addImage({ data: 'image/png;base64,' + 编码PDF数据(图片), x: (版宽 - w) / 2, y: (版高 - h) / 2, w, h, altText: `原 PDF 第 ${n} 页` })
      } finally { 页.cleanup() }
    }
    return await 演示.write({ outputType: 'uint8array' }) as Uint8Array
  } finally { 关闭() }
}

export async function 转换PDF文字(data:string, format:'docx'|'xlsx'|'txt', range:string,
  识别扫描页?: (页码: number, 图片: Uint8Array) => Promise<string[][]>,
  表格选项?: { 只取表格: boolean; 预览: (页码: number, 行: string[][]) => void }) {
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
      let rows = 提取文字行(content.items.filter(item=>'str' in item))
      if (!rows.length && 识别扫描页) rows = await 识别扫描页(pageNumber, await 渲染页面图片(page))
      if (format === 'xlsx' && 表格选项?.只取表格) {
        rows = rows.filter(行 => 行.length > 1)
        if (!rows.length) { page.cleanup(); continue }
      }
      if (!rows.length) throw new Error(`第 ${pageNumber} 页没有可提取的文字，请启用扫描页识别、导出 PNG 或选择其他页`)
      const lines = rows.map(row=>row.join(' '))
      if (format==='xlsx') {
        表格选项?.预览(pageNumber, rows)
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
    if (format === 'xlsx' && 表格选项?.只取表格 && !sheets.length) throw new Error('所选页面没有可提取的表格行列')
    if (format==='txt') return text.join('\n\n')
    const out = format==='docx' ? await 桥接.office.writeDocx({段落:paragraphs}) : await 桥接.office.writeXlsx({工作表:sheets})
    if (!out?.成功 || !out.数据) throw new Error(out?.错误 || '转换文件生成失败')
    return out.数据
  } finally { 关闭() }
}
