<script setup lang="ts">
import {computed,h,nextTick,onMounted,onUnmounted,ref} from 'vue'
import {NButton} from 'naive-ui'
type Asset={id:string;platform:string;version:string;filename:string;sha256:string;bytes:number;url:string}
type Platform={key:string;label:string;extension:string;filename:(version:string)=>string;hint:string}
const props=defineProps<{
  call:(route:string,method?:string,body?:unknown)=>Promise<any>
  upload:(platform:string,version:string,file:File,progress:(value:number)=>void,signal:AbortSignal)=>Promise<{item:Asset}>
}>()
const platforms:Platform[]=[
  {key:'windows',label:'Windows 安装版',extension:'.exe',filename:v=>`seal-office-setup-${v}.exe`,hint:'安装程序下载后自动校验，确认一致才启动安装。'},
  {key:'windows-store',label:'Windows 商店版',extension:'.msix',filename:v=>`seal-office-${v}-microsoft-store-x64.msix`,hint:'商店附件单独归档，客户端通过下方商店链接更新。'},
  {key:'macos',label:'macOS',extension:'.dmg',filename:v=>`seal-office-${v}-macos.dmg`,hint:'上传已验收的 DMG，用户下载后按 macOS 提示安装。'},
  {key:'linux',label:'Ubuntu',extension:'.deb',filename:v=>`seal-office-${v}-amd64.deb`,hint:'下载 DEB 安装包后，由用户按系统提示安装。'},
  {key:'web',label:'网页版',extension:'.zip',filename:v=>`seal-office-${v}-web.zip`,hint:'先部署新网页再发布通知；可上传网页归档，也可不附文件。'},
  {key:'android',label:'Android',extension:'.apk',filename:v=>`seal-office-${v}-android.apk`,hint:'上传已验收的正式 APK，用户下载后确认安装。'},
  {key:'harmony',label:'HarmonyOS',extension:'.hap',filename:v=>`seal-office-${v}-harmony.hap`,hint:'上传独立签名的 HAP，不能使用 App Pack 代替。'},
]
const blankPlatforms=()=>Object.fromEntries(platforms.map(p=>[p.key,{selected:false,file:null as File|null,asset:null as Asset|null,progress:0}]))
const form=ref({version:'',channel:'stable',mandatory:false,minVersion:'',notes:'',storeUrl:'ms-windows-store://pdp/?productid=9NGPL705R5Z3'})
const selections=ref(blankPlatforms()),items=ref<any[]>([]),statistics=ref({all:0,published:0,withdrawn:0})
const busy=ref(false),uploading=ref(''),error=ref(''),notice=ref(''),confirmMandatory=ref(false),pendingMandatory=ref<any>(null),pendingDelete=ref<any>(null),detail=ref<any>(null)
const filter=ref('all'),search=ref(''),platformFilter=ref(''),query=ref({search:'',platform:''})
const filters=[{key:'all',label:'全部'},{key:'published',label:'已上架'},{key:'withdrawn',label:'已下架'}] as const
const composing=ref(false),closeHint=ref(''),publishTrigger=ref<InstanceType<typeof NButton>|null>(null)
let disposed=false,controller:AbortController|null=null
const selected=computed(()=>platforms.filter(p=>selections.value[p.key].selected))
const hasAssets=computed(()=>platforms.some(p=>selections.value[p.key].asset))
const label=(key:string)=>platforms.find(p=>p.key===key)?.label||key
const size=(bytes:number)=>bytes<1024*1024?`${(bytes/1024).toFixed(1)} KiB`:`${(bytes/1024/1024).toFixed(1)} MiB`
const stamp=(value:number)=>new Date(value).toLocaleString('zh-CN',{hour12:false})
const groups=computed(()=>{
  const map=new Map<string,any>()
  for(const item of items.value){const key=item.version+'/'+item.channel;const group=map.get(key)||{key,version:item.version,channel:item.channel,publishedAt:0,items:[]};group.items.push(item);group.publishedAt=Math.max(group.publishedAt,item.publishedAt);map.set(key,group)}
  return [...map.values()].map(group=>({...group,published:group.items.some((item:any)=>!item.withdrawn)})).sort((a,b)=>b.publishedAt-a.publishedAt)
})
const rows=computed(()=>groups.value.filter(row=>(filter.value==='all'||(filter.value==='published')===row.published)&&row.version.includes(query.value.search)&&(!query.value.platform||row.items.some((item:any)=>item.platform===query.value.platform))))
async function run(task:()=>Promise<void>){if(busy.value)return;busy.value=true;error.value='';notice.value='';try{await task()}catch(e){if(!disposed)error.value=e instanceof Error?e.message:'操作失败，请稍后重试'}finally{if(!disposed){busy.value=false;closeHint.value=''}}}
async function load(){const result=await props.call('releases');if(disposed)return;items.value=result.items;statistics.value=result.statistics;if(detail.value)detail.value=groups.value.find(group=>group.key===detail.value.key)||null}
function chooseFile(key:string,event:Event){const input=event.target as HTMLInputElement;selections.value[key].file=input.files?.[0]||null;selections.value[key].asset=null;selections.value[key].progress=0}
async function uploadFile(platform:Platform){await run(async()=>{
  const state=selections.value[platform.key],version=form.value.version.trim()
  if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))throw new Error('请先填写有效版本号，例如 2.7.2')
  if(!state.file)throw new Error('请先选择 '+platform.label+' 安装包')
  if(state.file.name!==platform.filename(version))throw new Error('文件名与平台或版本不一致，应为 '+platform.filename(version))
  if(state.file.size>1024*1024*1024)throw new Error('单个安装包不能超过 1 GiB')
  controller=new AbortController();uploading.value=platform.key
  try{const result=await props.upload(platform.key,version,state.file,value=>{if(!disposed)state.progress=value},controller.signal);if(!disposed){state.asset=result.item;state.progress=100;notice.value=platform.label+' 上传完成'}}finally{controller=null;if(!disposed)uploading.value=''}
})}
function resetDraft(){if(busy.value)return;selections.value=blankPlatforms();form.value={version:'',channel:'stable',mandatory:false,minVersion:'',notes:'',storeUrl:'ms-windows-store://pdp/?productid=9NGPL705R5Z3'};notice.value=''}
function openComposer(){closeHint.value='';composing.value=true}
function closeComposer(){document.querySelector('.admin-shell')?.removeAttribute('inert');composing.value=false;closeHint.value=''}
function requestClose(){if(busy.value){closeHint.value=uploading.value?'安装包正在上传，请等待上传完成后关闭，当前进度会保留。':'正在提交发布，请等待完成后关闭。';return false}closeComposer();return false}
async function focusComposer(){document.querySelector('.admin-shell')?.setAttribute('inert','');await nextTick();document.querySelector<HTMLInputElement>('#release-version:not(:disabled)')?.focus()}
function restoreFocus(){publishTrigger.value?.$el?.focus()}
function protectUpload(event:BeforeUnloadEvent){if(composing.value&&busy.value){event.preventDefault();event.returnValue=''}}
async function publish(){await run(async()=>{
  if(!selected.value.length)throw new Error('请至少选择一个需要发布的平台')
  const entries=selected.value.map(p=>{const state=selections.value[p.key];if(!state.asset&&!['web','windows-store'].includes(p.key))throw new Error('请先上传 '+p.label+' 安装包，或取消选择该平台');return {platform:p.key,...(state.asset?{assetId:state.asset.id}:{}),...(p.key==='windows-store'?{url:form.value.storeUrl.trim()}: {})}})
  const version=form.value.version.trim()
  await props.call('releases/batch','POST',{version,channel:form.value.channel,mandatory:form.value.mandatory,minVersion:form.value.minVersion.trim()||null,notes:form.value.notes,platforms:entries})
  if(disposed)return;closeComposer();selections.value=blankPlatforms();form.value.version='';form.value.notes='';notice.value=`已发布 ${version}，共 ${entries.length} 个平台；未选择的平台保持原状`;await load()
})}
function requestMandatory(row:any){if(row.mandatory)void setMandatory(row,false);else pendingMandatory.value=row}
async function setMandatory(row:any,mandatory:boolean){pendingMandatory.value=null;await run(async()=>{await props.call('releases/'+row.id,'PATCH',{mandatory});await load();if(!disposed)notice.value=mandatory?'已设为强制更新':'已取消强制更新'})}
async function setWithdrawn(row:any,withdrawn:boolean){await run(async()=>{await props.call('releases/'+row.id,'PATCH',{withdrawn});await load();if(!disposed)notice.value=withdrawn?'已下架所选平台，客户端不再收到该版本':'已重新上架所选平台'})}
async function remove(){const row=pendingDelete.value;pendingDelete.value=null;if(!row)return;await run(async()=>{await props.call('releases/'+row.id,'DELETE');await load();if(!disposed)notice.value='已删除所选平台的发布记录'})}
function applyQuery(){query.value={search:search.value.trim(),platform:platformFilter.value}}
function resetQuery(){filter.value='all';search.value='';platformFilter.value='';applyQuery()}
const columns=[
  {title:'版本',key:'version',width:130},
  {title:'通道',key:'channel',width:90,render:(row:any)=>row.channel==='beta'?'测试版':'稳定版'},
  {title:'已发布平台',key:'platforms',minWidth:240,render:(row:any)=>row.items.map((item:any)=>label(item.platform)).join('、')},
  {title:'状态',key:'published',width:105,render:(row:any)=>h('span',{class:['c-tag',row.published?'c-tag--success':'c-tag--danger']},row.published?'已上架':'已下架')},
  {title:'发布时间',key:'publishedAt',width:185,render:(row:any)=>stamp(row.publishedAt)},
  {title:'操作',key:'actions',width:110,render:(row:any)=>h(NButton,{size:'small',onClick:()=>{detail.value=row}},{default:()=>'管理平台'})},
]
onMounted(()=>{void run(load);window.addEventListener('beforeunload',protectUpload)})
onUnmounted(()=>{disposed=true;controller?.abort();document.querySelector('.admin-shell')?.removeAttribute('inert');window.removeEventListener('beforeunload',protectUpload)})
</script>

