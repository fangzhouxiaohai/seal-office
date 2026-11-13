<script setup lang="ts">
import {computed,nextTick,onMounted,onUnmounted,ref} from 'vue'
import { DialogPlugin } from 'tdesign-vue-next'
import {callAdmin,uploadRelease} from '@/utils/sealApi'
import {hasUploadedAsset} from './managementModel'
import {useUserStore} from '@/stores/user'
const user=useUserStore()
const canWrite=computed(()=>user.hasPermission('releases:write'))
const props={call:callAdmin,upload:uploadRelease}
type Asset={id:string;platform:string;version:string;filename:string;sha256:string;bytes:number;url:string}
type Platform={key:string;label:string;extension:string;filename:(version:string)=>string;hint:string}
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
const composing=ref(false),closeHint=ref('')
const publishTrigger=ref<{ $el: HTMLElement } | null>(null)
let disposed=false,controller:AbortController|null=null
const selected=computed(()=>platforms.filter(p=>selections.value[p.key].selected))
const hasAssets=computed(()=>hasUploadedAsset(Object.values(selections.value)))
const label=(key:string)=>platforms.find(p=>p.key===key)?.label||key
const size=(bytes:number)=>bytes<1024*1024?`${(bytes/1024).toFixed(1)} KiB`:`${(bytes/1024/1024).toFixed(1)} MiB`
const stamp=(value:number)=>new Date(value).toLocaleString('zh-CN',{hour12:false})
const groups=computed(()=>{
  const map=new Map<string,any>()
  for(const item of items.value){const key=item.version+'/'+item.channel;const group=map.get(key)||{key,version:item.version,channel:item.channel,publishedAt:0,items:[]};group.items.push(item);group.publishedAt=Math.max(group.publishedAt,item.publishedAt);map.set(key,group)}
  return [...map.values()].map(group=>({...group,published:group.items.some((item:any)=>!item.withdrawn)})).sort((a,b)=>b.publishedAt-a.publishedAt)
})
const rows=computed(()=>groups.value.filter(row=>(filter.value==='all'||(filter.value==='published')===row.published)&&row.version.includes(query.value.search)&&(!query.value.platform||row.items.some((item:any)=>item.platform===query.value.platform))))
async function run(task:()=>Promise<void>){if(busy.value)return;busy.value=true;error.value='';notice.value='';try{await task()}catch(e){if(!disposed){error.value=e instanceof Error?e.message:'操作失败，请稍后重试';DialogPlugin.alert({header:'操作未完成',body:error.value,confirmBtn:'知道了'})}}finally{if(!disposed){busy.value=false;closeHint.value=''}}}
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
function closeComposer(){composing.value=false;closeHint.value='';void nextTick(()=>publishTrigger.value?.$el?.focus())}
function requestClose(){if(busy.value){closeHint.value=uploading.value?'安装包正在上传，请等待上传完成后关闭，当前进度会保留。':'正在提交发布，请等待完成后关闭。';return false}closeComposer();return false}
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
onMounted(()=>{void run(load);window.addEventListener('beforeunload',protectUpload)})
onUnmounted(()=>{disposed=true;controller?.abort();window.removeEventListener('beforeunload',protectUpload)})

