<!--
  会员管理:列表筛选 + 新增/编辑(资料/状态/余额/积分)+ 删除。面向 C 端会员,独立于管理员。
  Author: qiufeng
-->
<template>
  <table-plus ref="tableRef" :columns="columns" :fetcher="listMembers" :query="query">
    <template #search>
      <t-input v-model="query.keyword" placeholder="账号/昵称/手机号" clearable />
      <t-select v-model="query.status" placeholder="状态" clearable>
        <t-option label="正常" :value="1" />
        <t-option label="禁用" :value="0" />
      </t-select>
    </template>

    <template #toolbar>
      <t-button v-permission="'member:user:create'" theme="primary" @click="openCreate">
        <template #icon><add-icon /></template>新增会员
      </t-button>
    </template>

    <template #avatar="{ row }">
      <t-avatar :image="row.avatar || undefined" size="32px">{{ (row.nickname || row.username || '?').slice(0, 1) }}</t-avatar>
    </template>

    <template #gender="{ row }">{{ GENDER_LABELS[row.gender] ?? '未知' }}</template>

    <template #balance="{ row }">{{ formatMoney(row.balance, { fromFen: true }) }}</template>

    <template #status="{ row }">
      <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light">
        {{ row.status === 1 ? '正常' : '禁用' }}
      </t-tag>
    </template>

    <template #last_login_time="{ row }">{{ row.last_login_time ? formatDate(row.last_login_time) : '从未登录' }}</template>
    <template #create_time="{ row }">{{ formatDate(row.create_time) }}</template>

    <template #op="{ row }">
      <t-space size="12px">
        <t-link v-permission="'member:user:update'" theme="primary" @click="openEdit(row)">编辑</t-link>
        <t-popconfirm content="确定删除该会员吗?" theme="danger" @confirm="onDelete(row)">
          <t-link v-permission="'member:user:delete'" theme="danger">删除</t-link>
        </t-popconfirm>
      </t-space>
    </template>
  </table-plus>

  <form-dialog v-model:visible="dialogVisible" :title="form.id ? '编辑会员' : '新增会员'" :on-submit="save">
    <t-form ref="formRef" :data="form" :rules="rules" label-width="90px">
      <t-form-item label="账号" name="username">
        <t-input v-model="form.username" placeholder="会员登录账号(可选)" />
      </t-form-item>
      <t-form-item label="昵称" name="nickname">
        <t-input v-model="form.nickname" placeholder="会员昵称" />
      </t-form-item>
      <t-form-item label="手机号" name="mobile">
        <t-input v-model="form.mobile" placeholder="手机号" />
      </t-form-item>
      <t-form-item label="邮箱" name="email">
        <t-input v-model="form.email" placeholder="选填" />
      </t-form-item>
      <t-form-item label="性别" name="gender">
        <t-radio-group v-model="form.gender">
          <t-radio :value="0">未知</t-radio>
          <t-radio :value="1">男</t-radio>
          <t-radio :value="2">女</t-radio>
        </t-radio-group>
      </t-form-item>
      <t-form-item label="余额(元)" name="balanceYuan">
        <t-input-number v-model="balanceYuan" :min="0" :decimal-places="2" />
      </t-form-item>
      <t-form-item label="积分" name="points">
        <t-input-number v-model="form.points" :min="0" />
      </t-form-item>
      <t-form-item label="状态" name="status">
        <t-radio-group v-model="form.status">
          <t-radio :value="1">正常</t-radio>
          <t-radio :value="0">禁用</t-radio>
        </t-radio-group>
      </t-form-item>
      <t-form-item label="备注" name="remark">
        <t-textarea v-model="form.remark" placeholder="选填" />
      </t-form-item>
    </t-form>
  </form-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { MessagePlugin, type FormInstanceFunctions, type FormProps } from 'tdesign-vue-next';
import { AddIcon } from 'tdesign-icons-vue-next';
import TablePlus, { type TablePlusExpose } from '@/components/TablePlus.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  listMembers, getMember, createMember, updateMember, deleteMember,
  type MemberUser, type MemberUserForm,
} from '@/api/member/user';
import { formatDate } from '@/utils/date';
import { formatMoney, yuanToFen, fenToYuan } from '@/utils/money';

const GENDER_LABELS: Record<number, string> = { 0: '未知', 1: '男', 2: '女' };

const tableRef = ref<TablePlusExpose>();
const query = reactive({ keyword: '', status: '' as string | number });

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'avatar', title: '头像', width: 70 },
  { colKey: 'username', title: '账号', width: 110 },
  { colKey: 'nickname', title: '昵称', width: 110 },
  { colKey: 'mobile', title: '手机号', width: 130 },
  { colKey: 'gender', title: '性别', width: 70 },
  { colKey: 'balance', title: '余额', width: 100 },
  { colKey: 'points', title: '积分', width: 80 },
  { colKey: 'status', title: '状态', width: 80 },
  { colKey: 'last_login_time', title: '最后登录', width: 170 },
  { colKey: 'create_time', title: '注册时间', width: 170 },
  { colKey: 'op', title: '操作', width: 120, fixed: 'right' as const },
];

const dialogVisible = ref(false);
const formRef = ref<FormInstanceFunctions>();

const emptyForm = (): MemberUserForm => ({
  username: '', nickname: '', mobile: '', email: '', gender: 0, status: 1, balance: 0, points: 0, remark: '',
});
const form = reactive<MemberUserForm>(emptyForm());

// 余额以元为单位编辑,提交转分
const balanceYuan = computed({
  get: () => Number(fenToYuan(form.balance)),
  set: (v: number) => { form.balance = yuanToFen(v); },
});

const rules: FormProps['rules'] = {
  nickname: [{ required: true, message: '请输入会员昵称' }],
};

function openCreate(): void {
  Object.assign(form, emptyForm(), { id: undefined });
  dialogVisible.value = true;
}

async function openEdit(row: MemberUser): Promise<void> {
  const detail = await getMember(row.id);
  Object.assign(form, emptyForm(), {
    id: detail.id,
    username: detail.username,
    nickname: detail.nickname,
    mobile: detail.mobile,
    email: detail.email,
    gender: detail.gender,
    status: detail.status,
    balance: detail.balance,
    points: detail.points,
    remark: detail.remark,
  });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if ((await formRef.value?.validate()) !== true) return Promise.reject();
  if (form.id) {
    await updateMember(form.id, { ...form });
    MessagePlugin.success('更新成功');
  } else {
    await createMember({ ...form });
    MessagePlugin.success('创建成功');
  }
  tableRef.value?.refresh();
}

async function onDelete(row: MemberUser): Promise<void> {
  await deleteMember(row.id);
  MessagePlugin.success('删除成功');
  tableRef.value?.refresh();
}
</script>