<template>
  <section class="c-page release-panel" aria-label="版本管理工作区">
    <header class="page-heading c-head release-list-heading"><div><h1 class="c-title">版本管理</h1><p class="c-sub">按版本和平台查看发布状态，未选择的平台不会发布。</p></div><div class="release-actions"><NButton :loading="busy" @click="run(load)">刷新列表</NButton><NButton ref="publishTrigger" type="primary" @click="openComposer">发布版本</NButton></div></header>
    <p v-if="notice" class="release-notice" role="status">{{notice}}</p>
    <NModal :show="composing" preset="card" class="release-publish-modal" aria-labelledby="release-publish-title" :mask-closable="false" :close-on-esc="false" :on-close="requestClose" @esc="requestClose" @after-enter="focusComposer" @after-leave="restoreFocus">
      <template #header><h2 id="release-publish-title">发布版本</h2></template>
      <form class="release-compose" @submit.prevent="publish">
      <div class="release-modal-body">
      <p class="c-help release-compose-intro">填写更新说明，按需选择平台并分别上传附件。未选择的平台不发布。</p>
      <p v-if="notice" class="release-notice" role="status">{{notice}}</p>
      <fieldset class="release-fieldset" :disabled="busy"><legend class="release-legend">版本信息与可选附件</legend>
        <div class="release-form-grid">
          <div><label class="converter-label" for="release-version">版本号</label><input id="release-version" v-model="form.version" class="c-field" :disabled="hasAssets" required placeholder="例如 2.7.2" autocomplete="off"/><span v-if="hasAssets" class="c-help">已上传附件与此版本绑定。更改版本请清空本次选择。</span></div>
          <div><label class="converter-label" for="release-channel">发布通道</label><select id="release-channel" v-model="form.channel" class="c-field"><option value="stable">稳定版</option><option value="beta">测试版</option></select></div>
        </div>
        <label class="converter-label release-gap" for="release-notes">更新说明</label><textarea id="release-notes" v-model="form.notes" class="c-field" rows="4" maxlength="4000" placeholder="逐条说明本次更新的功能与修复内容"/>
        <div class="release-form-grid release-gap"><div><label class="converter-label" for="release-min">最低可用版本（可不填）</label><input id="release-min" v-model="form.minVersion" class="c-field" placeholder="低于此版本时强制更新"/></div><div class="release-force"><div><span>强制更新 </span><NSwitch :value="form.mandatory" aria-label="强制更新" @update:value="value=>{if(value)confirmMandatory=true;else form.mandatory=false}"/></div><span class="c-help">开启后，低于此版本的客户端不能跳过更新。</span></div></div>
        <div class="release-platform-list">
          <section v-for="p in platforms" :key="p.key" class="release-platform" :aria-label="p.label+' 发布附件'">
            <label class="release-platform-choice"><input v-model="selections[p.key].selected" type="checkbox" :data-platform="p.key"/>{{p.label}}<span class="c-help">可选</span></label>
            <p class="c-help">{{p.hint}}</p>
            <div v-if="selections[p.key].selected" class="release-platform-fields">
              <label class="converter-label" :for="'release-file-'+p.key">{{p.label}}附件（{{p.extension}}）</label>
              <div class="release-upload"><input :id="'release-file-'+p.key" :key="form.version" type="file" :accept="p.extension" @change="chooseFile(p.key,$event)"/><NButton :data-upload-platform="p.key" :disabled="!selections[p.key].file||!form.version.trim()||busy" :loading="uploading===p.key" @click="uploadFile(p)">上传安装包</NButton></div>
              <span class="c-help">{{p.filename(form.version.trim()||'版本号')}}，单个附件上限 1 GiB。</span>
              <progress v-if="uploading===p.key" :value="selections[p.key].progress" max="100" :aria-label="p.label+' 上传进度'"/>
              <p v-if="selections[p.key].asset" class="release-asset" role="status"><strong>上传完成：{{selections[p.key].asset!.filename}}</strong><span>{{size(selections[p.key].asset!.bytes)}}</span><span class="release-digest">SHA-256：{{selections[p.key].asset!.sha256}}</span></p>
              <template v-if="p.key==='windows-store'"><label class="converter-label release-gap" for="release-store-url">微软商店链接</label><input id="release-store-url" v-model="form.storeUrl" class="c-field" required/></template>
            </div>
          </section>
        </div>
      </fieldset>
      </div>
      <footer class="release-modal-footer"><p v-if="closeHint" class="release-close-hint" role="alert">{{closeHint}}</p><span class="c-help">已选择 {{selected.length}} 个平台</span><NButton :disabled="busy" @click="resetDraft">清空选择</NButton><div class="release-footer-actions"><NButton id="release-cancel" @click="requestClose">取消</NButton><NButton type="primary" attr-type="submit" :loading="busy&&!uploading" :disabled="busy||!selected.length||!form.version.trim()">发布所选平台</NButton></div></footer>
      </form>
    </NModal>
    <div class="c-card">
      <form class="c-toolbar" @submit.prevent="applyQuery"><div class="c-seg" role="tablist" aria-label="发布状态"><button v-for="state in filters" :key="state.key" type="button" role="tab" class="c-seg__item" :class="{'is-active':filter===state.key}" :aria-selected="filter===state.key" @click="filter=state.key">{{state.label}}<span class="c-seg__count">{{statistics[state.key]}}</span></button></div><label class="release-filter">版本号<input v-model="search" class="c-field" placeholder="筛选版本号"/></label><label class="release-filter">发布平台<select v-model="platformFilter" class="c-field"><option value="">全部平台</option><option v-for="p in platforms" :key="p.key" :value="p.key">{{p.label}}</option></select></label><NButton attr-type="submit">查询</NButton><NButton @click="resetQuery">重置</NButton></form>
      <div class="layui-card-body release-table"><NDataTable size="small" :columns="columns" :data="rows" :pagination="{pageSize:10}" :scroll-x="900" :loading="busy&&!items.length" :row-key="(row:any)=>row.key"/></div>
    </div>
    <NModal :show="Boolean(detail)" preset="card" :title="detail?detail.version+' 平台发布管理':''" class="release-detail-modal" @update:show="value=>{if(!value)detail=null}"><div v-if="detail" class="release-detail-list"><section v-for="row in detail.items" :key="row.id" class="release-platform"><h3>{{label(row.platform)}} <span class="c-tag" :class="row.withdrawn?'c-tag--danger':'c-tag--success'">{{row.withdrawn?'已下架':'已上架'}}</span></h3><p class="release-notes">{{row.notes||'未填写更新说明'}}</p><p class="c-help">{{row.asset?.filename||row.url||'无附件'}}<template v-if="row.bytes">，{{size(row.bytes)}}</template></p><div class="release-actions"><NButton size="small" :disabled="busy" @click="requestMandatory(row)">{{row.mandatory?'取消强制':'设为强制'}}</NButton><NButton size="small" :disabled="busy" @click="setWithdrawn(row,!row.withdrawn)">{{row.withdrawn?'重新上架':'下架'}}</NButton><NButton size="small" type="error" ghost :disabled="busy" @click="pendingDelete=row">删除</NButton></div></section></div></NModal>
    <NModal :show="Boolean(error)" preset="dialog" type="error" title="操作未完成" :content="error" positive-text="知道了" @positive-click="error=''" @update:show="value=>{if(!value)error=''}"/>
    <NModal v-model:show="confirmMandatory" preset="dialog" type="warning" title="确认开启强制更新" content="开启后低于此版本的用户无法跳过更新。请确认对应安装包与发布内容已经验收。" positive-text="确认开启" negative-text="取消" @positive-click="form.mandatory=true"/>
    <NModal :show="Boolean(pendingMandatory)" preset="dialog" type="warning" title="确认设为强制更新" content="该平台低于此版本的用户将无法跳过更新。" positive-text="确认设为强制" negative-text="取消" @update:show="value=>{if(!value)pendingMandatory=null}" @positive-click="setMandatory(pendingMandatory,true)"/>
    <NModal :show="Boolean(pendingDelete)" preset="dialog" type="error" title="确认删除发布记录" content="删除后客户端不再收到该平台版本。若只是暂停分发，请改用下架。" positive-text="确认删除" negative-text="取消" @update:show="value=>{if(!value)pendingDelete=null}" @positive-click="remove"/>
  </section>
