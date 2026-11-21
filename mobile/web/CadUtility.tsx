import { useState } from 'react'
import { cadPath, drawingBounds, drawingPdf, readDxf, writeDxf } from './cadDrawing'
import UtilityFileButton from './UtilityFileButton'
import { downloadFile } from './native'

export default function CadUtility({mode}:{mode:'cad-edit'|'cad-pdf'}) {
  const [source,setSource] = useState(''), [name,setName] = useState('图纸'), [status,setStatus] = useState('')
  const [entities,setEntities] = useState<ReturnType<typeof readDxf>>([]), [busy,setBusy]=useState(false)
  const bounds = entities.length ? drawingBounds(entities) : null
  const validate = (text:string) => {
    const parsed = readDxf(text)
    setEntities(parsed); setStatus(parsed.length+' 个图元')
    return parsed
  }
  const save = async(pdf:boolean) => {
    setBusy(true)
    try {
      const parsed = validate(source)
      await downloadFile(name+(pdf?'.pdf':'-编辑.dxf'),pdf?await drawingPdf(parsed):new TextEncoder().encode(writeDxf(parsed)),pdf?'application/pdf':'application/dxf')
    } catch(e) { setStatus(e instanceof Error ? e.message : '无法导出图纸') }
    finally { setBusy(false) }
  }
  return <div className="seal-util-card">
    <p>二维 ASCII DXF · 直线、多段线、圆和圆弧</p>
    <UtilityFileButton label="选择 DXF 图纸" accept=".dxf" disabled={busy} onFile={async file=>{
      if (file.size>12*1024*1024) throw new Error('图纸超过 12 MiB')
      const text = await file.text(); validate(text); setSource(text); setName(file.name.replace(/\.dxf$/i,''))
    }}/>
    {bounds && <svg role="img" aria-label="图纸预览" className="seal-util-preview" width="100%" height="260" viewBox={[bounds.left-1,bounds.top-1,bounds.width+2,bounds.height+2].join(' ')}>
      {entities.map((e,i)=><path key={i} d={cadPath(e)} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>)}
    </svg>}
    {mode==='cad-edit' && <label className="seal-util-label">DXF 图元与坐标<textarea rows={7} value={source} spellCheck={false} onChange={e=>{setSource(e.target.value);setEntities([]);setStatus('')}}/></label>}
    <div className="seal-util-row">{mode==='cad-edit' && <button disabled={!source||busy} onClick={()=>{try{validate(source)}catch(e){setStatus((e as Error).message)}}}>预览修改</button>}
    <button className="seal-util-primary" disabled={!source||busy} onClick={()=>void save(mode==='cad-pdf')}>{mode==='cad-edit'?'保存 DXF':'导出 A4 PDF'}</button></div>
    {status&&<p role="status">{status}</p>}
  </div>
}
