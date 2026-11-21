import { useEffect, useRef, useState } from 'react'
import { App } from 'antd'
import { 桥接 } from '../../renderer/src/ipc/bridge'
import { downloadFile } from './native'
import { 比对原文 } from './utilityProcessing'
import UtilityFileButton from './UtilityFileButton'

type 工具='paper-check'|'professional-check'|'paper-rewrite'|'translate-text'
async function 读取文稿(文件:File) {
  if (/\.docx$/i.test(文件.name)) {
    const {extractRawText}=await import('mammoth')
    const 结果=await extractRawText({arrayBuffer:await 文件.arrayBuffer()})
    if (!结果.value.trim()) throw new Error('此文档没有可读正文。')
    return 结果.value
  }
  if (!/\.(txt|md)$/i.test(文件.name) && !文件.type.startsWith('text/')) throw new Error('请选择 TXT、Markdown 或 DOCX 文件。')
  const 文本=await 文件.text()
  if (!文本.trim()) throw new Error('所选文件为空。')
  return 文本
}
/** 单次服务请求按段落分组，超长单段按字符切分。 */
function 服务分段(原文:string) {
  const 段落:string[]=[]
  for (const 行 of 原文.split(/\r?\n/)) {
    if (!行.trim()) continue
    const 字=Array.from(行)
    for(let i=0;i<字.length;i+=1400) {
      const 段=字.slice(i,i+1400).join(''), 尾=段落.length-1
      if (尾>=0 && 段落[尾].length+段.length<1500) 段落[尾]+='\n'+段
      else 段落.push(段)
    }
  }
  return 段落
}
export default function TextUtility({tool}:{tool:工具}) {
  const 本地=tool==='paper-check'||tool==='professional-check'
  const [正文,设正文]=useState(''),[对照,设对照]=useState(''),[语言,设语言]=useState('英语')
  const [同意,设同意]=useState(false),[结果,设结果]=useState(''),[进度,设进度]=useState(''),[忙,设忙]=useState(false)
  const 代次=useRef(0), 正在请求=useRef(''), {modal,message}=App.useApp()
  const 停止 = () => { 代次.current++; if(正在请求.current) void 桥接.ai.stop(正在请求.current); 正在请求.current='' }
  useEffect(()=>()=>{停止()},[])
  const 更改正文=(文:string)=>{设正文(文);设结果('');设同意(false)}
  const 执行=async()=>{
    if(忙) return
    const 本次=++代次.current
    设忙(true); 设结果(''); 设进度('')
    try {
      if (!正文.trim()) throw new Error('请先输入或导入正文。')
      if (本地) {
        const 比对=比对原文(正文,对照)
        const 引用=tool==='professional-check' ? [
          '', '职称稿引文核对',
          '正文中的序号引文 '+(正文.match(/[［\[]\d+(?:\s*[-,，、]\s*\d+)*[］\]]/g)||[]).length+' 处。',
          /参考文献\s*[\r\n：:]/.test(正文) ? '已找到参考文献段落，请核对每条引文的出处。' : '未找到参考文献段落，请核对引文出处。',
        ] : []
        设结果(['与所选对照材料重合 '+比对.比例+'%', '共 '+比对.总字数+' 个有效字符，其中 '+比对.重合字数+' 个重合。', ...引用, '', ...比对.匹配.map((段,i)=>(i+1)+'. '+段)].join('\n'))
        return
      }
      if (!同意) throw new Error('请先确认向已配置的服务发送正文。')
      const 段落=服务分段(正文), 输出:string[]=[]
      for(let i=0;i<段落.length;i++) {
        if (代次.current!==本次) return
        设进度('正在处理第 '+(i+1)+' / '+段落.length+' 段')
        const 请求标识=crypto.randomUUID()
        正在请求.current=请求标识
        if(tool==='translate-text') {
          const 返回=await 桥接.presentationAi.translate({请求标识, 条目:[{对象标识:'正文',原文:段落[i]}], 目标语言:语言})
          const 文=返回.数据?.译文?.find(项=>项.对象标识==='正文')?.译文.trim()
          if(!返回.成功||!文) throw new Error(返回.错误||'服务没有返回本段译文，请核对翻译配置。')
          输出.push(文)
        } else {
          const 返回=await 桥接.ai.chat({请求标识,文档上下文:'',只读对话:true,消息:[{角色:'user',内容:'请对下列中文学术段落进行语言改写，保留事实、术语、数据和引文标记。只给出改写正文。\n\n'+段落[i]}]})
          const 文=返回.数据?.内容?.trim()
          if(!返回.成功||!文||返回.数据?.已停止) throw new Error(返回.错误||'服务没有返回完整的改写结果。')
          输出.push(文)
        }
        if(代次.current===本次) 设结果(输出.join('\n\n'))
      }
    } catch(错误) {
      if(代次.current===本次) modal.error({title:'处理未完成',content:错误 instanceof Error?错误.message:'请检查输入后重试。',okText:'确定'})
    } finally { if(代次.current===本次){设忙(false);设进度('');正在请求.current=''} }
  }
  return <>
    <div className="seal-util-card">
      <div className="seal-util-row"><UtilityFileButton label="导入正文" accept=".txt,.md,.docx" disabled={忙} onFile={async f=>更改正文(await 读取文稿(f))}/></div>
      <label className="seal-util-label">正文<textarea value={正文} disabled={忙} onChange={e=>更改正文(e.target.value)}/></label>
      {本地 ? <>
        <p>按连续八个相同字符比对你提供的两份材料，标出重合内容和比例。</p>
        <div><UtilityFileButton label="导入对照材料" accept=".txt,.md,.docx" onFile={async f=>{设对照(await 读取文稿(f));设结果('')}}/></div>
        <label className="seal-util-label">对照材料<textarea value={对照} onChange={e=>{设对照(e.target.value);设结果('')}}/></label>
      </> : <>
        {tool==='translate-text' && <label className="seal-util-label">目标语言<select value={语言} disabled={忙} onChange={e=>{设语言(e.target.value);设结果('')}}>{['英语','简体中文','繁体中文','日语','韩语','法语','德语','西班牙语'].map(文=><option key={文}>{文}</option>)}</select></label>}
        <label className="seal-util-consent"><input type="checkbox" disabled={忙} checked={同意} onChange={e=>设同意(e.target.checked)}/>同意将上述正文发送到本应用已配置的{tool==='translate-text'?'翻译':'文字模型'}服务。</label>
      </>}
      <div className="seal-util-row"><button className="seal-util-primary" disabled={忙||!正文.trim()||(本地?!对照.trim():!同意)} onClick={()=>void 执行()}>{本地?'开始比对':tool==='translate-text'?'开始翻译':'生成改写稿'}</button>
      {忙 && <button onClick={()=>{停止();设忙(false);设进度('处理已停止')}}>停止处理</button>}</div>
      {进度 && <p role="status">{进度}</p>}
    </div>
    {结果 && <div className="seal-util-card"><label className="seal-util-label">处理结果<textarea rows={8} value={结果} onChange={e=>设结果(e.target.value)} disabled={忙}/></label>
      <div className="seal-util-row"><button disabled={忙} onClick={()=>void downloadFile((本地?'文字比对报告':tool==='translate-text'?'全文译稿':'改写稿')+'.txt',new TextEncoder().encode(结果),'text/plain;charset=utf-8').catch(()=>modal.error({title:'保存失败',content:'请选择可写入的位置后重试。'}))}>保存文本</button>
      <button disabled={忙} onClick={()=>void (async()=>{try{await navigator.clipboard.writeText(结果);message.success('已复制')}catch{modal.info({title:'请手动复制',content:'长按结果文本并选择复制。'})}})()}>复制</button></div></div>}
  </>
}