</script>
<template>
  <section class="release-page">
    <header class="release-heading"><div><h1>版本管理</h1><p>按版本和平台查看发布状态，未选择的平台不会发布。</p></div><div class="release-actions"><t-button variant="outline" :loading="busy" @click="run(load)">刷新列表</t-button><t-button v-if="canWrite" ref="publishTrigger" theme="primary" @click="openComposer">发布版本</t-button></div></header>
    <t-alert v-if="notice" theme="success" :message="notice" />
    <t-alert v-if="error" theme="error" :message="error" />
    <t-card>
      <form class="release-toolbar" @submit.prevent="applyQuery"><div class="release-tabs"><button v-for="item in filters" :key="item.key" type="button" :class="{active:filter===item.key}" @click="filter=item.key">{{ item.label }} {{ statistics[item.key] }}</button></div><label>版本号 <input v-model="search" placeholder="筛选版本号" /></label><label>发布平台 <select v-model="platformFilter"><option value="">全部平台</option><option v-for="p in platforms" :key="p.key" :value="p.key">{{p.label}}</option></select></label><t-button type="submit">查询</t-button><t-button type="button" @click="resetQuery">重置</t-button></form>
      <t-table :key="filter+'|'+query.search+'|'+query.platform" row-key="key" :data="rows" :columns="[{colKey:'version',title:'版本'},{colKey:'channel',title:'通道'},{colKey:'platforms',title:'已发布平台'},{colKey:'published',title:'状态'},{colKey:'publishedAt',title:'发布时间'},{colKey:'actions',title:'操作'}]" :pagination="{defaultCurrent:1,defaultPageSize:10,total:rows.length}"><template #channel="{row}">{{row.channel==='beta'?'测试版':'稳定版'}}</template><template #platforms="{row}">{{row.items.map((item:any)=>label(item.platform)).join('、')}}</template><template #published="{row}"><t-tag variant="light" :theme="row.published?'success':'danger'">{{row.published?'已上架':'已下架'}}</t-tag></template><template #publishedAt="{row}">{{stamp(row.publishedAt)}}</template><template #actions="{row}"><t-button size="small" variant="outline" @click="detail=row">管理平台</t-button></template></t-table>
    </t-card>
    <t-dialog :visible="composing" header="发布版本" width="1120px" placement="center" dialog-class-name="seal-release-dialog" :footer="false" :close-on-overlay-click="false" :close-on-esc-keydown="true" @close="requestClose"><form class="release-compose" @submit.prevent="publish"><div class="release-scroll"><p>填写一份更新说明，按需选择平台并分别上传附件。未选择的平台不发布。</p><div class="release-fields"><label>版本号<input id="release-version" v-model="form.version" :disabled="busy || hasAssets" placeholder="例如 2.7.2" required /><small v-if="hasAssets">附件已上传，清空选择后才能修改版本号。</small></label><label>发布通道<select v-model="form.channel"><option value="stable">稳定版</option><option value="beta">测试版</option></select></label><label class="span-all">更新说明<textarea v-model="form.notes" rows="4" placeholder="逐条说明本次更新内容" /></label><label>最低可用版本<input v-model="form.minVersion" placeholder="低于此版本时强制更新" /></label><div><p>强制更新：{{form.mandatory?'已开启':'未开启'}}</p><t-button type="button" @click="form.mandatory ? form.mandatory=false : confirmMandatory=true">{{form.mandatory?'关闭强制更新':'开启强制更新'}}</t-button></div></div><div class="release-platforms"><section v-for="p in platforms" :key="p.key" class="release-platform"><label><input v-model="selections[p.key].selected" type="checkbox" :disabled="busy" /> <strong>{{p.label}}</strong></label><p>{{p.hint}}</p><template v-if="selections[p.key].selected"><input type="file" :accept="p.extension" :disabled="busy" @change="chooseFile(p.key,$event)" /><div class="release-actions"><t-button type="button" :disabled="busy || !selections[p.key].file" @click="uploadFile(p)">上传附件</t-button><t-button v-if="uploading===p.key" type="button" @click="controller?.abort()">取消上传</t-button></div><progress v-if="uploading===p.key" :value="selections[p.key].progress" max="100" /><p v-if="selections[p.key].asset">上传完成：{{selections[p.key].asset?.filename}} · {{size(selections[p.key].asset?.bytes ?? 0)}}<br/>SHA-256：{{selections[p.key].asset?.sha256}}</p><label v-if="p.key==='windows-store'">微软商店链接<input v-model="form.storeUrl" required /></label></template></section></div></div><footer class="release-footer"><span v-if="closeHint">{{closeHint}}</span><span>已选择 {{selected.length}} 个平台</span><t-button type="button" :disabled="busy" @click="resetDraft">清空选择</t-button><t-button type="button" @click="requestClose">取消</t-button><t-button type="submit" theme="primary" :loading="busy&&!uploading" :disabled="busy||!selected.length||!form.version.trim()">发布所选平台</t-button></footer></form></t-dialog>
    <t-dialog :visible="Boolean(detail)" :header="detail ? detail.version+' 平台发布管理' : ''" width="760px" :footer="false" @close="detail=null"><section v-for="row in detail?.items || []" :key="row.id" class="release-platform"><h3>{{label(row.platform)}} · {{row.withdrawn?'已下架':'已上架'}}</h3><p>{{row.notes || '未填写更新说明'}}</p><p>{{row.asset?.filename || row.url || '无附件'}}<template v-if="row.bytes">，{{size(row.bytes)}}</template></p><div v-if="canWrite" class="release-actions"><t-button size="small" :disabled="busy" @click="requestMandatory(row)">{{row.mandatory?'取消强制':'设为强制'}}</t-button><t-button size="small" :disabled="busy" @click="setWithdrawn(row,!row.withdrawn)">{{row.withdrawn?'重新上架':'下架'}}</t-button><t-button size="small" theme="danger" variant="outline" :disabled="busy" @click="pendingDelete=row">删除</t-button></div></section></t-dialog>
    <t-dialog v-model:visible="confirmMandatory" header="确认开启强制更新" body="开启后低于此版本的用户无法跳过更新。请确认安装包与发布内容已经验收。" @confirm="form.mandatory=true;confirmMandatory=false" />
    <t-dialog :visible="Boolean(pendingMandatory)" header="确认设为强制更新" body="该平台低于此版本的用户将无法跳过更新。" @close="pendingMandatory=null" @confirm="setMandatory(pendingMandatory,true)" />
    <t-dialog :visible="Boolean(pendingDelete)" header="确认删除发布记录" body="删除后客户端不再收到该平台版本。若只是暂停分发，请改用下架。" @close="pendingDelete=null" @confirm="remove" />
  </section>
