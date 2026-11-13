<!--
  管理员管理:列表筛选 + 新增/编辑(分配角色/部门/岗位)+ 删除 + 重置密码 + 重置动态码。
  Author: qiufeng
-->
<template>
  <table-plus ref="tableRef" :columns="columns" :fetcher="listUsers" :query="query">
    <template #search>
      <t-input v-model="query.username" placeholder="账号" clearable />
      <t-input v-model="query.nickname" placeholder="昵称" clearable />
      <t-select v-model="query.status" placeholder="状态" clearable>
        <t-option label="启用" :value="1" />
        <t-option label="禁用" :value="0" />
      </t-select>
    </template>

    <template #toolbar>
      <t-button v-permission="'system:user:create'" theme="primary" @click="openCreate">
        <template #icon><add-icon /></template>新增管理员
      </t-button>
    </template>

    <template #roles="{ row }">
      <t-space size="4px" break-line>
        <t-tag v-for="role in row.roles" :key="role.id" theme="primary" variant="light" size="small">
          {{ role.name }}
        </t-tag>
        <t-tag v-if="row.is_super" theme="danger" variant="light" size="small">超管</t-tag>
      </t-space>
    </template>

    <template #status="{ row }">
      <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light">
        {{ row.status === 1 ? '启用' : '禁用' }}
      </t-tag>
    </template>

    <template #last_login_time="{ row }">{{ formatDate(row.last_login_time) }}</template>

    <template #op="{ row }">
      <t-space size="12px">
        <t-link v-permission="'system:user:update'" theme="primary" @click="openEdit(row)">编辑</t-link>
        <t-link v-permission="'system:user:reset-password'" theme="warning" @click="openResetPassword(row)">重置密码</t-link>
        <t-popconfirm content="确定重置该账号的动态验证码绑定吗?" @confirm="onResetTotp(row)">
          <t-link v-permission="'system:user:update'" theme="warning">重置动态码</t-link>
        </t-popconfirm>
        <t-popconfirm content="确定删除该管理员吗?" theme="danger" @confirm="onDelete(row)">
          <t-link v-permission="'system:user:delete'" theme="danger">删除</t-link>
        </t-popconfirm>
      </t-space>
    </template>
  </table-plus>

  <!-- 新增/编辑弹窗 -->
  <form-dialog v-model:visible="dialogVisible" :title="form.id ? '编辑管理员' : '新增管理员'" :on-submit="save">
    <t-form ref="formRef" :data="form" :rules="rules" label-width="80px">
      <t-form-item v-if="!form.id" label="账号" name="username">
        <t-input v-model="form.username" placeholder="登录账号,至少 3 位" />
      </t-form-item>
      <t-form-item v-if="!form.id" label="密码" name="password">
        <t-input v-model="form.password" type="password" placeholder="至少 8 位" />
      </t-form-item>
      <t-form-item label="昵称" name="nickname">
        <t-input v-model="form.nickname" placeholder="显示名称" />
      </t-form-item>
      <t-form-item label="角色" name="role_ids">
        <t-select v-model="form.role_ids" multiple placeholder="分配角色" clearable>
          <t-option v-for="role in roleOptions" :key="role.id" :label="role.name" :value="role.id" />
        </t-select>
      </t-form-item>
      <t-form-item label="部门" name="dept_id">
        <t-tree-select
          v-model="form.dept_id"
          :data="deptOptions"
          :tree-props="{ keys: { value: 'id', label: 'name', children: 'children' } }"
          placeholder="所属部门"
          clearable
        />
      </t-form-item>
      <t-form-item v-if="postOptions.length" label="岗位" name="post_ids">
        <t-select v-model="form.post_ids" multiple placeholder="所属岗位" clearable>
          <t-option v-for="post in postOptions" :key="post.id" :label="post.name" :value="post.id" />
        </t-select>
      </t-form-item>
      <t-form-item label="手机号" name="mobile">
        <t-input v-model="form.mobile" placeholder="选填" />
      </t-form-item>
      <t-form-item label="邮箱" name="email">
        <t-input v-model="form.email" placeholder="选填" />
      </t-form-item>
      <t-form-item label="状态" name="status">
        <t-radio-group v-model="form.status">
          <t-radio :value="1">启用</t-radio>
          <t-radio :value="0">禁用</t-radio>
        </t-radio-group>
      </t-form-item>
      <t-form-item label="备注" name="remark">
        <t-textarea v-model="form.remark" placeholder="选填" />
      </t-form-item>
    </t-form>
  </form-dialog>

  <!-- 重置密码弹窗 -->
  <form-dialog v-model:visible="resetVisible" :title="`重置密码:${resetTarget?.username ?? ''}`" :on-submit="doResetPassword" width="420px">
    <t-form ref="resetFormRef" :data="resetForm" :rules="resetRules" label-width="80px">
      <t-form-item label="新密码" name="password">
        <t-input v-model="resetForm.password" type="password" placeholder="至少 8 位,重置后该账号强制下线" />
      </t-form-item>
    </t-form>
  </form-dialog>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { MessagePlugin, type FormInstanceFunctions, type FormProps } from 'tdesign-vue-next';
