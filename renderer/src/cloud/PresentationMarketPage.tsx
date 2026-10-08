import {useEffect,useMemo,useRef,useState} from 'react'
import {App,Button,Checkbox,Input,InputNumber,Modal,Pagination,Select,Tag} from 'antd'
import {marketTemplates,marketCategories,marketStyles,createMarketDeck,type MarketTemplate} from '../data/presentationMarket'
import {创建演示文稿,type 演示文稿} from '../ppt/deck'
import {SlidePreview,预览页属性} from '../ppt/PptViews'
import {应用提纲生成,应用美化建议,页面版本表} from '../ppt/model/generation'
import {useAppStore} from '../store'
import {桥接} from '../ipc/bridge'
import {cloudCall,useCloud} from './CloudProvider'
import {extractUpload,readUpload,pdfImages} from './fileData'
import {recognizeScans} from './scanConsent'
import {reportPublic} from './reportPublic'
import {恢复导入图片} from '../ppt/render/resources'
import {收集演示资源标识} from '../ppt/model/migrations'
import Icon from '../components/Icon'
import {builtinIllustrationUrls,marketResourceEntries} from '../data/marketIllustrations'

type Tool='document'|'beautify'|'image'
export default function PresentationMarketPage(){
  const store=useAppStore(),cloud=useCloud(),{message,modal}=App.useApp()
  const [search,setSearch]=useState(''),[category,setCategory]=useState('all'),[page,setPage]=useState(1)
  const [preview,setPreview]=useState<演示文稿|null>(null),[tool,setTool]=useState<Tool|null>(null),[busy,setBusy]=useState(false)
  const [previewImages,setPreviewImages]=useState<Record<string,string>>({})
  useEffect(()=>{let valid=true;setPreviewImages(builtinIllustrationUrls);if(preview)void Promise.all(收集演示资源标识(preview).map(async id=>{const r=await 桥接.presentationResources.read(id);if(!r.成功||!r.数据)throw new Error(r.错误||'模板图片读取失败');return [id,`data:${preview.资源索引?.[id]?.类型||'image/png'};base64,${r.数据}`]})).then(entries=>{if(valid)setPreviewImages(Object.fromEntries(entries))}).catch(e=>{if(valid)setError(e.message)});return()=>{valid=false}},[preview])
  const [uploadTemplate,setUploadTemplate]=useState<{file:File;data:string;text:string}|null>(null),[templateName,setTemplateName]=useState(''),[templateCategory,setTemplateCategory]=useState(marketCategories[0]),[templateCover,setTemplateCover]=useState(''),[templateRights,setTemplateRights]=useState(false)
  const [source,setSource]=useState<File|null>(null),[topic,setTopic]=useState(''),[pages,setPages]=useState<number>(8),[consent,setConsent]=useState(false)
  const [outline,setOutline]=useState<any[]|null>(null),[sourceText,setSourceText]=useState(''),[styleIndex,setStyleIndex]=useState(0),[font,setFont]=useState('微软雅黑'),[before,setBefore]=useState<演示文稿|null>(null),[warnings,setWarnings]=useState<string[]>([])
  const [favorites,setFavorites]=useState<string[]>(()=>{try{const list=JSON.parse(localStorage.getItem('seal-market-favorites')||'[]');return Array.isArray(list)?list.filter(x=>typeof x==='string'):[]}catch{return []}})
  const favorite=(id:string)=>{const list=favorites.includes(id)?favorites.filter(v=>v!==id):[...favorites,id];try{localStorage.setItem('seal-market-favorites',JSON.stringify(list));setFavorites(list)}catch{message.error('收藏保存失败，请检查本机存储')}}
  const [publicItems,setPublicItems]=useState<any[]>([]),[myItems,setMyItems]=useState<any[]>([]),[publications,setPublications]=useState<any[]>([]),[scope,setScope]=useState('builtin'),[error,setError]=useState('')
  const templates=marketTemplates.filter(t=>(scope!=='favorites'||favorites.includes(t.id))&&(category==='all'||t.category===category)&&t.name.includes(search))
  const visible=templates.slice((page-1)*20,page*20)
  const covers=useMemo(()=>visible.map(t=>({template:t,deck:createMarketDeck(t)})),[search,category,page,scope,favorites])
  const context=useRef('');context.current=JSON.stringify([cloud.state.account?.id,cloud.state.account?.enabled,cloud.state.unlocked])
  const load=async()=>{const key=context.current;try{const publicResult=(await cloudCall('public')).items.filter((p:any)=>p.kind==='template');let privateItems:any[]=[],publicationsResult:any[]=[];if(cloud.state.account?.enabled&&cloud.state.unlocked){privateItems=(await cloudCall('list')).filter((n:any)=>n.kind==='file'&&!n.deleted&&n.meta.template);publicationsResult=(await cloudCall('myPublic')).items}if(key!==context.current)return;setPublicItems(publicResult);setMyItems(privateItems);setPublications(publicationsResult);setError('')}catch(e){if(key===context.current)setError(e instanceof Error?e.message:'模板服务读取失败')}}
  useEffect(()=>{setMyItems([]);setPublications([]);void load()},[cloud.state.account?.id,cloud.state.account?.enabled,cloud.state.unlocked])
  const run=async(task:()=>Promise<any>)=>{setBusy(true);try{await task()}catch(e){modal.error({title:'演示操作未完成',content:e instanceof Error?e.message:'操作失败'})}finally{setBusy(false)}}
  const openPreview=(template:MarketTemplate)=>void run(async()=>{const deck=createMarketDeck(template);const result=await 桥接.presentationResources.restore(marketResourceEntries(deck));if(!result.成功)throw new Error(result.错误||'模板配图恢复失败');setBefore(null);setWarnings([]);setPreview(deck)})
  const importDeck=async(name:string,data:string)=>{const result=await 桥接.office.readPptx(data);if(!result.成功||!result.演示文稿)throw new Error(result.错误||'演示解析失败');const deck=await 恢复导入图片(result);setBefore(null);setWarnings(result.警告||[]);setPreview({...deck,name});return deck}
  const finishOutline=async()=>{
    if(!outline?.length||outline.some(p=>!p.标题.trim()))throw new Error('请填写每一页的标题')
    const result=await 桥接.presentationGeneration.pages({请求标识:crypto.randomUUID(),提纲:outline})
    if(!result.成功||!result.数据)throw new Error(result.错误||'AI 未生成页面')
    const deck=创建演示文稿((topic.trim()||source?.name.replace(/\.[^.]+$/,'')||'智能演示')+'.pptx');deck.幻灯片列表=[]
    const generated=应用提纲生成(deck,result.数据.页面,{插入位置:0}),style=marketStyles[styleIndex]
    generated.幻灯片列表=generated.幻灯片列表.map(slide=>({...slide,背景色:style.paper,背景填充:{类型:'纯色',颜色:style.paper},文本框列表:slide.文本框列表.map((t,i)=>({...t,颜色:i===0?style.color:style.ink,字体:font})),备注:[slide.备注,source?`来源资料：${source.name}\n${sourceText.slice(0,6000)}`:'主题创作，发布前请核对事实与数据。'].filter(Boolean).join('\n')}))
    setBefore(null);setWarnings([]);setPreview(generated);setOutline(null)
  }
  const generate=async()=>{
    if(!consent)throw new Error('请同意本次 AI 处理资料');if(!source&&tool!=='document')throw new Error('请选择来源文件')
    if(tool==='document'&&outline){await finishOutline();return true}
    if(tool==='image'){
      const images=/\.pdf$/i.test(source!.name)?await pdfImages(await readUpload(source!,10*1024*1024)):[{location:'',mime:source!.type,data:await readUpload(source!,8*1024*1024)}]
      let combined:演示文稿|null=null
      for(const image of images){
        const result=await cloudCall('imagePresentation',{...image,name:source!.name+' '+image.location})
        const restored=await 桥接.presentationResources.restore(result.resources)
        if(!restored.成功)throw new Error(restored.错误||'图片资源恢复失败')
        if(!combined)combined=result.deck
        else{
          if(JSON.stringify(combined.页面尺寸)!==JSON.stringify(result.deck.页面尺寸))throw new Error('PDF 各页尺寸不同，请按相同尺寸分组识别')
          combined.幻灯片列表.push(...result.deck.幻灯片列表);combined.资源索引={...combined.资源索引,...result.deck.资源索引}
        }
      }
      setBefore(null);setWarnings(['识别结果需要校对文字、图形和图片区域。']);setPreview(combined);return true
    }
    if(tool==='beautify'){
      const result=await 桥接.office.readPptx(await readUpload(source!,10*1024*1024));if(!result.成功||!result.演示文稿)throw new Error(result.错误||'演示解析失败')
      const deck=await 恢复导入图片(result),response=await 桥接.presentationGeneration.beautify({请求标识:crypto.randomUUID(),页面列表:deck.幻灯片列表.map(p=>({页标识:p.id,版式:p.版式})),主题摘要:JSON.stringify(deck.幻灯片列表.map(p=>({标题:p.title,正文:p.文本框列表.map(t=>t.text)})))})
      if(!response.成功||!response.数据)throw new Error(response.错误||'AI 未返回美化建议');const styled=应用美化建议(deck,response.数据.建议,页面版本表(deck)),style=marketStyles[styleIndex];styled.幻灯片列表=styled.幻灯片列表.map(s=>({...s,背景色:style.paper,背景填充:{类型:'纯色' as const,颜色:style.paper},文本框列表:s.文本框列表.map((t,i)=>({...t,字体:font,颜色:i===0?style.color:style.ink}))}));setBefore(deck);setWarnings(result.警告||[]);setPreview(styled);return true
    }
    const passages=source?await extractUpload(source.name,await readUpload(source,10*1024*1024),images=>recognizeScans(modal,images)):[]
    const content=passages.map(p=>`${p.location}\n${p.text}`).join('\n\n')
    if(source&&!content.trim())throw new Error('文件没有可提取的文字，请先识别扫描件')
    if(content.length>100000)throw new Error('文字超过本次生成的 10 万字限制，请选择范围更小的资料')
    const outlineResult=await 桥接.presentationGeneration.outline({请求标识:crypto.randomUUID(),主题:topic.trim()||source?.name||'',页数:pages,风格:'专业清晰，适合口头汇报',素材约束:content||undefined})
    if(!outlineResult.成功||!outlineResult.数据)throw new Error(outlineResult.错误||'AI 未生成提纲')
    setSourceText(content);setOutline(outlineResult.数据.提纲);return false
  }
  return <section className="seal-cloud-page seal-market"><header><div><h1>海豹演示创作</h1><p>300 套原创内置模板 · 30 个主题 × 10 种视觉方案</p></div><Button icon={<Icon name="retry" color="#2463EB"/>} onClick={()=>void load()}>刷新在线模板</Button></header>
    <div className="seal-market-tools">{([{id:'document',icon:'doc-ppt',title:'文档生成演示',desc:'文字 / PDF / Markdown / 表格转演示'},{id:'beautify',icon:'format-painter',title:'美化演示',desc:'保留内容，调整字号、对齐和背景'},{id:'image',icon:'image',title:'图片转可编辑演示',desc:'识别文字、图形与图片区域'}] as const).map(t=><button key={t.id} data-tool={t.id} onClick={()=>{setTool(t.id);setSource(null);setConsent(false);setOutline(null);setSourceText('')}}><span className="seal-tool-icon"><Icon name={t.icon} size={30}/></span><strong>{t.title}</strong><span className="seal-tool-desc">{t.desc}</span><span className="seal-tool-arrow" aria-hidden="true">→</span></button>)}</div>
    <div className="seal-cloud-actions"><Select aria-label="模板来源" value={scope} onChange={v=>{setScope(v);setPage(1)}} options={[{value:'builtin',label:'内置模板'},{value:'favorites',label:'我的收藏'},{value:'mine',label:'我的模板'},{value:'public',label:'公开模板市场'}]}/><Select aria-label="模板分类" value={category} onChange={v=>{setCategory(v);setPage(1)}} options={[{value:'all',label:'全部分类'},...marketCategories.map(v=>({value:v,label:v}))]}/><Input.Search aria-label="搜索演示模板" placeholder="搜索模板" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} style={{maxWidth:260}}/>
      <label className="ant-btn"><input type="file" hidden accept=".pptx" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;void run(async()=>{const data=await readUpload(f,10*1024*1024);const deck=await importDeck(f.name,data);if(!deck.幻灯片列表.length)throw new Error('模板至少需要一张可编辑页面');if(cloud.state.account?.enabled&&cloud.state.unlocked){setPreview(null);setUploadTemplate({file:f,data,text:JSON.stringify(deck.幻灯片列表.map((p,i)=>({location:`第 ${i+1} 页`,text:[p.title,...p.文本框列表.map(t=>t.text)].join('\n')})))});setTemplateName(f.name.replace(/\.pptx$/i,''));setTemplateCategory(marketCategories[0]);setTemplateCover('');setTemplateRights(false)}else message.info('已在本机打开；开通云空间后可以保存和发布模板')})}}/><Icon name="export-file" size={16}/> 上传自己的模板</label></div>
    {error?<p className="seal-cloud-error">{error}</p>:null}
    {['builtin','favorites'].includes(scope)?<><div className="seal-market-grid">{covers.map(({template,deck})=><article key={template.id}><button aria-label={`预览 ${template.name}`} onClick={()=>openPreview(template)}><SlidePreview 幻灯片={deck.幻灯片列表[0]} 图片地址={builtinIllustrationUrls} {...预览页属性(deck,deck.幻灯片列表[0],0)}/></button><h3>{template.name}</h3><p>9 页 · 原生图表与表格 · 可编辑</p><Button size="small" aria-label={`收藏 ${template.name}`} onClick={()=>favorite(template.id)}>{favorites.includes(template.id)?'取消收藏':'收藏模板'}</Button></article>)}</div><Pagination current={page} pageSize={20} total={templates.length} showSizeChanger={false} onChange={setPage}/></>:<div className="seal-cloud-list">
      {(scope==='mine'?myItems:publicItems).filter(p=>(p.meta?.name||p.title).includes(search)&&(category==='all'||(p.meta?.category||p.category)===category)).map(p=><article className="seal-cloud-card" key={p.id}><Tag>{scope==='mine'?'我的模板':'公开模板'}</Tag><h3>{p.meta?.name||p.title}</h3><p>{p.meta?.category||p.category||'未分类'} · {p.version?`版本 ${p.version}`:'审核公开'}</p>{(p.meta?.cover||p.cover)?<img src={p.meta?.cover||p.cover} alt="模板封面"/>:null}<Button loading={busy} onClick={()=>void run(async()=>{const file=scope==='mine'?await cloudCall('rawDownload',{id:p.id}):await cloudCall('publicDownloadData',{id:p.id});await importDeck(file.name||p.title,file.data)})}>预览与使用</Button>{scope==='mine'?<Button onClick={()=>{const pub=publications.find(q=>q.node_id===p.id&&['pending','approved'].includes(q.status));if(pub){void run(async()=>{await cloudCall('withdraw',{id:pub.id});await load()})}else modal.confirm({title:'申请公开此模板？',content:'公开后其他用户及管理员可读取和下载。请确认你拥有发布权利。',onOk:()=>run(async()=>{await cloudCall('publish',{id:p.id,kind:'template',consent:true,category});await load()})})}}>{publications.some(q=>q.node_id===p.id&&['pending','approved'].includes(q.status))?'撤回公开':'申请公开'}</Button>:<Button onClick={()=>cloud.state.account?reportPublic(modal,message,p.id):cloud.configure()}>举报</Button>}{scope==='mine'?<label className="ant-btn"><input type="file" hidden accept=".pptx" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(async()=>{const data=await readUpload(file,10*1024*1024);await importDeck(file.name,data);await cloudCall('replaceTemplate',{id:p.id,data});await load();await cloud.refresh()})}}/>替换版本</label>:null}</article>)}
    </div>}
    <Modal title="上传演示模板" open={Boolean(uploadTemplate)} centered confirmLoading={busy} onCancel={()=>setUploadTemplate(null)} okText="加密保存模板" okButtonProps={{disabled:!templateName.trim()||!templateRights}} onOk={()=>run(async()=>{if(!uploadTemplate)return;const r=await cloudCall('save',{linkId:crypto.randomUUID(),name:templateName.trim(),filename:uploadTemplate.file.name,data:uploadTemplate.data,template:true,text:uploadTemplate.text,cover:templateCover,category:templateCategory,license:'上传者确认拥有使用及发布权利'});setUploadTemplate(null);await load();await cloud.refresh();message.info(r.statuses[r.id]==='云端已保存'?'模板已保存，可在我的模板预览、替换版本及申请公开':'模板已在本机加密保留，请到云空间检查待同步状态')})}>
      <Input aria-label="模板名称" maxLength={120} value={templateName} onChange={e=>setTemplateName(e.target.value)}/><p>原文件：{uploadTemplate?.file.name} · 最多 10 MiB</p><Select aria-label="上传模板分类" style={{width:'100%'}} value={templateCategory} onChange={setTemplateCategory} options={marketCategories.map(v=>({value:v,label:v}))}/><p><label>封面图片 <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{if(file.size>700000)throw new Error('封面最多 700 KB');setTemplateCover(`data:${file.type};base64,${await readUpload(file)}`)})}}/></label></p><Checkbox checked={templateRights} onChange={e=>setTemplateRights(e.target.checked)}>我拥有此模板的使用权，申请公开时拥有相应发布权</Checkbox><p>上传默认为私有。公开副本需另行确认并经审核，替换公开模板须先撤回再申请。</p>
    </Modal>
    <Modal title={tool==='document'?'文档生成演示':tool==='beautify'?'美化演示':'图片转可编辑演示'} open={Boolean(tool)} centered width={740} onCancel={()=>!busy&&setTool(null)} confirmLoading={busy} okText={tool==='document'?(outline?'确认提纲并生成':'生成提纲'):'开始处理'} okButtonProps={{disabled:!consent||(!source&&!topic.trim())}} onOk={()=>run(async()=>{if(await generate())setTool(null)})}>
      {tool==='document'?<><Input aria-label="演示主题" placeholder="填写主题，可同时上传参考文档" value={topic} onChange={e=>{setTopic(e.target.value);setOutline(null)}}/><p>页数 <InputNumber min={1} max={30} value={pages} onChange={v=>{setPages(v||8);setOutline(null)}}/></p></>:null}
      <input aria-label="AI 来源文件" type="file" accept={tool==='image'?'image/png,image/jpeg,image/webp,.pdf':tool==='beautify'?'.pptx':'.docx,.pdf,.xlsx,.txt,.md'} onChange={e=>{setSource(e.target.files?.[0]||null);setOutline(null)}}/><p>{source?.name}</p>
      {tool!=='image'?<div className="seal-cloud-actions"><Select aria-label="演示视觉模板" value={styleIndex} onChange={setStyleIndex} options={marketStyles.map((s,i)=>({value:i,label:s.name}))}/><Select aria-label="统一字体" value={font} onChange={setFont} options={['微软雅黑','宋体','黑体','Arial'].map(v=>({value:v,label:v}))}/></div>:null}
      {outline?<div className="seal-knowledge-source"><h3>确认并编辑提纲</h3>{outline.map((p,i)=><div key={p.页标识}><p>第 {i+1} 页</p><Input aria-label={`第 ${i+1} 页标题`} value={p.标题} maxLength={160} onChange={e=>setOutline(outline.map((v,j)=>i===j?{...v,标题:e.target.value}:v))}/><Input.TextArea aria-label={`第 ${i+1} 页要点`} value={p.要点.join('\n')} onChange={e=>setOutline(outline.map((v,j)=>i===j?{...v,要点:e.target.value.split('\n').filter(Boolean)}:v))}/></div>)}{sourceText?<details><summary>查看来源资料与位置</summary><pre>{sourceText}</pre></details>:null}</div>:null}
      <Checkbox checked={consent} onChange={e=>setConsent(e.target.checked)}>同意将本次来源资料发送给当前配置的 AI 服务处理</Checkbox><p>生成后先预览。图片识别需要当前服务支持图像输入。</p>
    </Modal>
    <Modal title={preview?.name} width={1050} open={Boolean(preview)} onCancel={()=>setPreview(null)} okText="使用并编辑副本" onOk={()=>{if(preview)store.createDoc('ppt',preview,{名称:preview.name});setPreview(null)}}>{warnings.length?<div className="seal-cloud-error">{warnings.map((w,i)=><p key={i}>{w}</p>)}</div>:null}<div className="seal-market-preview">{preview?.幻灯片列表.map((slide,i)=><div key={slide.id}>{before?.幻灯片列表[i]?<><p>原始页面</p><SlidePreview 幻灯片={before.幻灯片列表[i]} 图片地址={previewImages} {...预览页属性(before,before.幻灯片列表[i],i)}/><p>美化结果</p></>:null}<SlidePreview 幻灯片={slide} 图片地址={previewImages} {...预览页属性(preview,slide,i)}/><p>第 {i+1} 页 · {slide.title}</p></div>)}</div></Modal>
  </section>
}
