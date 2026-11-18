<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref} from 'vue'
import { DialogPlugin } from 'tdesign-vue-next'
import {callAdmin} from '@/utils/sealApi'
import {useUserStore} from '@/stores/user'
const user=useUserStore()
const canWrite=computed(()=>user.hasPermission('converter:write'))
const props={call:callAdmin}
const state=ref<any>(null),busy=ref(false),error=ref(''),notice=ref(''),enabled=ref(false),concurrency=ref(1),search=ref('')
const confirmReset=ref(false),issuedToken=ref('')
let disposed=false
async function run(task:()=>Promise<void>){if(busy.value)return;busy.value=true;error.value='';notice.value='';try{await task()}catch(e){if(!disposed){error.value=e instanceof Error?e.message:'操作失败';DialogPlugin.alert({header:'操作未完成',body:error.value,confirmBtn:'知道了'})}}finally{if(!disposed)busy.value=false}}
async function load(){const result=await props.call('converter');if(disposed)return;state.value=result;enabled.value=result.config.enabled;concurrency.value=result.config.concurrency}
async function save(){await run(async()=>{await props.call('converter','PATCH',{enabled:enabled.value,concurrency:concurrency.value});await load();if(!disposed)notice.value='配置已保存并应用到转换服务'})}
async function rotate(){confirmReset.value=false;await run(async()=>{const result=await props.call('converter/token','POST',{});if(disposed)return;issuedToken.value=result.token;await load()})}
async function test(){await run(async()=>{const result=await props.call('converter/test','POST',{});await load();if(!disposed)notice.value=result.passed?'真实 DOC 转换、重开及中文前导零检查通过':'转换测试未通过'})}
async function copy(value:string){await run(async()=>{if(!navigator.clipboard?.writeText)throw new Error('浏览器不支持自动复制，请选择文本后手动复制');await navigator.clipboard.writeText(value);if(!disposed)notice.value='已复制'})}
const jobs=computed(()=>{const rows=state.value?.statistics?.recent||[],query=search.value.trim().toLowerCase();if(!query)return rows;return rows.filter((r:any)=>[r.inputFormat,r.outputFormat,`${r.inputFormat} → ${r.outputFormat}`,r.status==='succeeded'?'成功':'失败',r.status,r.error,new Date(r.startedAt).toLocaleString('zh-CN')].join(' ').toLowerCase().includes(query))})
onMounted(()=>void run(load))
onUnmounted(()=>{disposed=true;issuedToken.value=''})

