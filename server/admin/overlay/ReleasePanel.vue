<script setup lang="ts">
import {computed,h,onMounted,onUnmounted,ref} from 'vue'
import {NButton} from 'naive-ui'
const props=defineProps<{call:(route:string,method?:string,body?:unknown)=>Promise<any>}>()
// 平台与通道取值与服务端 releases.cjs 保持一致
const platforms=[{key:'windows',label:'Windows 安装版',hint:'NSIS 安装包：客户端下载后校验 sha256 与字节数，一致才启动安装程序'},{key:'windows-store',label:'Windows 商店版',hint:'微软商店 MSIX：客户端只引导打开商店页面，地址填写 ms-windows-store 或 https 商店链接'},{key:'web',label:'Web',hint:'网页版：新版部署后客户端提示刷新页面，无需安装包地址'},{key:'android',label:'Android',hint:'安卓：客户端在外部浏览器打开下载地址，由用户确认安装'},{key:'harmony',label:'HarmonyOS',hint:'鸿蒙：客户端跳转 AppGallery，地址填写应用市场链接'}]
const channelOptions=[{label:'稳定版',value:'stable'},{label:'测试版',value:'beta'}]
const platform=ref('windows'),items=ref<any[]>([]),busy=ref(false),error=ref(''),notice=ref('')
const blank=()=>({version:'',channel:'stable',mandatory:false,minVersion:'',notes:'',url:'',sha256:'',bytes:''})
const form=ref<any>(blank())
const confirmMandatory=ref(false),pendingMandatory=ref<any>(null),pendingDelete=ref<any>(null)
let disposed=false
const current=computed(()=>platforms.find(p=>p.key===platform.value)!)
const rows=computed(()=>items.value.filter(item=>item.platform===platform.value))
const counts=computed(()=>Object.fromEntries(platforms.map(p=>[p.key,items.value.filter(item=>item.platform===p.key).length])))
const needsPackage=computed(()=>platform.value==='windows')
const urlLabel=computed(()=>({windows:'安装包地址','windows-store':'微软商店链接',web:'网页地址（可不填）',android:'安装包地址',harmony:'AppGallery 链接'} as Record<string,string>)[platform.value])
const pad=(value:number)=>String(value).padStart(2,'0')
const stamp=(value:any)=>{const time=Number(value);if(!time)return '—';const date=new Date(time);return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`}
async function run(task:()=>Promise<void>){if(busy.value)return;busy.value=true;error.value='';notice.value='';try{await task()}catch(e){if(!disposed)error.value=e instanceof Error?e.message:'操作失败'}finally{if(!disposed)busy.value=false}}
async function load(){const result=await props.call('releases');if(!disposed)items.value=result.items}
function switchPlatform(key:string){platform.value=key;form.value=blank();error.value='';notice.value=''}
// 打开强制更新先二次确认，关闭无需确认
function toggleFormMandatory(value:boolean){if(value)confirmMandatory.value=true;else form.value.mandatory=false}
function acceptFormMandatory(){confirmMandatory.value=false;form.value.mandatory=true}
async function publish(){await run(async()=>{
  const value=form.value,bytes=String(value.bytes).trim()
  if(bytes&&!/^\d+$/.test(bytes))throw new Error('安装包字节数须为正整数')
  const body={platform:platform.value,version:value.version.trim(),channel:value.channel,mandatory:value.mandatory,minVersion:value.minVersion.trim()||null,notes:value.notes,url:value.url.trim()||null,sha256:value.sha256.trim()||null,bytes:bytes?Number(bytes):null}
  await props.call('releases','POST',body);await load();if(disposed)return
  form.value=blank();notice.value=`已发布 ${current.value.label} ${body.version}`
})}
function requestMandatory(row:any){if(row.mandatory)void setMandatory(row,false);else pendingMandatory.value=row}
async function setMandatory(row:any,mandatory:boolean){pendingMandatory.value=null;await run(async()=>{await props.call('releases/'+row.id,'PATCH',{mandatory});await load();if(!disposed)notice.value=mandatory?`${row.version} 已设为强制更新`:`${row.version} 已取消强制更新`})}
async function setWithdrawn(row:any,withdrawn:boolean){await run(async()=>{await props.call('releases/'+row.id,'PATCH',{withdrawn});await load();if(!disposed)notice.value=withdrawn?`${row.version} 已下架，客户端不再收到该版本`:`${row.version} 已重新上架`})}
async function remove(){const row=pendingDelete.value;pendingDelete.value=null;if(!row)return;await run(async()=>{await props.call('releases/'+row.id,'DELETE');await load();if(!disposed)notice.value=`${row.version} 的发布记录已删除`})}
const columns=[
  {title:'版本',key:'version',width:140,render:(r:any)=>h('span',{class:'num'},r.version)},
  {title:'通道',key:'channel',width:96,render:(r:any)=>h('span',{class:['pill',r.channel==='beta'?'warn':'']},r.channel==='beta'?'测试版':'稳定版')},
  {title:'状态',key:'withdrawn',width:96,render:(r:any)=>h('span',{class:['pill',r.withdrawn?'':'ok']},r.withdrawn?'已下架':'已上架')},
  {title:'强制更新',key:'mandatory',width:150,render:(r:any)=>r.mandatory?h('span',{class:'pill bad'},'强制更新'):r.minVersion?h('span',{class:'pill warn'},'低于 '+r.minVersion+' 强制'):h('span',{class:'pill'},'可跳过')},
  {title:'发布时间',key:'publishedAt',width:164,defaultSortOrder:'descend',sorter:(a:any,b:any)=>a.publishedAt-b.publishedAt,render:(r:any)=>h('span',{class:'stamp'},stamp(r.publishedAt))},
  {title:'安装包',key:'url',ellipsis:{tooltip:true},render:(r:any)=>r.url?h('span',{class:'cell-id'},r.url):'—'},
  {title:'操作',key:'actions',width:260,render:(r:any)=>h('div',{class:'release-actions'},[
    h(NButton,{size:'small',disabled:busy.value,onClick:()=>requestMandatory(r)},{default:()=>r.mandatory?'取消强制':'设为强制'}),
    h(NButton,{size:'small',disabled:busy.value,onClick:()=>void setWithdrawn(r,!r.withdrawn)},{default:()=>r.withdrawn?'重新上架':'下架'}),
    h(NButton,{size:'small',type:'error',ghost:true,disabled:busy.value,onClick:()=>{pendingDelete.value=r}},{default:()=>'删除'})])}
]
onMounted(()=>void run(load))
onUnmounted(()=>{disposed=true})
</script>
<template>
  <div class="release-panel">
    <div class="converter-refresh"><NButton :loading="busy" @click="run(load)">刷新发布列表</NButton></div>
    <NAlert v-if="error" type="error" role="alert" class="converter-alert">{{error}}</NAlert><NAlert v-if="notice" type="success" aria-live="polite" class="converter-alert">{{notice}}</NAlert>
    <NTabs :value="platform" type="segment" animated class="release-tabs" aria-label="发布平台" @update:value="switchPlatform"><NTabPane v-for="p in platforms" :key="p.key" :name="p.key" :tab="p.label+'（'+counts[p.key]+'）'"/></NTabs>
    <div class="converter-grid"><NCard :title="'发布 '+current.label+' 新版本'">
      <form method="post" action="/api/v1/admin/releases" @submit.prevent="publish"><fieldset class="converter-fieldset" :disabled="busy"><legend class="converter-label">{{current.hint}}</legend>
        <div class="release-form-grid">
          <div><label class="converter-label" for="release-version">版本号</label><NInput id="release-version" v-model:value="form.version" placeholder="例如 2.7.1" autocomplete="off"/></div>
          <div><label class="converter-label" for="release-channel">发布通道</label><NSelect id="release-channel" v-model:value="form.channel" :options="channelOptions"/></div>
        </div>
        <div class="converter-field"><div><label for="release-mandatory">强制更新</label><p class="release-warning">打开后所有低于此版本的用户将无法跳过本次更新：更新卡片不可关闭，每次启动都会再次弹出。</p></div><NSwitch id="release-mandatory" :value="form.mandatory" aria-label="强制更新" @update:value="toggleFormMandatory"/></div>
        <label class="converter-label release-gap" for="release-min">最低可用版本（可不填）</label><NInput id="release-min" v-model:value="form.minVersion" placeholder="低于此版本的用户视为强制更新，例如 2.7.0" autocomplete="off"/>
        <label class="converter-label release-gap" for="release-notes">更新说明</label><NInput id="release-notes" v-model:value="form.notes" type="textarea" :autosize="{minRows:4,maxRows:10}" maxlength="4000" show-count placeholder="逐条写明本次更新内容，客户端更新卡片原样显示"/>
        <label class="converter-label release-gap" for="release-url">{{urlLabel}}</label><NInput id="release-url" v-model:value="form.url" :placeholder="platform==='windows-store'?'ms-windows-store://pdp/?productid=':'https://'" autocomplete="off"/>
        <div class="release-form-grid release-gap">
          <div><label class="converter-label" for="release-sha">安装包 sha256{{needsPackage?'':'（可不填）'}}</label><NInput id="release-sha" v-model:value="form.sha256" placeholder="64 位十六进制" autocomplete="off"/></div>
          <div><label class="converter-label" for="release-bytes">安装包字节数{{needsPackage?'':'（可不填）'}}</label><NInput id="release-bytes" v-model:value="form.bytes" placeholder="例如 168240512" autocomplete="off"/></div>
        </div>
        <p class="service-note">Windows 安装版必须填写 sha256 与字节数，客户端下载后逐项核对，不一致即拒绝安装。发布、修改与删除均记入后台操作记录。</p><NButton type="primary" attr-type="submit" :loading="busy" :disabled="!form.version.trim()">发布版本</NButton>
      </fieldset></form>
    </NCard><NCard title="发布规则">
      <dl class="detail-list"><div><dt>客户端查询</dt><dd>GET /v1/updates/latest?platform=&amp;version=&amp;channel=</dd></div><div><dt>匹配方式</dt><dd>只下发高于客户端版本的最新已上架版本；测试通道同时可见稳定版</dd></div><div><dt>强制判定</dt><dd>客户端跨越的任一版本被设为强制，或客户端低于该版本的最低可用版本</dd></div><div><dt>匿名访问</dt><dd>无需登录，按来源 IP 限流，只返回版本、说明、地址与校验值</dd></div></dl>
      <p class="service-note">误发的版本先下架，确认无用户依赖后再删除。下架后客户端立即不再收到该版本。</p>
    </NCard></div>
    <NCard :title="current.label+' 已发布版本'" class="converter-jobs"><template #header-extra><span class="table-count">{{rows.length}} 个版本</span></template><NDataTable :columns="columns" :data="rows" :pagination="{pageSize:10}" :scroll-x="1100" :loading="busy&&!items.length"/></NCard>
    <NModal v-model:show="confirmMandatory" preset="dialog" type="warning" title="确认开启强制更新" content="开启后所有低于此版本的用户将无法跳过本次更新：更新卡片没有关闭按钮，每次启动都会再次弹出。请确认这是必要的安全或兼容修复。" positive-text="确认开启" negative-text="取消" @positive-click="acceptFormMandatory"/>
    <NModal :show="Boolean(pendingMandatory)" preset="dialog" type="warning" title="确认设为强制更新" :content="pendingMandatory?`将 ${pendingMandatory.version} 设为强制更新后，所有低于此版本的用户将无法跳过本次更新，每次启动都会再次弹出。`:''" positive-text="确认设为强制" negative-text="取消" @update:show="value=>{if(!value)pendingMandatory=null}" @positive-click="setMandatory(pendingMandatory,true)"/>
    <NModal :show="Boolean(pendingDelete)" preset="dialog" type="error" title="确认删除发布记录" :content="pendingDelete?`删除 ${pendingDelete.version} 后无法恢复，客户端立即不再收到该版本。若只是暂停分发，请改用下架。`:''" positive-text="确认删除" negative-text="取消" @update:show="value=>{if(!value)pendingDelete=null}" @positive-click="remove"/>
  </div>
</template>
<style>
.release-tabs{margin-bottom:4px}
.release-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.release-gap{margin-top:18px}
.release-warning{margin:6px 0 0;font-size:12px;line-height:1.7;color:#bc4954}
.release-actions{display:flex;gap:8px;flex-wrap:wrap}
@media(max-width:600px){.release-form-grid{grid-template-columns:minmax(0,1fr)}}
</style>
