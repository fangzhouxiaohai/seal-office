<script setup lang="ts">
import {onMounted,onUnmounted,ref} from 'vue'
const props=defineProps<{call:(route:string,method?:string,body?:unknown)=>Promise<any>}>()
const state=ref<any>(null),busy=ref(false),error=ref(''),notice=ref(''),enabled=ref(false),concurrency=ref(1)
const confirmReset=ref(false),issuedToken=ref('')
let disposed=false
async function run(task:()=>Promise<void>){if(busy.value)return;busy.value=true;error.value='';notice.value='';try{await task()}catch(e){if(!disposed)error.value=e instanceof Error?e.message:'操作失败'}finally{if(!disposed)busy.value=false}}
async function load(){const result=await props.call('converter');if(disposed)return;state.value=result;enabled.value=result.config.enabled;concurrency.value=result.config.concurrency}
async function save(){await run(async()=>{await props.call('converter','PATCH',{enabled:enabled.value,concurrency:concurrency.value});await load();if(!disposed)notice.value='配置已保存并应用到转换服务'})}
async function rotate(){confirmReset.value=false;await run(async()=>{const result=await props.call('converter/token','POST',{});if(disposed)return;issuedToken.value=result.token;await load()})}
async function test(){await run(async()=>{const result=await props.call('converter/test','POST',{});await load();if(!disposed)notice.value=result.passed?'真实 DOC 转换、重开及中文前导零检查通过':'转换测试未通过'})}
async function copy(value:string){await run(async()=>{if(!navigator.clipboard?.writeText)throw new Error('浏览器不支持自动复制，请选择文本后手动复制');await navigator.clipboard.writeText(value);if(!disposed)notice.value='已复制'})}
const columns=[{title:'开始时间',key:'startedAt',render:(r:any)=>new Date(r.startedAt).toLocaleString('zh-CN')},{title:'格式',key:'inputFormat',render:(r:any)=>r.inputFormat.toUpperCase()+' → '+r.outputFormat.toUpperCase()},{title:'文件大小',key:'inputBytes',render:(r:any)=>(r.inputBytes/1048576).toFixed(2)+' MiB'},{title:'用时',key:'milliseconds',render:(r:any)=>(r.milliseconds/1000).toFixed(2)+' 秒'},{title:'结果',key:'status',render:(r:any)=>r.status==='succeeded'?'成功':'失败'},{title:'原因',key:'error',render:(r:any)=>r.error||'—',ellipsis:{tooltip:true}}]
onMounted(()=>void run(load))
onUnmounted(()=>{disposed=true;issuedToken.value=''})
</script>
<template>
  <div class="converter-panel">
    <div class="converter-refresh"><NButton :loading="busy" @click="run(load)">刷新转换状态</NButton><NButton :loading="busy" :disabled="!state?.engine?.ready||state?.testing" @click="test">测试真实文档转换</NButton></div>
    <NAlert v-if="error" type="error" role="alert" class="converter-alert">{{error}}</NAlert><NAlert v-if="notice" type="success" aria-live="polite" class="converter-alert">{{notice}}</NAlert>
    <NSpin :show="busy&&!state"><template v-if="state">
      <div class="converter-stats"><div class="stat-card"><span>转换服务</span><strong class="converter-status">{{!state.connected?'未连接':state.config.enabled?'已启用':'已暂停'}}</strong><p>{{state.engine?.ready?state.engine.version:state.error||'转换引擎不可用'}}</p></div><div class="stat-card"><span>正在运行 / 并发上限</span><strong>{{state.statistics?.active||0}}<small>/ {{state.config.concurrency}}</small></strong><p>{{state.testing?'正在进行管理测试':'最近任务仅记录格式、大小与结果'}}</p></div><div class="stat-card"><span>本次启动成功 / 失败</span><strong>{{state.statistics?.succeeded||0}}<small>/ {{state.statistics?.failed||0}}</small></strong><p>服务重启后此统计重新计数</p></div></div>
      <div class="converter-grid"><NCard title="转换接口与访问令牌">
        <label class="converter-label" for="converter-endpoint">手机服务地址</label><NInput id="converter-endpoint" name="converter_endpoint" :value="state.config.endpoint" readonly/><NButton class="converter-copy" :disabled="busy" @click="copy(state.config.endpoint)">复制服务地址</NButton>
        <dl class="detail-list"><div><dt>访问令牌</dt><dd>{{state.config.tokenConfigured?'已配置 · 指纹 '+state.config.tokenFingerprint:'尚未生成'}}</dd></div><div><dt>接口</dt><dd>GET /v1/capabilities<br/>POST /v1/convert</dd></div></dl>
        <p class="service-note">手机设置 → 文档格式兼容，填写此地址和访问令牌。每次上传正文前由用户确认；任务结束后删除正文临时文件。</p><NButton :disabled="busy||!state.connected" @click="confirmReset=true">{{state.config.tokenConfigured?'重置访问令牌':'生成访问令牌'}}</NButton>
      </NCard><NCard title="运行配置">
        <form method="post" action="/api/v1/admin/converter" @submit.prevent="save"><fieldset class="converter-fieldset"><legend class="converter-label">服务启停与并发</legend>
          <div class="converter-field"><label for="converter-enabled">接收新的转换请求</label><NSwitch id="converter-enabled" v-model:value="enabled" :disabled="busy" aria-label="接收新的转换请求"/></div>
          <div class="converter-field"><label>同时处理任务数</label><NRadioGroup v-model:value="concurrency" name="converter_concurrency" :disabled="busy"><NRadio :value="1">1 个</NRadio><NRadio :value="2">2 个</NRadio></NRadioGroup></div>
          <dl class="detail-list"><div><dt>单文件限制 / 转换超时</dt><dd>20 MiB / 90 秒</dd></div><div><dt>最后真实转换测试</dt><dd>{{state.lastTest?((state.lastTest.passed?'通过':'失败')+' · '+new Date(state.lastTest.finishedAt).toLocaleString('zh-CN')):'尚未运行'}}</dd></div></dl>
          <p class="service-note">暂停会拒绝新请求，已经开始的任务继续完成。宏只导入正文，不执行或回写宏。设置与令牌重置会记入后台操作记录。</p><NButton type="primary" attr-type="submit" :loading="busy">保存转换配置</NButton>
        </fieldset></form>
      </NCard></div>
      <NCard title="近期转换任务" class="converter-jobs"><template #header-extra><span class="table-count">本次启动最多 100 条</span></template><NDataTable :columns="columns" :data="state.statistics?.recent||[]" :pagination="{pageSize:10}" :scroll-x="880"/><p class="service-note">不记录文件名、正文、访问令牌或私有云资料。此列表用于检查转换成功率与失败原因。</p></NCard>
    </template></NSpin>
    <NModal v-model:show="confirmReset" preset="dialog" :title="state?.config.tokenConfigured?'重置访问令牌':'生成访问令牌'" :content="state?.config.tokenConfigured?'重置后，手机上原来的令牌将失效，需要重新填写。正在运行的转换任务会继续完成。':'生成手机连接此服务使用的访问令牌。令牌只会在生成后显示一次。'" positive-text="确认生成" negative-text="取消" @positive-click="rotate"/>
    <NModal :show="Boolean(issuedToken)" preset="card" title="保存新的访问令牌" class="converter-token-modal" :mask-closable="false" @update:show="value=>{if(!value)issuedToken=''}"><p>此令牌仅显示一次。请复制到手机的文档转换配置，关闭后后台不再显示原文。</p><label class="converter-label" for="converter-issued-token">访问令牌</label><NInput id="converter-issued-token" name="converter_issued_token" :value="issuedToken" type="password" show-password-on="click" readonly autocomplete="off"/><div class="converter-token-actions"><NButton type="primary" :disabled="busy" @click="copy(issuedToken)">复制访问令牌</NButton><NButton :disabled="busy" @click="issuedToken=''">已保存，关闭</NButton></div></NModal>
  </div>
</template>
<style>
.converter-refresh{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}.converter-alert{margin-bottom:20px}.converter-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.converter-status{font-size:26px!important}.converter-stats .stat-card{min-width:0}.converter-stats p{overflow-wrap:anywhere;line-height:1.6}.converter-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:24px}.converter-grid>.n-card,.converter-jobs{min-width:0;border-radius:14px;border-color:#e7ecf3}.converter-label{display:block;font-size:13px;color:#4c5b72;margin-bottom:10px}.converter-copy{margin-top:12px}.converter-fieldset{border:0;padding:0;margin:0;min-width:0}.converter-fieldset legend{padding:0}.converter-field{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:18px 0;border-bottom:1px solid #edf0f5;font-size:13px}.converter-jobs{margin-top:24px}.converter-token-modal{width:520px;max-width:calc(100vw - 32px)}.converter-token-modal p{font-size:13px;line-height:1.8;color:#64748b}.converter-token-actions{display:flex;gap:12px;margin-top:20px;flex-wrap:wrap}@media(max-width:900px){.converter-grid{grid-template-columns:minmax(0,1fr)}}@media(max-width:600px){.converter-stats{grid-template-columns:minmax(0,1fr)}.converter-field{flex-wrap:wrap}}
</style>
