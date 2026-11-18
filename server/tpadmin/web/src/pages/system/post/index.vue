<!--
  岗位管理:分页列表 + 新增/编辑/删除。
  Author: qiufeng
-->
<template>
  <table-plus ref="tableRef" :columns="columns" :fetcher="listPosts" :query="query">
    <template #search>
      <t-input v-model="query.name" placeholder="岗位名称" clearable />
      <t-select v-model="query.status" placeholder="状态" clearable>
        <t-option label="启用" :value="1" />
        <t-option label="禁用" :value="0" />
      </t-select>
    </template>

    <template #toolbar>
      <t-button v-permission="'system:post:create'" theme="primary" @click="openCreate">
        <template #icon><add-icon /></template>新增岗位
      </t-button>
    </template>

    <template #status="{ row }">
      <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light">
        {{ row.status === 1 ? '启用' : '禁用' }}
      </t-tag>
    </template>

    <template #create_time="{ row }">{{ formatDate(row.create_time) }}</template>

    <template #op="{ row }">
      <t-space size="12px">
        <t-link v-permission="'system:post:update'" theme="primary" @click="openEdit(row)">编辑</t-link>
        <t-popconfirm content="确定删除该岗位吗?" theme="danger" @confirm="onDelete(row)">
          <t-link v-permission="'system:post:delete'" theme="danger">删除</t-link>
        </t-popconfirm>
      </t-space>
    </template>
  </table-plus>

  <form-dialog v-model:visible="dialogVisible" :title="form.id ? '编辑岗位' : '新增岗位'" :on-submit="save">
    <t-form ref="formRef" :data="form" :rules="rules" label-width="90px">
      <t-form-item label="岗位名称" name="name">
        <t-input v-model="form.name" placeholder="如 前端工程师" />
      </t-form-item>
      <t-form-item label="岗位编码" name="code">
        <t-input v-model="form.code" placeholder="唯一编码,如 fe_engineer" />
      </t-form-item>
      <t-form-item label="排序" name="sort">
        <t-input-number v-model="form.sort" :min="0" />
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
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { MessagePlugin, type FormInstanceFunctions, type FormProps } from 'tdesign-vue-next';
import { AddIcon } from 'tdesign-icons-vue-next';
import TablePlus, { type TablePlusExpose } from '@/components/TablePlus.vue';
import FormDialog from '@/components/FormDialog.vue';
import { listPosts, createPost, updatePost, deletePost, type PostItem, type PostForm } from '@/api/system/post';
import { formatDate } from '@/utils/date';

const tableRef = ref<TablePlusExpose>();
const query = reactive({ name: '', status: '' as string | number });

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'name', title: '名称', width: 160 },
  { colKey: 'code', title: '编码', width: 160 },
  { colKey: 'sort', title: '排序', width: 80 },
  { colKey: 'status', title: '状态', width: 90 },
  { colKey: 'remark', title: '备注' },
  { colKey: 'create_time', title: '创建时间', width: 170 },
  { colKey: 'op', title: '操作', width: 120, fixed: 'right' as const },
];

const dialogVisible = ref(false);
const formRef = ref<FormInstanceFunctions>();

const emptyForm = (): PostForm => ({ name: '', code: '', sort: 0, status: 1, remark: '' });
const form = reactive<PostForm>(emptyForm());

const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入岗位名称' }],
  code: [{ required: true, message: '请输入岗位编码' }],
};

function openCreate(): void {
  Object.assign(form, emptyForm(), { id: undefined });
  dialogVisible.value = true;
}

function openEdit(row: PostItem): void {
  Object.assign(form, emptyForm(), {
    id: row.id, name: row.name, code: row.code, sort: row.sort, status: row.status, remark: row.remark,
  });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if ((await formRef.value?.validate()) !== true) return Promise.reject();
  if (form.id) {
    await updatePost(form.id, { ...form });
    MessagePlugin.success('更新成功');
  } else {
    await createPost({ ...form });
    MessagePlugin.success('创建成功');
  }
  tableRef.value?.refresh();
}

async function onDelete(row: PostItem): Promise<void> {
  await deletePost(row.id);
  MessagePlugin.success('删除成功');
  tableRef.value?.refresh();
}
</script>
