<!--
  演示公告管理(代码生成器生成)。
  Author: qiufeng(代码生成器)
-->
<template>
  <table-plus ref="tableRef" :columns="columns" :fetcher="listDemoNotices" :query="query">

    <template #search>
      <t-input v-model="query.title" placeholder="公告标题" clearable />
      <t-select v-model="query.is_top" placeholder="置顶" clearable>
        <t-option label="是" :value="1" />
        <t-option label="否" :value="0" />
      </t-select>
      <t-select v-model="query.status" placeholder="状态" clearable>
        <t-option label="启用" :value="1" />
        <t-option label="禁用" :value="0" />
      </t-select>
    </template>

    <template #toolbar>
      <t-button v-permission="'demo-notice:create'" theme="primary" @click="openCreate">
        <template #icon><add-icon /></template>新增演示公告
      </t-button>
    </template>

    <template #is_top="{ row }">
      <t-tag :theme="row.is_top === 1 ? 'success' : 'default'" variant="light">
        {{ row.is_top === 1 ? '是' : '否' }}
      </t-tag>
    </template>
    <template #start_time="{ row }">{{ formatDate(row.start_time) }}</template>
    <template #end_time="{ row }">{{ formatDate(row.end_time) }}</template>
    <template #status="{ row }">
      <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light">
        {{ row.status === 1 ? '启用' : '禁用' }}
      </t-tag>
    </template>
    <template #create_time="{ row }">{{ formatDate(row.create_time) }}</template>

    <template #op="{ row }">
      <t-space size="12px">
        <t-link v-permission="'demo-notice:update'" theme="primary" @click="openEdit(row)">编辑</t-link>
        <t-popconfirm content="确定删除吗?" theme="danger" @confirm="onDelete(row)">
          <t-link v-permission="'demo-notice:delete'" theme="danger">删除</t-link>
        </t-popconfirm>
      </t-space>
    </template>
  </table-plus>

  <form-dialog v-model:visible="dialogVisible" :title="form.id ? '编辑演示公告' : '新增演示公告'" :on-submit="save">
    <t-form ref="formRef" :data="form" label-width="90px">
      <t-form-item label="公告标题" name="title">
        <t-input v-model="form.title" placeholder="请输入公告标题" />
      </t-form-item>
      <t-form-item label="公告内容" name="content">
        <t-textarea v-model="form.content" placeholder="请输入公告内容" />
      </t-form-item>
      <t-form-item label="置顶" name="is_top">
        <t-radio-group v-model="form.is_top">
          <t-radio :value="1">是</t-radio>
          <t-radio :value="0">否</t-radio>
        </t-radio-group>
      </t-form-item>
      <t-form-item label="生效时间" name="start_time">
        <t-date-picker
          :value="form.start_time ? form.start_time * 1000 : undefined"
          enable-time-picker
          value-type="time-stamp"
          clearable
          placeholder="请选择生效时间"
          @change="(v: unknown) => (form.start_time = v ? Math.floor(Number(v) / 1000) : 0)"
        />
      </t-form-item>
      <t-form-item label="失效时间" name="end_time">
        <t-date-picker
          :value="form.end_time ? form.end_time * 1000 : undefined"
          enable-time-picker
          value-type="time-stamp"
          clearable
          placeholder="请选择失效时间"
          @change="(v: unknown) => (form.end_time = v ? Math.floor(Number(v) / 1000) : 0)"
        />
      </t-form-item>
      <t-form-item label="状态" name="status">
        <t-radio-group v-model="form.status">
          <t-radio :value="1">启用</t-radio>
          <t-radio :value="0">禁用</t-radio>
        </t-radio-group>
      </t-form-item>
    </t-form>
  </form-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { MessagePlugin, type FormInstanceFunctions } from 'tdesign-vue-next';
import { AddIcon } from 'tdesign-icons-vue-next';
import TablePlus, { type TablePlusExpose } from '@/components/TablePlus.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  listDemoNotices, getDemoNotice, createDemoNotice, updateDemoNotice, deleteDemoNotice,
  type DemoNoticeItem, type DemoNoticeForm,
} from '@/api/gen/demo_notice';
import { formatDate } from '@/utils/date';

const tableRef = ref<TablePlusExpose>();
const query = reactive({ title: '', is_top: '' as string | number, status: '' as string | number, });

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'title', title: '公告标题', width: 140 },
  { colKey: 'is_top', title: '置顶', width: 140 },
  { colKey: 'start_time', title: '生效时间', width: 140 },
  { colKey: 'end_time', title: '失效时间', width: 140 },
  { colKey: 'status', title: '状态', width: 140 },
  { colKey: 'create_time', title: '创建时间', width: 140 },
  { colKey: 'op', title: '操作', width: 120, fixed: 'right' as const },
];

const dialogVisible = ref(false);
const formRef = ref<FormInstanceFunctions>();

const emptyForm = (): DemoNoticeForm => ({ title: '', content: '', is_top: 0, start_time: 0, end_time: 0, status: 1, });
const form = reactive<DemoNoticeForm>(emptyForm());

function openCreate(): void {
  Object.assign(form, emptyForm(), { id: undefined });
  dialogVisible.value = true;
}

// 列表只返回展示字段,编辑时按 ID 拉取完整详情再回填表单
async function openEdit(row: DemoNoticeItem): Promise<void> {
  const detail = await getDemoNotice(row.id);
  Object.assign(form, emptyForm(), {
    id: detail.id,
    title: detail.title,
    content: detail.content,
    is_top: detail.is_top,
    start_time: detail.start_time,
    end_time: detail.end_time,
    status: detail.status,
  });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if (form.id) {
    await updateDemoNotice(form.id, { ...form });
    MessagePlugin.success('更新成功');
  } else {
    await createDemoNotice({ ...form });
    MessagePlugin.success('创建成功');
  }
  tableRef.value?.refresh();
}

async function onDelete(row: DemoNoticeItem): Promise<void> {
  await deleteDemoNotice(row.id);
  MessagePlugin.success('删除成功');
  tableRef.value?.refresh();
}
</script>
