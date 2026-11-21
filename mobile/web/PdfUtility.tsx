import { useState } from 'react'
import { 转换PDF演示, 转换PDF文字 } from '../../renderer/src/pdf/pdfConversion'
import { 编码PDF数据, 解码PDF数据 } from '../../renderer/src/pdf/pdfLoader'
import { downloadFile } from './native'
import UtilityFileButton from './UtilityFileButton'

export default function PdfUtility({tool}:{tool:'pdf-word'|'pdf-excel'|'pdf-ppt'|'pdf-table'}) {
  const [file,setFile]=useState<File|null>(null), [range,setRange]=useState(''), [busy,setBusy]=useState(false), [status,setStatus]=useState('')
  const [preview,setPreview]=useState<string[][]>([])
  const ext=tool==='pdf-word'?'docx':tool==='pdf-ppt'?'pptx':'xlsx'
  async function convert() {
    if (!file || busy) return
    setBusy(true); setStatus('正在转换…'); setPreview([])
    try {
      const data=编码PDF数据(new Uint8Array(await file.arrayBuffer()))
      const bytes=ext==='pptx'?await 转换PDF演示(data,range):解码PDF数据(await 转换PDF文字(data,ext,range,undefined,{
        只取表格:tool==='pdf-table',预览:(_page,rows)=>setPreview(p=>[...p,...rows].slice(0,6))
      }))
      await downloadFile(file.name.replace(/\.pdf$/i,'')+'.'+ext,bytes)
      setStatus('文件已导出')
    } catch(e) {setStatus(e instanceof Error?e.message:'文件转换失败')}
    finally {setBusy(false)}
  }
  return <div className="seal-util-card"><UtilityFileButton label="选择 PDF" disabled={busy} accept=".pdf,application/pdf" onFile={f=>{
    if(!/\.pdf$/i.test(f.name)||!f.size) throw new Error('请选择有内容的 PDF 文件')
    setFile(f);setStatus('');setPreview([])
  }}/>{file&&<p>{file.name}</p>}
    <label className="seal-util-label">页码范围<input value={range} disabled={busy} onChange={e=>setRange(e.target.value)} placeholder="全部页，或 1-3,5"/></label>
    {ext==='pptx'&&<p>每页转为一张图片幻灯片。</p>}
    <button className="seal-util-primary" disabled={!file||busy} onClick={()=>void convert()}>导出 {ext.toUpperCase()}</button>
    {preview.length>0&&<div style={{overflowX:'auto'}}><table aria-label="提取的表格"><tbody>{preview.map((row,i)=><tr key={i}>{row.map((s,j)=><td key={j}>{s}</td>)}</tr>)}</tbody></table></div>}
    {status&&<p role="status">{status}</p>}
  </div>
}
