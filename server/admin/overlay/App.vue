<script setup lang="ts">
import {computed,h,onMounted,ref} from 'vue'
import {NConfigProvider,zhCN,dateZhCN} from 'naive-ui'
import AppProvider from './components/common/app-provider.vue'
import ConverterPanel from './ConverterPanel.vue'
const token=ref(sessionStorage.getItem('seal-admin-token')||''),password=ref(''),busy=ref(false),error=ref(''),section=ref('overview')
const empty=()=>({users:[],publications:[],audit:[]})
const data=ref<any>(empty()),review=ref<any>(null),search=ref(''),statusFilter=ref('all'),actionFilter=ref('all'),updated=ref('')
let reviewEpoch=0
const options=[{label:'运行概览',key:'overview',description:'服务运行与空间使用情况'}, {label:'账号与用量',key:'users',description:'查看账号状态、注册时间与实际空间占用'}, {label:'演示模板审核',key:'template',description:'审核用户主动发布的演示模板'}, {label:'知识内容审核',key:'knowledge',description:'审核用户主动发布的知识资料'}, {label:'皮肤审核',key:'skin',description:'审核用户上传的界面皮肤，确认配色可读、无侵权后公开'}, {label:'操作记录',key:'audit',description:'查看云端操作与审核记录'}, {label:'文档转换',key:'converter',description:'管理手机兼容格式转换、访问令牌与任务状态'}]
const current=computed(()=>options.find(o=>o.key===section.value)!)
const labels:Record<string,string>={pending:'待审核',approved:'已公开',rejected:'已拒绝',withdrawn:'已撤回'}
const statusOptions=[{label:'全部状态',value:'all'},...Object.entries(labels).map(([value,label])=>({value,label}))]
const actionLabels:Record<string,string>={'login':'登录云空间','enable-space':'开通云空间','purge-space':'清空并停用云空间','publish-request':'提交公开申请','public-report':'举报公开内容','review':'审核公开内容','review-download':'下载公开原文件','converter-config':'修改转换配置','converter-token-reset':'重置转换令牌','converter-test':'转换测试'}
const actionLabel=(value:any)=>actionLabels[String(value)]||String(value||'未知动作')
const pad=(value:number)=>String(value).padStart(2,'0')
const stamp=(value:any)=>{const time=Number(value);if(!time)return '—';const date=new Date(time);return Number.isNaN(date.getTime())?'—':`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`}
const shortId=(value:any)=>String(value||'').slice(0,8)
const accountOf=(value:any)=>value==='admin'?'管理员':(data.value.users.find((u:any)=>u.id===value)||{}).phone||String(value||'—')
function detailText(row:any){
  const raw=String(row.detail||'').trim(),action=String(row.action||'')
  if(!raw)return '—'
  try{
    if(action==='review'){const [id,status]=raw.split(':');return `公开内容 #${shortId(id)} · ${labels[status]||status||'已处理'}`}
    if(action==='review-download')return `公开原文件 #${shortId(raw)}`
    if(action==='publish-request')return `公开内容 #${shortId(raw)}`
    if(action==='public-report'){const [id,...rest]=raw.split(':');return `公开内容 #${shortId(id)} · ${rest.join(':')||'未填写理由'}`}
    if(action==='converter-config'){const config=JSON.parse(raw);return `${config.enabled?'启用':'暂停'} · 并发 ${config.concurrency}`}
    if(action==='converter-token-reset')return `令牌指纹 ${raw}`
    if(action==='converter-test')return raw==='passed'?'检查通过':'检查未通过'
  }catch{return raw}
  return raw
}
function clearSession(){reviewEpoch++;token.value='';sessionStorage.removeItem('seal-admin-token');data.value=empty();review.value=null;updated.value=''}
async function call(route:string,method='GET',body?:unknown){const r=await fetch('/api/v1/admin/'+route,{method,headers:{'Content-Type':'application/json',...(token.value?{Authorization:'Bearer '+token.value}:{})},...(body?{body:JSON.stringify(body)}:{})});let result:any;try{result=await r.json()}catch{throw new Error('服务暂时无法响应，请稍后重试')}if(!r.ok){if(r.status===401)clearSession();throw new Error(result.error||'请求失败')}return result}
async function run(task:()=>Promise<any>){if(busy.value)return;busy.value=true;error.value='';try{await task()}catch(e){error.value=e instanceof Error?e.message:'操作失败'}finally{busy.value=false}}
async function load(){const owner=token.value;const result=await call('overview');if(owner!==token.value)return;data.value={...result,users:result.users.map((u:any)=>({...u,phone:String(u.phone||'').replace(/^(\d{3})\d{4}(\d{4})$/,'$1****$2')}))};updated.value=new Date().toLocaleTimeString('zh-CN',{hour12:false})}
async function login(){if(!password.value)return;await run(async()=>{const r=await call('login','POST',{username:'admin',password:password.value});password.value='';token.value=r.token;sessionStorage.setItem('seal-admin-token',r.token);await load()})}
async function logout(){await run(async()=>{await call('logout','POST');clearSession()})}
async function openReview(id:string){const request=++reviewEpoch,owner=token.value;await run(async()=>{const result=await call('publications/'+encodeURIComponent(id));if(request===reviewEpoch&&owner===token.value)review.value=result})}
async function downloadReview(){await run(async()=>{const r=await fetch('/api/v1/admin/publications/'+encodeURIComponent(review.value.id)+'/download',{headers:{Authorization:'Bearer '+token.value}});if(r.status===401){clearSession();throw new Error('登录已过期，请重新登录')}if(!r.ok)throw new Error('公开原文件下载失败');const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download=review.value.name||review.value.title;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)})}
async function decide(status:string){await run(async()=>{await call('publications/'+encodeURIComponent(review.value.id),'PATCH',{status});review.value=null;await load()})}
function navigate(key:string){reviewEpoch++;section.value=key;search.value='';statusFilter.value='all';actionFilter.value='all';review.value=null;error.value=''}
const publications=computed(()=>data.value.publications.filter((p:any)=>p.kind===section.value&&(statusFilter.value==='all'||p.status===statusFilter.value)&&[p.title,p.category,p.description].join(' ').toLowerCase().includes(search.value.trim().toLowerCase())))
const users=computed(()=>{const query=search.value.trim().toLowerCase();return query?data.value.users.filter((u:any)=>`${u.phone} ${u.id}`.toLowerCase().includes(query)):data.value.users})
const auditRows=computed(()=>{const query=search.value.trim().toLowerCase();return data.value.audit.filter((row:any)=>{if(actionFilter.value!=='all'&&row.action!==actionFilter.value)return false;return !query||[accountOf(row.user_id),row.user_id,actionLabel(row.action),row.action,row.detail,detailText(row),stamp(row.time)].join(' ').toLowerCase().includes(query)})})
const actionOptions=computed(()=>{const seen=new Map<string,string>();for(const row of data.value.audit)if(!seen.has(row.action))seen.set(row.action,actionLabel(row.action));return [{label:'全部动作',value:'all'},...[...seen].map(([value,label])=>({value,label})).sort((a,b)=>String(a.label).localeCompare(String(b.label),'zh-CN'))]})
const total=computed(()=>data.value.users.reduce((sum:number,u:any)=>sum+u.used,0))
const opened=computed(()=>data.value.users.filter((u:any)=>u.enabled).length)
const pending=computed(()=>data.value.publications.filter((p:any)=>p.status==='pending').length)
const userCount=computed(()=>search.value.trim()?`${users.value.length} / ${data.value.users.length} 个账号`:`${data.value.users.length} 个账号 · 已开通 ${opened.value}`)
const renderPill=(text:string,tone:string)=>h('span',{class:['pill',tone].filter(Boolean)},text)
const userColumns=[
  {title:'手机号',key:'phone',width:150,render:(u:any)=>h('span',{class:'num'},u.phone),sorter:(a:any,b:any)=>String(a.phone||'').localeCompare(String(b.phone||''))},
  {title:'账号标识',key:'id',width:200,ellipsis:{tooltip:true},render:(u:any)=>h('span',{class:'cell-id'},u.id)},
  {title:'云空间',key:'enabled',width:104,render:(u:any)=>renderPill(u.enabled?'已开通':'关闭',u.enabled?'ok':'')},
  {title:'自动保存',key:'autosave',width:104,render:(u:any)=>renderPill(u.autosave?'开启':'关闭',u.autosave?'ok':'')},
  {title:'注册时间',key:'created',width:164,sorter:(a:any,b:any)=>(Number(a.created)||0)-(Number(b.created)||0),render:(u:any)=>h('span',{class:'stamp'},stamp(u.created))},
  {title:'最后一次操作时间',key:'lastAction',width:184,sorter:(a:any,b:any)=>(Number(a.lastAction)||0)-(Number(b.lastAction)||0),defaultSortOrder:'descend',render:(u:any)=>h('span',{class:u.lastAction?'stamp':'stamp muted'},stamp(u.lastAction))},
  {title:'实际占用',key:'used',width:120,align:'right',sorter:(a:any,b:any)=>(Number(a.used)||0)-(Number(b.used)||0),render:(u:any)=>h('span',{class:'num'},(Number(u.used||0)/1000000).toFixed(2)+' MB')}
]
const auditColumns=[
  {title:'时间',key:'time',width:170,defaultSortOrder:'descend',sorter:(a:any,b:any)=>(Number(a.time)||0)-(Number(b.time)||0),render:(row:any)=>h('span',{class:'stamp'},stamp(row.time))},
  {title:'操作账号',key:'user_id',width:190,render:(row:any)=>row.user_id==='admin'?h('span',{class:'cell-admin'},'管理员'):h('span',{class:'num'},accountOf(row.user_id))},
  {title:'动作',key:'action',width:168,render:(row:any)=>actionLabel(row.action)},
  {title:'记录',key:'detail',ellipsis:{tooltip:true},render:(row:any)=>detailText(row)}
]
const theme={common:{primaryColor:'#2463EB',primaryColorHover:'#437CF2',primaryColorPressed:'#194DCA',borderRadius:'10px',fontFamily:'"Segoe UI", "Microsoft YaHei", sans-serif'},Button:{fontWeight:'600',borderRadiusMedium:'10px'},Card:{titleFontWeight:'650',borderRadius:'16px',borderColor:'#e9eef5'},DataTable:{thColor:'#f8fafd',thTextColor:'#5b6b84',thFontWeight:'600',tdColor:'#ffffff',tdColorHover:'#fafcff',tdTextColor:'#3d4e69',borderColor:'#eef2f7'},Input:{borderRadius:'10px'},InternalSelection:{borderRadius:'10px'},Tag:{borderRadius:'7px'},Pagination:{itemBorderRadius:'8px'}}
onMounted(()=>{if(token.value)void run(load)})
</script>
<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="theme"><AppProvider>
    <main v-if="!token" class="login-page">
      <section class="login-story"><div class="login-brand"><img src="/seal-logo.png" alt="海豹办公标志"/><span>海豹办公<strong>云端管理控制台</strong></span></div>
        <div class="story-content"><span class="eyebrow">SEAL OFFICE · CLOUD</span><h1>让每一份创作，<br/>都有可靠的归处。</h1><p class="story-intro">统一管理云端账号、演示模板与知识资料，<br/>为海豹办公用户提供稳定的协作服务。</p><div class="story-panels"><div><span>私有云空间</span><strong>客户端加密</strong><p>私有正文与文件名以密文保存</p></div><div><span>公开内容</span><strong>审核后发布</strong><p>模板与知识资料均支持撤回</p></div></div></div>
        <span class="story-footer">海豹办公 · 专注创作，安心管理</span>
      </section>
      <section class="login-form-area"><div class="login-form"><span class="eyebrow">管理员工作台</span><h2>欢迎回来</h2><p class="form-intro">登录以查看服务状态及处理公开内容审核。</p><form @submit.prevent="login"><label for="admin-name">管理员账号</label><NInput id="admin-name" value="admin" readonly size="large" autocomplete="username"/><label for="admin-password">登录密码</label><NInput id="admin-password" v-model:value="password" type="password" show-password-on="click" placeholder="请输入管理员密码" size="large" autocomplete="current-password"/><NAlert v-if="error" type="error" class="login-error">{{error}}</NAlert><NButton attr-type="submit" type="primary" size="large" block :loading="busy" :disabled="!password||busy" class="login-submit">登录管理后台</NButton></form><p class="login-footnote">仅供授权管理员使用。私有云文档不提供解密入口。</p></div><span class="login-copyright">海豹办公云端服务</span></section>
    </main>
    <div v-else class="admin-shell">
      <aside class="sidebar"><div class="sidebar-brand"><img src="/seal-logo.png" alt="海豹办公标志"/><div><strong>海豹办公</strong><span>云端管理控制台</span></div></div><span class="nav-caption">工作台</span><nav aria-label="管理导航"><button v-for="(item,index) in options" :key="item.key" class="nav-item" :class="{active:section===item.key}" :aria-current="section===item.key?'page':undefined" @click="navigate(item.key)"><span class="nav-index">0{{index+1}}</span>{{item.label}}<span v-if="item.key==='overview'&&pending" class="nav-count">{{pending}}</span></button></nav><div class="sidebar-note"><strong>私有资料保持加密</strong><p>此工作台仅审核用户主动发布的公开资料。</p></div></aside>
      <div class="workspace"><header class="topbar"><span class="breadcrumb">海豹办公 <span>/</span> 管理工作台</span><div class="topbar-actions"><span class="admin-avatar">管</span><span>管理员</span><NButton quaternary :disabled="busy" @click="logout">退出登录</NButton></div></header>
        <main class="workspace-content"><div class="page-heading"><div><span class="eyebrow">云端管理</span><h1>{{current.label}}</h1><p>{{current.description}}</p></div><div v-if="section!=='converter'" class="refresh-area"><span v-if="updated">更新于 {{updated}}</span><NButton :loading="busy" @click="run(load)">刷新数据</NButton></div></div><NAlert v-if="error" type="error" class="page-error">{{error}}</NAlert>
          <template v-if="section==='overview'"><div class="stats-grid"><div class="stat-card"><span>账号总数</span><strong>{{data.users.length}}<small>个</small></strong><p>已注册的海豹办公账号</p></div><div class="stat-card"><span>实际文件占用</span><strong>{{(total/1000000).toFixed(2)}}<small>MB</small></strong><p>包含历史版本与回收站</p></div><div class="stat-card"><span>等待审核</span><strong>{{pending}}<small>项</small></strong><p>演示模板、知识与皮肤公开申请</p></div></div>
            <div class="overview-grid"><NCard title="云服务运行"><template #header-extra><NTag :type="data.runtime?'success':'default'" round>{{data.runtime?'已连接':'等待数据'}}</NTag></template><div class="service-metrics"><div><span>服务器剩余磁盘</span><strong>{{((data.runtime?.diskFree||0)/1000000000).toFixed(2)}}<small>GB</small></strong></div><div><span>进程内存</span><strong>{{((data.runtime?.memory||0)/1000000).toFixed(0)}}<small>MB</small></strong></div><div><span>待提交上传</span><strong>{{data.runtime?.pendingUploads||0}}<small>项</small></strong></div><div><span>每账号实际配额</span><strong>{{((data.quota||300000000)/1000000).toFixed(0)}}<small>MB</small></strong></div></div><div class="privacy-note"><strong>客户端加密保护</strong><p>私有文件名、正文与资料索引以密文保存，管理员无法在此工作台打开私有文档。</p></div></NCard><NCard title="短信服务"><template #header-extra><NTag :type="data.smsConfigured?'success':'warning'" round>{{data.smsConfigured?'已配置':'未配置'}}</NTag></template><dl class="detail-list"><div><dt>短信签名</dt><dd>{{data.sms?.sign||'未设置'}}</dd></div><div><dt>验证码模板</dt><dd>{{data.sms?.template||'未设置'}}</dd></div><div><dt>24 小时发送请求</dt><dd>{{data.sms?.lastDay||0}} 次</dd></div></dl><p class="service-note">配置状态仅表示服务接入情况，实际送达取决于运营商报备与短信发送结果。</p></NCard></div>
          </template>
          <NCard v-else-if="section==='users'" title="账号列表"><template #header-extra><span class="table-count">{{userCount}}</span></template><div class="list-toolbar"><NInput v-model:value="search" clearable placeholder="搜索号码前3位、后4位或账号标识" class="table-search"/><span class="toolbar-hint">按最后一次操作时间倒序 · 点击表头切换排序</span></div><NDataTable :columns="userColumns" :data="users" :pagination="{pageSize:20}" :scroll-x="1080" :loading="busy"/></NCard>
          <NCard v-else-if="section==='audit'" title="最近操作记录"><template #header-extra><span class="table-count">{{auditRows.length}} / {{data.audit.length}} 条记录</span></template><div class="list-toolbar"><NInput v-model:value="search" clearable placeholder="搜索号码片段、操作类型或记录内容" class="table-search"/><NSelect v-model:value="actionFilter" :options="actionOptions" class="table-select"/><span class="toolbar-hint">仅保留最近 200 条记录</span></div><NDataTable :columns="auditColumns" :data="auditRows" :pagination="{pageSize:20}" :scroll-x="900" :loading="busy"/></NCard>
          <ConverterPanel v-else-if="section==='converter'" :call="call"/>
          <template v-else><div class="list-toolbar"><NInput v-model:value="search" clearable placeholder="搜索标题、分类或说明" class="table-search"/><NSelect v-model:value="statusFilter" :options="statusOptions" class="table-select"/><span class="toolbar-hint">{{publications.length}} 项内容</span></div><NEmpty v-if="!publications.length" class="empty-state" :description="search||statusFilter!=='all'?'没有匹配的公开内容':'暂无公开内容申请'"/><div v-else class="publications-grid"><NCard v-for="p in publications" :key="p.id" class="publication-card"><div class="publication-cover"><img v-if="p.cover" :src="p.cover" alt="公开封面"/><div v-else class="cover-placeholder">{{section==='template'?'演示模板':section==='skin'?'界面皮肤':'知识资料'}}</div><span class="status-pill" :class="p.status">{{labels[p.status]||p.status}}</span></div><div class="publication-body"><span class="publication-category">{{p.category||'未分类'}}</span><h2>{{p.title}}</h2><NButton block :disabled="busy" @click="openReview(p.id)">查看资料并审核</NButton></div></NCard></div></template>
        </main><footer class="workspace-footer">海豹办公 · 云端管理控制台</footer>
      </div>
    </div>
    <NModal :show="Boolean(review)" @update:show="value=>{if(!value)review=null}" preset="card" title="公开内容审核" class="review-modal" :mask-closable="false" @close="review=null"><template v-if="review"><div class="review-heading"><h2>{{review.title}}</h2><NTag>{{labels[review.status]||review.status}}</NTag></div><p class="review-intro">仅显示用户主动发布的公开资料。请检查原文件后决定是否发布。</p><NButton :loading="busy" :disabled="review.status==='withdrawn'" @click="downloadReview">下载公开原文件检查</NButton><pre>{{review.text||'暂无文字预览，请下载公开文件检查。'}}</pre><NAlert v-if="error" type="error">{{error}}</NAlert><div class="review-actions"><NButton type="primary" :loading="busy" :disabled="review.status==='withdrawn'||review.status==='approved'" @click="decide('approved')">通过并公开</NButton><NButton type="warning" :disabled="busy||review.status==='withdrawn'||review.status==='rejected'" @click="decide('rejected')">拒绝发布</NButton><NButton type="error" :disabled="busy||review.status==='withdrawn'" @click="decide('withdrawn')">下架</NButton></div></template></NModal>
  </AppProvider></NConfigProvider>