import { AddIcon } from 'tdesign-icons-vue-next';
import TablePlus, { type TablePlusExpose } from '@/components/TablePlus.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  listUsers, getUser, createUser, updateUser, deleteUser, resetUserPassword, resetUserTotp,
  type AdminUserItem, type AdminUserForm,
} from '@/api/system/user';
import { listAllRoles } from '@/api/system/role';
import { listDepts, type DeptNode } from '@/api/system/dept';
import { listAllPosts } from '@/api/system/post';
import { formatDate } from '@/utils/date';

const tableRef = ref<TablePlusExpose>();
const query = reactive({ username: '', nickname: '', status: '' as string | number });

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'username', title: '账号', width: 120 },
  { colKey: 'nickname', title: '昵称', width: 120 },
  { colKey: 'roles', title: '角色', width: 180 },
  { colKey: 'dept_name', title: '部门', width: 110 },
  { colKey: 'status', title: '状态', width: 80 },
  { colKey: 'last_login_time', title: '最后登录', width: 170 },
  { colKey: 'op', title: '操作', width: 300, fixed: 'right' as const },
];

// ---- 下拉数据 ----
const roleOptions = ref<{ id: number; name: string }[]>([]);
const deptOptions = ref<DeptNode[]>([]);
const postOptions = ref<{ id: number; name: string }[]>([]);

onMounted(async () => {
  [roleOptions.value, deptOptions.value, postOptions.value] = await Promise.all([
    listAllRoles(),
    listDepts().catch(() => []),
    listAllPosts().catch(() => []),
  ]);
});

// ---- 新增/编辑 ----
const dialogVisible = ref(false);
const formRef = ref<FormInstanceFunctions>();

const emptyForm = (): AdminUserForm => ({
  username: '', password: '', nickname: '', email: '', mobile: '',
  dept_id: undefined, status: 1, remark: '', role_ids: [], post_ids: [],
});
const form = reactive<AdminUserForm>(emptyForm());

const rules: FormProps['rules'] = {
  username: [
    { required: true, message: '请输入账号' },
    { min: 3, message: '账号至少 3 位' },
  ],
  password: [
    { required: true, message: '请输入密码' },
    { min: 8, message: '密码至少 8 位' },
  ],
  nickname: [{ required: true, message: '请输入昵称' }],
};

function openCreate(): void {
  Object.assign(form, emptyForm(), { id: undefined });
  dialogVisible.value = true;
}

async function openEdit(row: AdminUserItem): Promise<void> {
  const detail = await getUser(row.id);
  Object.assign(form, emptyForm(), {
    id: detail.id,
    nickname: detail.nickname,
    email: detail.email,
    mobile: detail.mobile,
    dept_id: detail.dept_id || undefined,
    status: detail.status,
    remark: detail.remark,
    role_ids: detail.role_ids,
    post_ids: detail.post_ids,
  });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if ((await formRef.value?.validate()) !== true) return Promise.reject();
  const payload = { ...form, dept_id: form.dept_id ?? 0 };
  if (form.id) {
    await updateUser(form.id, payload);
    MessagePlugin.success('更新成功');
  } else {
    await createUser(payload);
    MessagePlugin.success('创建成功');
  }
  tableRef.value?.refresh();
}

// ---- 删除 / 重置动态码 ----
async function onDelete(row: AdminUserItem): Promise<void> {
  await deleteUser(row.id);
  MessagePlugin.success('删除成功');
  tableRef.value?.refresh();
}

async function onResetTotp(row: AdminUserItem): Promise<void> {
  await resetUserTotp(row.id);
  MessagePlugin.success('已重置动态验证码绑定');
}

// ---- 重置密码 ----
const resetVisible = ref(false);
const resetTarget = ref<AdminUserItem | null>(null);
const resetFormRef = ref<FormInstanceFunctions>();
const resetForm = reactive({ password: '' });
const resetRules: FormProps['rules'] = {
  password: [
    { required: true, message: '请输入新密码' },
    { min: 8, message: '密码至少 8 位' },
  ],
};

function openResetPassword(row: AdminUserItem): void {
  resetTarget.value = row;
  resetForm.password = '';
  resetVisible.value = true;
}

async function doResetPassword(): Promise<void> {
  if ((await resetFormRef.value?.validate()) !== true) return Promise.reject();
  await resetUserPassword(resetTarget.value!.id, resetForm.password);
  MessagePlugin.success('密码已重置,该账号已强制下线');
}
</script>
