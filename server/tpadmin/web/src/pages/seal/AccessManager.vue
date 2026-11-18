<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import { useUserStore } from '@/stores/user';
import { callAdmin } from '@/utils/sealApi';
import { adminPayload, rolePayload, menuPayload, permissions, canEditAdmin } from './accessModel';

type Scope = 'admins' | 'roles' | 'menus';
interface Admin {id:string;username:string;enabled:boolean;roleIds:string[];roleNames:string[];created:number}
interface Role {id:string;name:string;permissions:string[];created:number}
interface Menu {key:string;title:string;path:string;visible:boolean;enabled:boolean;sort:number;readPermission:string}
const props = defineProps<{scope:Scope}>();
const user = useUserStore();
const titles: Record<Scope,[string,string]> = {admins:['管理员管理','维护后台管理员及其角色'],roles:['角色管理','配置角色可使用的菜单和操作权限'],menus:['菜单管理','调整已支持菜单的名称、显示状态和顺序']};
const canWrite = computed(() => user.hasPermission(props.scope + ':write'));
const rows = ref<(Admin|Role|Menu)[]>([]), roles = ref<Role[]>([]), busy = ref(false), dialog = ref(false), editing = ref(''), query = ref('');
const candidates = ref<Menu[]>([]), candidate = ref('');
const admin = reactive({username:'',password:'',roleIds:[] as string[],enabled:true});
const role = reactive({name:'',permissions:[] as string[]});
const menu = reactive({title:'',visible:true,enabled:true,sort:0});
const columns = computed(() => props.scope === 'admins'
  ? [{colKey:'username',title:'账号'}, {colKey:'roles',title:'角色'}, {colKey:'enabled',title:'状态'}, {colKey:'created',title:'创建时间'}, {colKey:'op',title:'操作'}]
  : props.scope === 'roles' ? [{colKey:'name',title:'角色名称'}, {colKey:'permissions',title:'权限'}, {colKey:'created',title:'创建时间'}, {colKey:'op',title:'操作'}]
  : [{colKey:'title',title:'菜单名称'}, {colKey:'path',title:'路由'}, {colKey:'readPermission',title:'查看权限'}, {colKey:'visible',title:'导航显示'}, {colKey:'enabled',title:'启用状态'}, {colKey:'sort',title:'排序'}, {colKey:'op',title:'操作'}]);
const visibleRows = computed(() => {const text=query.value.trim().toLowerCase();return rows.value.filter(row => !text || JSON.stringify(row).toLowerCase().includes(text));});
const roleLabels = computed(() => roles.value.map(r => ({label:r.name,value:r.id})));
async function run(task:()=>Promise<void>) { if (busy.value) return; busy.value=true; try {await task()} catch(error){DialogPlugin.alert({header:'操作未完成',body:error instanceof Error ? error.message : '请求失败，请稍后重试',confirmBtn:'知道了'});} finally {busy.value=false;} }
async function load() {
  const response=await callAdmin('access/'+props.scope);
  if (!Array.isArray(response.items)) throw new Error('管理服务返回的数据不完整');
  rows.value=response.items;
  if (props.scope === 'admins' && (canWrite.value || user.hasPermission('roles:read'))) {const result=await callAdmin('access/roles');if (!Array.isArray(result.items)) throw new Error('角色列表返回的数据不完整');roles.value=result.items;}
}
function closeDialog(){dialog.value=false;admin.password='';}
function create(){void run(async()=>{editing.value='';Object.assign(admin,{username:'',password:'',roleIds:[],enabled:true});Object.assign(role,{name:'',permissions:[]});if(props.scope==='menus'){const result=await callAdmin('access/menu-candidates');if(!Array.isArray(result.items))throw new Error('菜单候选列表返回的数据不完整');candidates.value=result.items;candidate.value='';}dialog.value=true;});}
function edit(item: any){editing.value=props.scope==='menus'?item.key:item.id;admin.password='';if(props.scope==='admins')Object.assign(admin,{username:item.username,password:'',roleIds:[...item.roleIds],enabled:item.enabled});else if(props.scope==='roles')Object.assign(role,{name:item.name,permissions:[...item.permissions]});else Object.assign(menu,{title:item.title,visible:item.visible,enabled:item.enabled,sort:item.sort});dialog.value=true;}
async function save(){await run(async()=>{
  if (!canWrite.value) throw new Error('当前账号没有修改权限');
  if (props.scope==='menus' && !editing.value && !candidates.value.some(item=>item.key===candidate.value)) throw new Error('请选择可新增的系统业务页面');
  const payload = props.scope==='admins' ? adminPayload(admin,!!editing.value) : props.scope==='roles' ? rolePayload(role.name,role.permissions) : editing.value ? menuPayload(menu) : {key:candidate.value};
  const response=await callAdmin('access/'+props.scope+(editing.value?'/'+encodeURIComponent(editing.value):''),editing.value?'PATCH':'POST',payload);
  if (!response.item || typeof response.item !== 'object') throw new Error('管理服务未确认保存结果，请刷新后核对');
  closeDialog();await load();MessagePlugin.success('保存成功');
});}
function confirmDelete(item:any){const label=props.scope==='admins'?item.username:item.name;const confirm=DialogPlugin.confirm({header:'确认删除',body:`确定删除“${label}”吗？`,confirmBtn:'确认删除',cancelBtn:'取消',onCancel:()=>confirm.destroy(),onConfirm:()=>{confirm.destroy();void run(async()=>{const result=await callAdmin('access/'+props.scope+'/'+encodeURIComponent(item.id),'DELETE');if(result.deleted!==true)throw new Error('管理服务未确认删除结果');await load();MessagePlugin.success('删除成功');});}});}
onMounted(()=>void run(load));
</script>

