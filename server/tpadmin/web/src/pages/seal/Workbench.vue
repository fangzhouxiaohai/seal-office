<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { DialogPlugin } from 'tdesign-vue-next';
import { callAdmin, expireSession } from '@/utils/sealApi';
import { readAdminToken } from '@/utils/sealAuth';
import { filterPublications, maskPhone, mergeReview, sortUsers, auditDetail, requiredOverviewSection } from './managementModel';
import { useUserStore } from '@/stores/user';
import OverviewDashboard from './OverviewDashboard.vue';

const props = defineProps<{ section: 'overview' | 'users' | 'template' | 'knowledge' | 'skin' | 'audit' }>();
const userStore = useUserStore();
const data = ref<any>(null), error = ref(''), busy = ref(false), query = ref(''), status = ref('all'), action = ref('all'), review = ref<any>(null);
let reviewEpoch = 0;
const titles: Record<string, [string, string]> = {
  overview: ['运行概览', '服务运行与空间使用情况'], users: ['用户管理', '查看用户状态与实际空间占用'],
  template: ['演示模板审核', '审核用户主动发布的演示模板'], knowledge: ['知识内容审核', '审核用户主动发布的知识资料'],
  skin: ['皮肤审核', '审核用户主动发布的界面皮肤'], audit: ['操作记录', '查看云端操作与审核记录'],
};
const labels: Record<string, string> = { pending: '待审核', approved: '已公开', rejected: '已拒绝', withdrawn: '已撤回' };
const statusTabs = computed(() => [{ value: 'all', label: '全部' }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))].map(tab => ({ ...tab, count: (data.value?.publications || []).filter((row: any) => row.kind === props.section && (tab.value === 'all' || row.status === tab.value)).length })));
const actions: Record<string, string> = { login:'登录云空间', 'enable-space':'开通云空间', 'purge-space':'清空并停用云空间', 'publish-request':'提交公开申请', 'public-report':'举报公开内容', review:'审核公开内容', 'review-download':'下载公开原文件', 'converter-config':'修改转换配置', 'converter-token-reset':'重置转换令牌', 'converter-test':'转换测试', 'release-create':'发布新版本', 'release-update':'修改发布', 'release-delete':'删除发布', 'release-asset-upload':'上传安装包' };
async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try { await task(); } catch (e) { error.value = e instanceof Error ? e.message : '操作失败'; DialogPlugin.alert({ header: '操作未完成', body: error.value, confirmBtn: '知道了' }); } finally { busy.value = false; }
}
async function load() {
  const result = await callAdmin('overview');
  requiredOverviewSection(result, props.section);
  data.value = { ...result, ...(Array.isArray(result.users) ? { users: result.users.map((row: any) => ({ ...row, phone: maskPhone(row.phone) })) } : {}) };
}
const users = computed(() => sortUsers<any>((data.value?.users || []).filter((u: any) => `${u.phone} ${u.id}`.toLowerCase().includes(query.value.trim().toLowerCase()))));
const publications = computed<any[]>(() => filterPublications<any>(data.value?.publications || [], props.section, status.value, query.value));
const audits = computed(() => (data.value?.audit || []).filter((r: any) => (action.value === 'all' || r.action === action.value) && [r.user_id, data.value?.users?.find((u:any)=>u.id===r.user_id)?.phone, r.action, actions[r.action], r.detail, auditDetail(r), stamp(r.time)].join(' ').toLowerCase().includes(query.value.trim().toLowerCase())));
const auditOptions = computed(() => [{ label:'全部动作', value:'all' }, ...Array.from(new Set<string>((data.value?.audit || []).map((r: any) => r.action))).map(value => ({ value, label: actions[value] || value }))]);
const stamp = (value: unknown) => value ? new Date(Number(value)).toLocaleString('zh-CN', { hour12:false }) : '—';
const size = (value: number) => (value / 1000000).toFixed(2);
const userColumns = [{colKey:'phone',title:'手机号'}, {colKey:'id',title:'账号标识',ellipsis:true}, {colKey:'enabled',title:'云空间'}, {colKey:'autosave',title:'自动保存'}, {colKey:'created',title:'注册时间'}, {colKey:'lastAction',title:'最后一次操作'}, {colKey:'used',title:'实际占用'}];
const auditColumns = [{colKey:'time',title:'时间'}, {colKey:'user_id',title:'操作账号'}, {colKey:'action',title:'动作'}, {colKey:'detail',title:'记录',ellipsis:true}];
async function openReview(id: string) { const request = ++reviewEpoch, owner = readAdminToken(); await run(async () => { const detail = await callAdmin('publications/' + encodeURIComponent(id)); const item = data.value?.publications.find((row: any) => row.id === id); if (!item) throw new Error('所选公开资料已不存在，请刷新列表'); if (request === reviewEpoch && owner === readAdminToken()) review.value = mergeReview(item, detail); }); }
async function decide(next: string) { await run(async () => { await callAdmin('publications/' + encodeURIComponent(review.value.id), 'PATCH', { status: next }); review.value = null; await load(); }); }
function confirmWithdraw() { const dialog = DialogPlugin.confirm({ header: '确认下架公开资料', body: '下架会清除该公开资料的原文件，操作后无法从后台恢复。确定继续吗？', confirmBtn: '确认下架', cancelBtn: '取消', onConfirm: () => { dialog.destroy(); void decide('withdrawn'); }, onCancel: () => dialog.destroy() }); }
async function download() { await run(async () => {
  const response = await fetch('/api/v1/admin/publications/' + encodeURIComponent(review.value.id) + '/download', { headers: { Authorization: 'Bearer ' + readAdminToken() } });
  if (response.status === 401) expireSession();
  if (!response.ok) throw new Error('公开原文件下载失败');
  const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = review.value.name || review.value.title; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}); }