</template>
<style scoped>
.release-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:20px}.release-heading h1{font-size:22px;margin:0}.release-heading p{color:var(--tl-text-3)}.release-toolbar,.release-actions,.release-footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.release-toolbar{margin-bottom:16px}.release-tabs{display:flex;gap:4px}.release-tabs button{border:0;padding:8px;background:var(--tl-surface-2);color:var(--tl-text-1);cursor:pointer}.release-tabs button.active{color:var(--td-brand-color-10);background:var(--td-brand-color-2)}.release-fields,.release-platforms{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.release-fields label,.release-platform label{display:flex;flex-direction:column;gap:6px}.release-fields input,.release-fields textarea,.release-fields select,.release-platform input:not([type=checkbox]),.release-toolbar input,.release-toolbar select{padding:8px;border:1px solid var(--td-component-border);background:var(--tl-surface);color:var(--tl-text-1);border-radius:4px;max-width:100%}.span-all{grid-column:1 / -1}.release-platforms{margin-top:16px}.release-platform{padding:14px;border:1px solid var(--td-component-border);border-radius:6px;margin-bottom:10px}.release-platform>label:first-child{display:block}.release-platform p{overflow-wrap:anywhere}.release-scroll{max-height:65vh;overflow:auto;padding:4px}.release-footer{justify-content:flex-end;padding-top:16px}.release-page :deep(.t-alert){margin-bottom:12px}@media(max-width:720px){.release-heading{flex-wrap:wrap}.release-fields,.release-platforms{grid-template-columns:1fr}.span-all{grid-column:auto}}
</style>

<style>
.seal-release-dialog.t-dialog{max-width:calc(100vw - 24px);height:min(900px,calc(100vh - 24px));height:min(900px,calc(100dvh - 24px));display:flex;flex-direction:column}.seal-release-dialog .t-dialog__header{flex:none}.seal-release-dialog .t-dialog__body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}.seal-release-dialog .release-compose{display:flex;flex-direction:column;flex:1;min-height:0}.seal-release-dialog .release-scroll{flex:1;min-height:0;max-height:none;overflow:auto}.seal-release-dialog .release-footer{flex:none}.seal-release-dialog .release-footer span:first-child{overflow-wrap:anywhere}
</style>