<template>
  <main class="access-page"><header class="access-heading"><div><h1>{{titles[scope][0]}}</h1><p>{{titles[scope][1]}}</p></div><t-button variant="outline" :loading="busy" @click="run(load)">刷新数据</t-button></header>
    <t-card><div class="access-toolbar"><t-input v-model="query" clearable :placeholder="'搜索'+titles[scope][0]" class="access-search"/><t-button v-if="canWrite" theme="primary" @click="create">{{scope==='admins'?'新增管理员':scope==='roles'?'新增角色':'新增菜单'}}</t-button></div>
      <t-table :key="query" :row-key="scope==='menus'?'key':'id'" :data="visibleRows" :columns="columns" :loading="busy" :pagination="{defaultCurrent:1,defaultPageSize:20,total:visibleRows.length}">
        <template #username="{row}">{{row.username}} <t-tag v-if="row.builtin" variant="light" theme="primary">内置超管</t-tag></template>
        <template #roles="{row}">{{Array.isArray(row.roleNames) ? (row.roleNames.join('、') || '未分配角色') : row.roleIds.map((id:string)=>roles.find(r=>r.id===id)?.name || id).join('、') || '未分配角色'}}</template>
        <template #permissions="{row}">{{row.permissions.map((p:string)=>permissions.find(i=>i.value===p)?.label || p).join('、') || '未分配权限'}}</template>
        <template #enabled="{row}"><t-tag variant="light" :theme="row.enabled?'success':'danger'">{{row.enabled?'启用':'禁用'}}</t-tag></template>
        <template #visible="{row}"><t-tag variant="light" :theme="row.visible?'success':'default'">{{row.visible?'显示':'隐藏'}}</t-tag></template>
        <template #created="{row}">{{row.created ? new Date(row.created).toLocaleString('zh-CN',{hour12:false}) : '—'}}</template>
        <template #op="{row}"><t-space v-if="canWrite && (scope!=='admins' || canEditAdmin(row))"><t-button size="small" variant="text" theme="primary" @click="edit(row)">编辑</t-button><t-button v-if="scope!=='menus'" size="small" variant="text" theme="danger" @click="confirmDelete(row)">删除</t-button></t-space><span v-else>只读</span></template>
      </t-table>
    </t-card>
    <t-dialog :visible="dialog" :header="(editing?'编辑':'新增')+(scope==='admins'?'管理员':scope==='roles'?'角色':'菜单')" width="680px" :confirm-btn="{content:'保存',loading:busy,disabled:busy || (scope==='menus' && !editing && !candidate)}" :close-on-overlay-click="false" @confirm="save" @close="closeDialog" @cancel="closeDialog">
      <form v-if="scope==='admins'" class="access-form" @submit.prevent="save"><label>管理员账号<t-input v-model="admin.username" :disabled="!!editing" placeholder="请输入登录账号"/></label><label>{{editing?'重置密码（留空不修改）':'管理员密码'}}<t-input v-model="admin.password" type="password" autocomplete="new-password" placeholder="请输入密码"/></label><label>分配角色<t-select v-model="admin.roleIds" multiple clearable :options="roleLabels" placeholder="请选择角色"/></label><label>启用状态<t-switch v-model="admin.enabled"/></label></form>
      <form v-else-if="scope==='roles'" class="access-form" @submit.prevent="save"><label>角色名称<t-input v-model="role.name" placeholder="请输入角色名称"/></label><fieldset class="access-permissions"><legend>角色权限</legend><t-checkbox-group v-model="role.permissions"><t-checkbox v-for="permission in permissions" :key="permission.value" :value="permission.value" :disabled="!user.hasPermission(permission.value)">{{permission.label}}</t-checkbox></t-checkbox-group></fieldset></form>
      <form v-else-if="editing" class="access-form" @submit.prevent="save"><label>菜单名称<t-input v-model="menu.title" placeholder="请输入名称"/></label><label>导航显示<t-switch v-model="menu.visible" :disabled="['admins','roles','menus'].includes(editing)"/></label><label>启用菜单<t-switch v-model="menu.enabled" :disabled="['admins','roles','menus'].includes(editing)"/></label><label>排序<t-input-number v-model="menu.sort" :min="0"/></label><p>隐藏只影响导航；停用后对应业务接口也会被拒绝。系统管理入口不能隐藏或停用。路由和权限由系统定义。</p></form>
      <form v-else class="access-form" @submit.prevent="save"><p>仅可添加系统已注册但当前停用的业务页面，不能添加任意路由。</p><label v-if="candidates.length">选择业务页面<t-select v-model="candidate" :options="candidates.map(item=>({label:item.title,value:item.key}))" placeholder="请选择业务页面"/></label><p v-else>当前没有可新增的业务页面。</p></form>
    </t-dialog>
  </main>
</template>

<style scoped>
.access-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:20px}.access-heading h1{font-size:22px;margin:0}.access-heading p{color:var(--tl-text-3);margin:8px 0 0}.access-toolbar{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}.access-search{max-width:320px}.access-form{display:grid;gap:16px}.access-form>label{display:flex;flex-direction:column;gap:8px}.access-form>label :deep(.t-switch){align-self:flex-start}.access-permissions{padding:12px;border:1px solid var(--tl-line);border-radius:6px}.access-permissions :deep(.t-checkbox-group){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.access-form p{margin:0;color:var(--tl-text-3)}@media(max-width:720px){.access-heading{flex-wrap:wrap}.access-permissions :deep(.t-checkbox-group){grid-template-columns:1fr}}
</style>