onMounted(() => void run(load));
onUnmounted(() => { reviewEpoch++; review.value = null; });
</script>

<template>
  <main class="seal-page">
    <header class="seal-heading"><div><h1>{{ titles[section]?.[0] }}</h1><p>{{ titles[section]?.[1] }}</p></div><t-button variant="outline" :loading="busy" @click="run(load)">刷新数据</t-button></header>
    <OverviewDashboard v-if="data && section === 'overview'" :data="data" />
    <t-card v-else-if="data && section === 'users'" title="用户列表"><t-input v-model="query" clearable placeholder="搜索号码片段或账号标识" class="seal-search"/><t-table :key="query" row-key="id" :data="users" :columns="userColumns" :pagination="{ defaultCurrent: 1, defaultPageSize: 20, total: users.length }" :loading="busy"><template #enabled="{row}">{{ row.enabled ? '已开通' : '关闭' }}</template><template #autosave="{row}">{{ row.autosave ? '开启' : '关闭' }}</template><template #created="{row}">{{ stamp(row.created) }}</template><template #lastAction="{row}">{{ stamp(row.lastAction) }}</template><template #used="{row}">{{ size(row.used) }} MB</template></t-table></t-card>
    <t-card v-else-if="data && section === 'audit'" title="最近操作记录"><div class="seal-toolbar"><t-input v-model="query" clearable placeholder="搜索账号、动作或记录" class="seal-search"/><t-select v-model="action" :options="auditOptions" class="seal-select"/></div><t-table :key="query+'|'+action" row-key="id" :data="audits" :columns="auditColumns" :pagination="{defaultCurrent:1,defaultPageSize:20,total:audits.length}"><template #time="{row}">{{ stamp(row.time) }}</template><template #action="{row}">{{ actions[row.action] || row.action }}</template><template #detail="{row}">{{ auditDetail(row) }}</template><template #user_id="{row}">{{ row.user_id === 'admin' ? '管理员' : (data.users?.find((u:any) => u.id === row.user_id)?.phone || row.user_id) }}</template></t-table></t-card>
    <t-card v-else-if="data" title="公开内容审核"><div class="seal-toolbar"><t-input v-model="query" clearable placeholder="搜索标题、分类或说明" class="seal-search"/><div class="seal-segments" role="tablist" aria-label="审核状态"><button v-for="tab in statusTabs" :key="tab.value" type="button" role="tab" :aria-selected="status===tab.value" :class="{active:status===tab.value}" @click="status=tab.value">{{tab.label}} <span>{{tab.count}}</span></button></div></div><div v-if="!publications.length" class="seal-empty">暂无匹配的公开内容</div><div v-else class="seal-publications"><t-card v-for="item in publications" :key="item.id" :title="item.title"><p>{{ item.category || '未分类' }} · {{ labels[item.status] || item.status }}</p><t-button variant="outline" :disabled="busy" @click="openReview(item.id)">查看资料并审核</t-button></t-card></div></t-card>
    <t-dialog :visible="Boolean(review)" header="公开内容审核" :footer="false" width="800px" :close-on-overlay-click="false" @close="review=null"><template v-if="review"><h2>{{ review.title }}</h2><p>状态：{{ labels[review.status] || review.status }}</p><p>仅显示用户主动发布的公开资料，请检查原文件后决定是否发布。</p><t-button variant="outline" :disabled="busy || review.status === 'withdrawn'" @click="download">下载公开原文件检查</t-button><pre>{{ review.text || '暂无文字预览，请下载公开文件检查。' }}</pre><div v-if="userStore.hasPermission(section+':review')" class="seal-toolbar"><t-button theme="primary" :disabled="busy || ['withdrawn','approved'].includes(review.status)" @click="decide('approved')">通过并公开</t-button><t-button theme="warning" :disabled="busy || ['withdrawn','rejected'].includes(review.status)" @click="decide('rejected')">拒绝发布</t-button><t-button theme="danger" :disabled="busy || review.status === 'withdrawn'" @click="confirmWithdraw">下架</t-button></div></template></t-dialog>
  </main>
</template>

<style scoped>
.seal-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:20px}.seal-heading h1{font-size:22px;margin:0}.seal-heading p{color:var(--tl-text-3);margin:8px 0 0}.seal-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.seal-stats strong{font-size:28px}.seal-stats p{color:var(--tl-text-3)}.seal-columns{display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-top:16px}.seal-toolbar{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 16px}.seal-segments{display:flex;gap:4px;flex-wrap:wrap}.seal-segments button{border:0;padding:8px;background:var(--tl-surface-2);color:var(--tl-text-1);cursor:pointer}.seal-segments button.active{color:var(--td-brand-color-10);background:var(--td-brand-color-2)}.seal-segments span{font-size:12px}.seal-search{max-width:320px}.seal-select{width:160px}.seal-publications{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}.seal-empty{padding:48px;text-align:center;color:var(--tl-text-3)}pre{white-space:pre-wrap;max-height:40vh;overflow:auto;padding:16px;background:var(--tl-bg);overflow-wrap:anywhere}@media(max-width:720px){.seal-stats,.seal-columns{grid-template-columns:1fr}.seal-heading{flex-wrap:wrap}}
</style>