</template>

<style>
.release-publish-modal{width:1120px!important;max-width:95vw;max-height:90vh;max-height:90dvh;display:flex;flex-direction:column;margin:5vh auto!important;border-radius:4px!important}
.release-publish-modal>.n-card-header{flex:none;padding:16px 20px!important;border-bottom:1px solid #e5e7eb}
.release-publish-modal>.n-card__content{padding:0!important;min-height:0;display:flex;flex-direction:column;overflow:hidden}
#release-publish-title{margin:0;font-size:18px;font-weight:600}
.release-compose{display:flex;flex-direction:column;min-height:0;overflow:hidden}
.release-modal-body{min-height:0;overflow:auto;overscroll-behavior:contain;padding:16px 20px;scroll-padding:16px}
.release-compose-intro{margin:0 0 16px}.release-fieldset{border:0;padding:0;margin:0;min-width:0}.release-legend{font-size:14px;font-weight:600;margin-bottom:14px}
.release-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.release-gap{margin-top:14px}.release-force{display:flex;flex-direction:column;justify-content:center;gap:6px}.release-platform-choice{display:flex;align-items:center;gap:8px;min-height:28px;font-size:14px;font-weight:600}.release-platform-choice input{width:17px;height:17px;accent-color:#1e5eff}
.release-platform-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}.release-platform{min-width:0;padding:14px;border:1px solid #e2e6ec;border-radius:4px;background:#fff}.release-platform-fields{margin-top:12px}.release-platform .c-help{overflow-wrap:anywhere}.release-upload{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.release-upload input{max-width:100%;min-width:0;flex:1}.release-asset{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#22684d;overflow-wrap:anywhere}.release-digest{font-family:monospace;font-size:11px}.release-platform progress{width:100%;margin-top:10px}
.release-modal-footer{flex:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 20px;border-top:1px solid #e5e7eb;background:#fafbfc}.release-footer-actions{display:flex;gap:10px;margin-left:auto}.release-close-hint{flex-basis:100%;margin:0;color:#8b5d14;font-size:13px}.release-notice{background:#edf8f2;color:#22684d;padding:10px 14px;border-radius:4px;margin:0}.release-modal-body>.release-notice{margin-bottom:14px}
.release-filter{display:flex;align-items:center;gap:8px;font-size:13px}.release-filter .c-field{width:150px}.release-table{padding:0}.release-table .n-data-table-base-table-header{background:#fafbfc}.release-table .n-data-table__pagination{padding:0 14px 12px}.release-actions{display:flex;gap:8px;flex-wrap:wrap}.release-detail-list .release-actions{margin-top:12px}.release-detail-modal{width:min(760px,95vw)!important;max-height:90vh;max-height:90dvh}.release-detail-modal>.n-card__content{overflow:auto}.release-detail-list{display:grid;gap:12px}.release-detail-list h3{font-size:14px;margin:0}.release-notes{white-space:pre-wrap;overflow-wrap:anywhere}.release-publish-modal textarea{resize:vertical;min-height:80px}
@media(max-width:720px){.release-form-grid,.release-platform-list{grid-template-columns:minmax(0,1fr)}.release-modal-body{padding:14px}.release-publish-modal>.n-card-header{padding:14px!important}.release-modal-footer{padding:10px 14px;gap:8px}.release-filter{flex:1 1 100%}.release-filter .c-field{width:auto;flex:1;min-width:0}.release-upload input{flex-basis:100%}.release-footer-actions{margin-left:auto}.release-list-heading .release-actions{margin-left:auto}}
</style>