</template>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:'Segoe UI','Microsoft YaHei',sans-serif;color:#18233b;background:#f4f6f9}
button,input{font:inherit}
.eyebrow{font-size:12px;font-weight:650;letter-spacing:1.4px;color:#64748b}
.num,.stamp,.table-count{font-variant-numeric:tabular-nums}
.stamp.muted{color:#a9b4c4}
.cell-id{font-family:'Cascadia Mono',Consolas,'Courier New',monospace;font-size:12px;color:#6b7a92}
.cell-admin{color:#2458a9;font-weight:600}
.pill{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:7px;font-size:12px;line-height:1;background:#f2f5f9;color:#66768f}
.pill.ok{background:#edf9f3;color:#248966}
.pill.warn{background:#fff8e9;color:#af7620}
.pill.bad{background:#fff0f0;color:#bc4954}

/* 登录 */
.login-page{display:grid;grid-template-columns:minmax(440px,1fr) minmax(440px,1fr);min-height:100vh}
.login-story{display:flex;flex-direction:column;justify-content:space-between;padding:48px 64px;background:#142e57;color:#fff}
.login-brand{display:flex;align-items:center;gap:16px;font-size:23px;font-weight:650}
.login-brand img{width:52px;height:52px;border-radius:16px}
.login-brand strong{display:block;margin-top:4px;font-size:12px;font-weight:400;letter-spacing:1px;color:#b5c4dc}
.story-content{max-width:600px;padding:64px 0}
.story-content .eyebrow{color:#9fbcec}
.story-content h1{font-size:clamp(34px,3vw,52px);line-height:1.5;letter-spacing:1px;margin:22px 0}
.story-intro{color:#bfcde1;font-size:15px;line-height:1.9}
.story-panels{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:42px}
.story-panels>div{padding:24px 22px;border:1px solid #395172;border-radius:16px;background:#1c385f}
.story-panels span{font-size:12px;color:#b9cce9}
.story-panels strong{display:block;font-size:19px;margin-top:12px}
.story-panels p{color:#bdcde4;font-size:12px;margin-bottom:0;line-height:1.6}
.story-footer{font-size:12px;color:#91a8ca}
.login-form-area{display:flex;flex-direction:column;justify-content:center;align-items:center;padding:64px 40px;background:#fff;position:relative}
.login-form{width:100%;max-width:400px}
.login-form h2{font-size:34px;letter-spacing:1px;margin:16px 0 12px}
.form-intro{font-size:14px;line-height:1.8;color:#788397;margin:0 0 34px}
.login-form label{display:block;font-size:14px;font-weight:600;margin:22px 0 10px}
.login-form .n-input{min-height:46px}
.login-error{margin-top:18px}
.login-submit{margin-top:30px;height:48px}
.login-footnote{font-size:12px;line-height:1.8;color:#8b95a6;margin-top:22px}
.login-copyright{position:absolute;bottom:30px;font-size:12px;color:#9aa3b2}

/* 框架 */
.admin-shell{display:flex;min-height:100vh}
.sidebar{position:fixed;inset:0 auto 0 0;display:flex;flex-direction:column;width:244px;background:#142e57;color:#fff;padding:30px 18px;z-index:10}
.sidebar-brand{display:flex;align-items:center;gap:12px;padding:0 12px 34px}
.sidebar-brand img{width:42px;height:42px;border-radius:13px}
.sidebar-brand strong{font-size:20px}
.sidebar-brand span{display:block;font-size:11px;color:#afc0d9;margin-top:5px}
.nav-caption{padding:0 16px 12px;color:#97accb;font-size:11px;letter-spacing:2px}
.nav-item{display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;color:#bfcee2;text-align:left;padding:15px;border-radius:10px;margin-bottom:6px;cursor:pointer;font-size:14px;transition:background .15s,color .15s}
.nav-item:hover{background:#213e65;color:#fff}
.nav-item.active{background:#2463eb;color:#fff;font-weight:600}
.nav-item:focus-visible{outline:2px solid #9fc0ff;outline-offset:2px}
.nav-index{font-size:11px;opacity:.75;font-variant-numeric:tabular-nums}
.nav-count{margin-left:auto;border-radius:6px;background:#ffffff24;padding:1px 6px;font-size:11px}
.sidebar-note{margin-top:auto;padding:24px 14px 4px;font-size:12px;color:#b8c9df}
.sidebar-note strong{font-weight:500}
.sidebar-note p{line-height:1.8;color:#8fa8c9;font-size:11px;margin:10px 0 0}
.workspace{display:flex;flex-direction:column;min-width:0;flex:1;margin-left:244px}
.topbar{display:flex;align-items:center;justify-content:space-between;height:76px;background:#fff;border-bottom:1px solid #e9eef5;padding:0 36px}
.breadcrumb{font-size:13px;color:#728096}
.breadcrumb span{margin:0 14px;color:#bcc6d3}
.topbar-actions{display:flex;align-items:center;gap:12px;color:#4c5b72;font-size:13px}
.admin-avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#eaf0ff;color:#2463eb;font-size:12px;font-weight:600}
.workspace-content{padding:34px 36px 40px;max-width:1600px;width:100%;margin:0 auto;flex:1}
.page-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:28px}
.page-heading h1{font-size:28px;margin:10px 0 8px;letter-spacing:.5px}
.page-heading p{font-size:13px;color:#788397;margin:0}
.refresh-area{display:flex;align-items:center;gap:16px}
.refresh-area>span{font-size:12px;color:#919bad}
.page-error{margin-bottom:20px}

/* 概览 */
.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.stat-card{padding:25px 28px;border:1px solid #e9eef5;border-radius:16px;background:#fff;box-shadow:0 1px 2px #142e570d}
.stat-card>span{font-size:13px;color:#64748b}
.stat-card>strong{display:block;font-size:36px;font-weight:650;line-height:1.5;margin-top:14px;font-variant-numeric:tabular-nums}
.stat-card small{font-size:13px;font-weight:400;color:#91a0b3;margin-left:10px}
.stat-card p{font-size:12px;color:#99a3b3;margin:10px 0 0}
.overview-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:20px;margin-top:24px}
.overview-grid>.n-card{border-radius:16px;border-color:#e9eef5;box-shadow:0 1px 2px #142e570d}
.service-metrics{display:grid;grid-template-columns:1fr 1fr;gap:28px;padding:4px 0 24px}
.service-metrics span{display:block;color:#8290a4;font-size:12px}
.service-metrics strong{display:block;font-size:24px;font-weight:600;margin-top:10px;font-variant-numeric:tabular-nums}
.service-metrics small{font-size:12px;font-weight:400;color:#8997aa;margin-left:7px}
.privacy-note{border-radius:10px;background:#f1f5fd;padding:17px 20px;font-size:12px}
.privacy-note strong{color:#2458a9}
.privacy-note p{line-height:1.8;color:#71829d;margin:8px 0 0}
.detail-list{margin:0}
.detail-list>div{padding:18px 0;border-bottom:1px solid #edf0f5}
.detail-list dt{font-size:12px;color:#8290a4}
.detail-list dd{margin:9px 0 0;font-size:14px;color:#3d4e69;overflow-wrap:anywhere}
.service-note{color:#96a0b0;font-size:12px;line-height:1.8;margin:20px 0 0}

/* 列表 */
.list-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.table-search{max-width:360px;flex:1 1 240px}
.table-select{width:170px}
.toolbar-hint{margin-left:auto;font-size:12px;color:#8592a6}
.table-count{font-size:12px;color:#8592a6}
.empty-state{padding:90px 20px;background:#fff;border:1px solid #e9eef5;border-radius:16px}
.publications-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px}
.publication-card{overflow:hidden;border-radius:16px;border-color:#e9eef5;box-shadow:0 1px 2px #142e570d}
.publication-card>.n-card__content{padding:0!important}
.publication-cover{position:relative;height:164px;background:#edf2fa}
.publication-cover img{width:100%;height:100%;object-fit:cover}
.cover-placeholder{display:grid;place-items:center;height:100%;font-size:23px;font-weight:600;letter-spacing:3px;color:#6885b3;background:#ecf2fb}
.status-pill{position:absolute;top:12px;right:12px;font-size:11px;border-radius:7px;padding:5px 9px;background:#fff;color:#66768f;box-shadow:0 2px 10px #142e5710}
.status-pill.pending{color:#af7620;background:#fff8e9}
.status-pill.approved{color:#248966;background:#edf9f3}
.status-pill.rejected{color:#bc4954;background:#fff0f0}
.publication-body{padding:20px}
.publication-category{font-size:11px;color:#909cad}
.publication-body h2{font-size:17px;font-weight:600;line-height:1.6;margin:8px 0 20px;overflow-wrap:anywhere}
.workspace-footer{padding:0 36px 22px;font-size:11px;color:#a4adba}

/* 审核弹窗 */
.review-modal{width:800px;max-width:calc(100vw - 40px)}
.review-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.review-heading h2{font-size:21px;margin:0;overflow-wrap:anywhere}
.review-intro{font-size:13px;color:#7e8ca1;line-height:1.8}
.review-actions{display:flex;justify-content:flex-end;gap:12px;flex-wrap:wrap;margin-top:22px}
pre{white-space:pre-wrap;max-height:45vh;overflow:auto;font:14px/1.9 'Segoe UI','Microsoft YaHei',sans-serif;padding:20px;background:#f4f6fa;border-radius:10px;overflow-wrap:anywhere;margin:22px 0}

@media(max-width:1100px){
  .login-story{padding:40px}
  .story-panels{grid-template-columns:1fr}
  .story-panels>div{padding:18px}
  .sidebar{width:220px}
  .workspace{margin-left:220px}
  .workspace-content{padding:28px 24px}
  .topbar{padding:0 24px}
  .overview-grid{grid-template-columns:1fr}
  .stat-card{padding:22px}
  .stat-card>strong{font-size:30px}
}
@media(max-width:900px){
  .login-page{grid-template-columns:1fr}
  .login-story{padding:30px 40px}
  .story-content{padding:24px 0}
  .story-content h1{font-size:30px;margin:12px 0}
  .story-panels,.story-intro,.story-footer{display:none}
  .login-form-area{padding:40px 40px 80px;min-height:540px}
  .n-button{min-height:44px}
  .n-base-close{min-width:44px;min-height:44px}
  .publications-grid{grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))}
}
@media(max-width:760px){
  .login-page{display:block}
  .login-story{padding:24px 30px}
  .story-content{padding:32px 0}
  .story-content h1{font-size:30px}
  .story-panels,.story-footer,.story-intro{display:none}
  .login-form-area{min-height:560px;padding:45px 30px 80px}
  .sidebar{position:static;width:100%;padding:20px}
  .admin-shell{display:block}
  .sidebar-brand{padding:0 0 16px}
  .sidebar nav{display:flex;gap:6px;overflow:auto}
  .nav-item{white-space:nowrap;width:auto;padding:12px}
  .nav-index,.nav-caption,.sidebar-note{display:none}
  .workspace{margin-left:0}
  .topbar{height:64px;padding:0 20px}
  .breadcrumb{display:none}
  .topbar-actions{margin-left:auto}
  .workspace-content{padding:26px 20px}
  .page-heading{align-items:flex-start}
  .page-heading h1{font-size:24px}
  .refresh-area>span{display:none}
  .stats-grid{grid-template-columns:1fr;gap:12px}
  .stat-card{padding:20px}
  .stat-card>strong{margin-top:8px}
  .list-toolbar{align-items:flex-start}
  .table-search{max-width:none;flex-basis:100%}
  .table-select{width:160px}
  .toolbar-hint{margin-left:0}
  .workspace-footer{padding:0 20px 20px}
}
</style>