</script>
<template>
<section class="converter-page"><header class="converter-heading"><div><h1>文档转换</h1><p>管理手机兼容格式转换、访问令牌与任务状态</p></div><div class="converter-actions"><t-button :loading="busy" @click="run(load)">刷新状态</t-button><t-button v-if="canWrite" :disabled="busy||!state?.engine?.ready||state?.testing" @click="test">测试真实文档转换</t-button></div></header>
<t-alert v-if="error" theme="error" :message="error"/><t-alert v-if="notice" theme="success" :message="notice"/>
<template v-if="state"><div class="converter-stats"><t-card title="转换服务"><strong>{{!state.connected?'未连接':state.config.enabled?'已启用':'已暂停'}}</strong><p>{{state.engine?.ready?state.engine.version:state.error||'转换引擎不可用'}}</p></t-card><t-card title="正在运行 / 并发上限"><strong>{{state.statistics?.active ?? '暂无数据'}} / {{state.config.concurrency}}</strong><p>{{state.testing?'正在进行管理测试':'最近任务仅记录格式、大小与结果'}}</p></t-card><t-card title="本次启动成功 / 失败"><strong>{{state.statistics?.succeeded ?? '暂无数据'}} / {{state.statistics?.failed ?? '暂无数据'}}</strong><p>服务重启后此统计重新计数</p></t-card></div>
<div class="converter-grid"><t-card title="转换接口与访问令牌"><label for="converter-endpoint">手机服务地址</label><t-input id="converter-endpoint" :value="state.config.endpoint" readonly/><t-button :disabled="busy" @click="copy(state.config.endpoint)">复制服务地址</t-button><p>访问令牌：{{state.config.tokenConfigured?'已配置 · 指纹 '+state.config.tokenFingerprint:'尚未生成'}}</p><p>手机设置 → 文档格式兼容，填写此地址和访问令牌。每次上传正文前由用户确认。</p><t-button v-if="canWrite" :disabled="busy||!state.connected" @click="confirmReset=true">{{state.config.tokenConfigured?'重置访问令牌':'生成访问令牌'}}</t-button></t-card><t-card title="运行配置"><form @submit.prevent="save"><fieldset :disabled="!canWrite" class="converter-config-fieldset"><p>接收新的转换请求 <t-switch v-model="enabled" :disabled="busy||!canWrite"/></p><p>同时处理任务数 <t-radio-group v-model="concurrency" :disabled="busy||!canWrite"><t-radio :value="1">1 个</t-radio><t-radio :value="2">2 个</t-radio></t-radio-group></p><p>单文件限制 / 转换超时：20 MiB / 90 秒</p><p>最后真实转换测试：{{state.lastTest?((state.lastTest.passed?'通过':'失败')+' · '+new Date(state.lastTest.finishedAt).toLocaleString('zh-CN')):'尚未运行'}}</p><p>暂停会拒绝新请求，已开始的任务继续完成。设置与令牌重置记入操作记录。</p><t-button v-if="canWrite" theme="primary" type="submit" :loading="busy">保存转换配置</t-button></fieldset></form></t-card></div>
<t-card title="近期转换任务"><t-input v-model="search" clearable placeholder="搜索格式、结果或失败原因" class="converter-search"/><t-table :key="search" row-key="startedAt" :data="jobs" :columns="[{colKey:'startedAt',title:'开始时间'},{colKey:'format',title:'格式'},{colKey:'inputBytes',title:'文件大小'},{colKey:'milliseconds',title:'用时'},{colKey:'status',title:'结果'},{colKey:'error',title:'原因'}]" :pagination="{defaultCurrent:1,defaultPageSize:10,total:jobs.length}"><template #startedAt="{row}">{{new Date(row.startedAt).toLocaleString('zh-CN')}}</template><template #format="{row}">{{row.inputFormat.toUpperCase()}} → {{row.outputFormat.toUpperCase()}}</template><template #inputBytes="{row}">{{(row.inputBytes/1048576).toFixed(2)}} MiB</template><template #milliseconds="{row}">{{(row.milliseconds/1000).toFixed(2)}} 秒</template><template #status="{row}">{{row.status==='succeeded'?'成功':'失败'}}</template></t-table><p>不记录文件名、正文、访问令牌或私有云资料。</p></t-card></template>
<t-dialog v-model:visible="confirmReset" :header="state?.config.tokenConfigured?'重置访问令牌':'生成访问令牌'" :body="state?.config.tokenConfigured?'重置后手机原令牌失效，正在运行的任务会继续完成。':'令牌只在生成后显示一次。'" @confirm="rotate"/>
<t-dialog :visible="Boolean(issuedToken)" header="保存新的访问令牌" :footer="false" :close-on-overlay-click="false" @close="issuedToken='' "><p>此令牌仅显示一次，请复制到手机的文档转换配置。</p><t-input :value="issuedToken" type="password" readonly/><div class="converter-actions"><t-button theme="primary" @click="copy(issuedToken)">复制访问令牌</t-button><t-button @click="issuedToken=''">已保存，关闭</t-button></div></t-dialog>
</section>
</template>
<style scoped>
.converter-config-fieldset{border:0;padding:0;margin:0}.converter-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:20px}.converter-heading h1{font-size:22px;margin:0}.converter-heading p{color:var(--tl-text-3)}.converter-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.converter-stats,.converter-grid{display:grid;gap:16px;margin:16px 0}.converter-stats{grid-template-columns:repeat(3,minmax(0,1fr))}.converter-stats strong{font-size:24px}.converter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.converter-search{max-width:320px;margin-bottom:16px}@media(max-width:720px){.converter-stats,.converter-grid{grid-template-columns:1fr}.converter-config-fieldset{border:0;padding:0;margin:0}.converter-heading{flex-wrap:wrap}}
</style>
