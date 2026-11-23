import { Input } from 'antd'
import type { HookAPI } from 'antd/es/modal/useModal'
import { 载入PDF } from '../pdf/pdfLoader'
import { 解析页码 } from '../pdf/pdfCommands'
import { 提取文字行 } from '../pdf/pdfConversion'
import { 最大批量, 读取字节 } from './scanInput'

import { PDF来源 } from './pdfPageSource'
const jpeg = (canvas: HTMLCanvasElement) => new Promise<Blob>((ok,fail) => canvas.toBlob(blob => blob ? ok(blob) : fail(new Error('PDF 页面无法生成图片')), 'image/jpeg', .93))

function 输入密码(modal: HookAPI, 错误: boolean) {
  return new Promise<string | null>(resolve => {
    let password = ''
    modal.confirm({ title: 错误 ? '密码错误，请重新输入' : '输入 PDF 打开密码', content:<Input.Password autoFocus onChange={e => { password = e.target.value }}/>,
      okText:'打开',cancelText:'取消',onOk:() => resolve(password),onCancel:() => resolve(null) })
  })
}
async function 打开(file: File, modal: HookAPI) {
  const bytes = await 读取字节(file)
  let password: string | undefined
  for (;;) {
    try { return await 载入PDF(bytes,password) }
    catch (err) {
      if (!(err instanceof Error) || err.name !== 'PasswordException') throw err
      const next = await 输入密码(modal,password !== undefined)
      if (next === null) return null
      password = next
    }
  }
}
export async function 导入PDF页(file: File, modal: HookAPI, quota: number, report: (error: string) => void) {
  const pdf = await 打开(file,modal)
  if (!pdf) return []
  const files: File[] = []
  try {
    const permissions = await pdf.文档.getPermissions()
    if (permissions && !permissions.has(16)) throw new Error('此 PDF 限制复制内容')
    const count = pdf.文档.numPages, max = Math.min(quota,最大批量)
    if (max < 1) throw new Error('当前批次已满，请先处理现有页面。')
    const thumb = document.createElement('canvas')
    let thumbnail = ''
    try {
      const first = await pdf.文档.getPage(1), size = first.getViewport({scale:1})
      const viewport = first.getViewport({scale:160/Math.max(size.width,size.height)})
      thumb.width = Math.ceil(viewport.width); thumb.height = Math.ceil(viewport.height)
      await first.render({canvas:thumb,viewport}).promise
      thumbnail = thumb.toDataURL('image/jpeg')
    } catch { /* A damaged first page does not prevent selecting later pages. */ }
    finally { thumb.width = thumb.height = 0 }
    const pages = await new Promise<number[]>(resolve => {
      let range = count > max ? '1-' + max : ''
      modal.confirm({ title:file.name, okText:'导入', cancelText:'取消',
        content:<div>{thumbnail && <img src={thumbnail} alt="PDF 首页预览"/>}<p>共 {count} 页</p>
          <Input aria-label="导入页码" placeholder="全部页面，或输入 1,3-5" defaultValue={range} onChange={e => { range = e.target.value }}/></div>,
        onOk:() => {
          try {
            const selected = range.trim() ? 解析页码(range.replace(/，/g,',')) : Array.from({length:count},(_,i)=>i+1)
            if (!selected.length || selected.some(n => n > count) || selected.length > max) throw new Error('请选择有效页码，本批最多 ' + max + ' 页')
            resolve(selected)
          } catch (e) { report((e as Error).message); return Promise.reject(e) }
        },onCancel:() => resolve([]) })
    })
    for (const number of pages) {
      const canvas = document.createElement('canvas')
      try {
        const page = await pdf.文档.getPage(number), size = page.getViewport({scale:1})
        const viewport = page.getViewport({scale:Math.min(2.5,2400/Math.max(size.width,size.height))})
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        const text = (await page.getTextContent()).items.filter(item => 'str' in item)
        const 文字 = 提取文字行(text).map(row => row.join('\t')).join('\n')
        await page.render({canvas,viewport,recordImages:!!文字}).promise
        const img = new File([await jpeg(canvas)],file.name + ' · 第 ' + number + ' 页.jpg',{type:'image/jpeg'})
        const 待识别图块: Blob[] = []
        const coords: ArrayLike<number> = page.imageCoordinates ?? []
        for (let i = 0; i < coords.length; i += 6) {
          const xs = [coords[i],coords[i+2],coords[i+4],coords[i+2]+coords[i+4]-coords[i]]
          const ys = [coords[i+1],coords[i+3],coords[i+5],coords[i+3]+coords[i+5]-coords[i+1]]
          const x = Math.max(0,Math.floor(Math.min(...xs)*canvas.width)), y = Math.max(0,Math.floor(Math.min(...ys)*canvas.height))
          const w = Math.min(canvas.width-x,Math.ceil(Math.max(...xs)*canvas.width)-x), h = Math.min(canvas.height-y,Math.ceil(Math.max(...ys)*canvas.height)-y)
          if (w < 16 || h < 12) continue
          const crop = document.createElement('canvas')
          try { crop.width=w; crop.height=h; crop.getContext('2d')!.drawImage(canvas,x,y,w,h,0,0,w,h); 待识别图块.push(await jpeg(crop)) }
          finally { crop.width=crop.height=0 }
        }
        PDF来源.set(img,{ 文件名:file.name, 页码:number, 文字, 待识别图块 }); files.push(img); page.cleanup()
      } catch (err) { report(file.name + ' · 第 ' + number + ' 页：' + (err instanceof Error ? err.message : '读取失败')) }
      finally { canvas.width = canvas.height = 0 }
    }
    return files
  } finally { pdf.关闭() }
}
