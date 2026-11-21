import { useRef } from 'react'
import { App } from 'antd'
import { pickNativeFiles } from './native'

export default function UtilityFileButton({label,accept,onFile,disabled=false}:{label:string;accept:string;onFile:(file:File)=>void|Promise<void>;disabled?:boolean}) {
  const 输入=useRef<HTMLInputElement>(null)
  const {modal}=App.useApp()
  const 接收 = async (文件?: File) => {
    if (!文件) return
    try { await onFile(文件) }
    catch (异常) { modal.error({title:'读取文件失败', content:异常 instanceof Error ? 异常.message : '请重新选择可读取的文件。', okText:'确定'}) }
  }
  const 选择 = async () => {
    if (!window.sealNative) { 输入.current?.click(); return }
    try { await 接收((await pickNativeFiles(false))[0]) }
    catch (异常) { modal.error({title:'无法打开文件',content:异常 instanceof Error ? 异常.message : '请关闭选择器并重试。',okText:'确定'}) }
  }
  return <><input ref={输入} type="file" aria-label={label} accept={accept} hidden onChange={e=>{ const 文件=e.target.files?.[0]; e.target.value=''; void 接收(文件) }}/><button type="button" disabled={disabled} onClick={()=>void 选择()}>{label}</button></>
}
