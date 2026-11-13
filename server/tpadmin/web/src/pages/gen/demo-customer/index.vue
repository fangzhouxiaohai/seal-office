<!--
  演示客户管理(代码生成器生成)。
  Author: qiufeng(代码生成器)
-->
<template>
  <table-plus ref="tableRef" :columns="columns" :fetcher="listDemoCustomers" :query="query">

    <template #search>
      <t-input v-model="query.name" placeholder="客户名称" clearable />
      <t-input v-model="query.contact" placeholder="联系人" clearable />
      <t-input v-model="query.mobile" placeholder="手机号" clearable />
      <t-input v-model="query.source" placeholder="客户来源" clearable />
      <t-date-range-picker
        :value="query.next_follow_time_start ? [Number(query.next_follow_time_start) * 1000, Number(query.next_follow_time_end) * 1000] : []"
        value-type="time-stamp"
        clearable
        :placeholder="['下次跟进起', '下次跟进止']"
        @change="(v: unknown) => {
          const [start, end] = (v as number[]) ?? [];
          query.next_follow_time_start = start ? String(Math.floor(start / 1000)) : '';
          query.next_follow_time_end = end ? String(Math.floor(end / 1000) + 86399) : '';
        }"
      />
      <t-select v-model="query.status" placeholder="状态" clearable>
        <t-option label="启用" :value="1" />
        <t-option label="禁用" :value="0" />
      </t-select>
    </template>

    <template #toolbar>
      <t-button v-permission="'demo-customer:create'" theme="primary" @click="openCreate">
        <template #icon><add-icon /></template>新增演示客户
      </t-button>
    </template>

    <template #next_follow_time="{ row }">{{ formatDate(row.next_follow_time) }}</template>
    <template #status="{ row }">
      <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light">
        {{ row.status === 1 ? '启用' : '禁用' }}
      </t-tag>
    </template>
    <template #create_time="{ row }">{{ formatDate(row.create_time) }}</template>

    <template #op="{ row }">
      <t-space size="12px">
        <t-link v-permission="'demo-customer:update'" theme="primary" @click="openEdit(row)">编辑</t-link>
        <t-popconfirm content="确定删除吗?" theme="danger" @confirm="onDelete(row)">
          <t-link v-permission="'demo-customer:delete'" theme="danger">删除</t-link>
        </t-popconfirm>
      </t-space>
    </template>
  </table-plus>

  <form-dialog v-model:visible="dialogVisible" :title="form.id ? '编辑演示客户' : '新增演示客户'" :on-submit="save">
    <t-form ref="formRef" :data="form" label-width="90px">
      <t-form-item label="客户名称" name="name">
        <t-input v-model="form.name" placeholder="请输入客户名称" />
      </t-form-item>
      <t-form-item label="联系人" name="contact">
        <t-input v-model="form.contact" placeholder="请输入联系人" />
      </t-form-item>
      <t-form-item label="手机号" name="mobile">
        <t-input v-model="form.mobile" placeholder="请输入手机号" />
      </t-form-item>
      <t-form-item label="客户来源" name="source">
        <t-input v-model="form.source" placeholder="请输入客户来源" />
      </t-form-item>
      <t-form-item label="客户等级" name="level">
        <t-input-number v-model="form.level" />
      </t-form-item>
      <t-form-item label="下次跟进" name="next_follow_time">
        <t-date-picker
          :value="form.next_follow_time ? form.next_follow_time * 1000 : undefined"
          enable-time-picker
          value-type="time-stamp"
          clearable
          placeholder="请选择下次跟进"
          @change="(v: unknown) => (form.next_follow_time = v ? Math.floor(Number(v) / 1000) : 0)"
        />
      </t-form-item>
      <t-form-item label="状态" name="status">
        <t-radio-group v-model="form.status">
          <t-radio :value="1">启用</t-radio>
          <t-radio :value="0">禁用</t-radio>
        </t-radio-group>
      </t-form-item>
      <t-form-item label="备注" name="remark">
        <t-textarea v-model="form.remark" placeholder="请输入备注" />
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
  listDemoCustomers, getDemoCustomer, createDemoCustomer, updateDemoCustomer, deleteDemoCustomer,
  type DemoCustomerItem, type DemoCustomerForm,
} from '@/api/gen/demo_customer';
import { formatDate } from '@/utils/date';

const tableRef = ref<TablePlusExpose>();
const query = reactive({ name: '', contact: '', mobile: '', source: '', next_follow_time_start: '', next_follow_time_end: '', status: '' as string | number, });

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'name', title: '客户名称', width: 140 },
  { colKey: 'contact', title: '联系人', width: 140 },
  { colKey: 'mobile', title: '手机号', width: 140 },
  { colKey: 'source', title: '客户来源', width: 140 },
  { colKey: 'level', title: '客户等级', width: 140 },
  { colKey: 'next_follow_time', title: '下次跟进', width: 140 },
  { colKey: 'status', title: '状态', width: 140 },
  { colKey: 'create_time', title: '创建时间', width: 140 },
  { colKey: 'op', title: '操作', width: 120, fixed: 'right' as const },
];

const dialogVisible = ref(false);
const formRef = ref<FormInstanceFunctions>();

const emptyForm = (): DemoCustomerForm => ({ name: '', contact: '', mobile: '', source: '', level: 0, next_follow_time: 0, status: 1, remark: '', });
const form = reactive<DemoCustomerForm>(emptyForm());

function openCreate(): void {
  Object.assign(form, emptyForm(), { id: undefined });
  dialogVisible.value = true;
}

// 列表只返回展示字段,编辑时按 ID 拉取完整详情再回填表单
async function openEdit(row: DemoCustomerItem): Promise<void> {
  const detail = await getDemoCustomer(row.id);
  Object.assign(form, emptyForm(), {
    id: detail.id,
    name: detail.name,
    contact: detail.contact,
    mobile: detail.mobile,
    source: detail.source,
    level: detail.level,
    next_follow_time: detail.next_follow_time,
    status: detail.status,
    remark: detail.remark,
  });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if (form.id) {
    await updateDemoCustomer(form.id, { ...form });
    MessagePlugin.success('更新成功');
  } else {
    await createDemoCustomer({ ...form });
    MessagePlugin.success('创建成功');
  }
  tableRef.value?.refresh();
}

async function onDelete(row: DemoCustomerItem): Promise<void> {
  await deleteDemoCustomer(row.id);
  MessagePlugin.success('删除成功');
  tableRef.value?.refresh();
}
</script>
