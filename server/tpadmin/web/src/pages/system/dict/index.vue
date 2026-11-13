<!--
  字典管理:字典类型列表 + 行内打开"字典数据"弹窗管理该类型下的字典项。
  Author: qiufeng
-->
<template>
  <table-plus ref="tableRef" :columns="columns" :fetcher="listDictTypes" :query="query">
    <template #search>
      <t-input v-model="query.name" placeholder="字典名称" clearable />
      <t-input v-model="query.code" placeholder="字典编码" clearable />
    </template>

    <template #toolbar>
      <t-button v-permission="'system:dict:create'" theme="primary" @click="openCreate">
        <template #icon><add-icon /></template>新增字典类型
      </t-button>
    </template>

    <template #code="{ row }">
      <t-link theme="primary" @click="openData(row)">{{ row.code }}</t-link>
    </template>

    <template #status="{ row }">
      <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light">
        {{ row.status === 1 ? '启用' : '禁用' }}
      </t-tag>
    </template>

    <template #op="{ row }">
      <t-space size="12px">
        <t-link theme="primary" @click="openData(row)">字典数据</t-link>
        <t-link v-permission="'system:dict:update'" theme="primary" @click="openEdit(row)">编辑</t-link>
        <t-popconfirm content="确定删除该字典类型吗?" theme="danger" @confirm="onDelete(row)">
          <t-link v-permission="'system:dict:delete'" theme="danger">删除</t-link>
        </t-popconfirm>
      </t-space>
    </template>
  </table-plus>

  <!-- 类型新增/编辑 -->
  <form-dialog v-model:visible="dialogVisible" :title="form.id ? '编辑字典类型' : '新增字典类型'" :on-submit="save">
    <t-form ref="formRef" :data="form" :rules="rules" label-width="90px">
      <t-form-item label="字典名称" name="name">
        <t-input v-model="form.name" placeholder="如 系统状态" />
      </t-form-item>
      <t-form-item label="字典编码" name="code">
        <t-input v-model="form.code" placeholder="唯一编码,如 sys_status" :disabled="!!form.id" />
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

  <!-- 字典数据管理 -->
  <t-dialog
    v-model:visible="dataVisible"
    :header="`字典数据:${currentType?.name ?? ''}(${currentType?.code ?? ''})`"
    width="760px"
    :footer="false"
  >
    <div class="data-toolbar">
      <t-button v-permission="'system:dict:create'" theme="primary" size="small" @click="openDataCreate">
        <template #icon><add-icon /></template>新增字典项
      </t-button>
    </div>
    <t-table row-key="id" :data="dataList" :columns="dataColumns" :loading="dataLoading" size="small" max-height="420">
      <template #status="{ row }">
        <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light" size="small">
          {{ row.status === 1 ? '启用' : '禁用' }}
        </t-tag>
      </template>
      <template #op="{ row }">
        <t-space size="12px">
          <t-link v-permission="'system:dict:update'" theme="primary" @click="openDataEdit(row)">编辑</t-link>
          <t-popconfirm content="确定删除该字典项吗?" theme="danger" @confirm="onDataDelete(row)">
            <t-link v-permission="'system:dict:delete'" theme="danger">删除</t-link>
          </t-popconfirm>
        </t-space>
      </template>
    </t-table>
  </t-dialog>

  <!-- 字典项新增/编辑 -->
  <form-dialog v-model:visible="dataFormVisible" :title="dataForm.id ? '编辑字典项' : '新增字典项'" :on-submit="saveData" width="480px">
    <t-form ref="dataFormRef" :data="dataForm" :rules="dataRules" label-width="80px">
      <t-form-item label="标签" name="label">
        <t-input v-model="dataForm.label" placeholder="显示文本,如 启用" />
      </t-form-item>
      <t-form-item label="键值" name="value">
        <t-input v-model="dataForm.value" placeholder="实际值,如 1" />
      </t-form-item>
      <t-form-item label="排序" name="sort">
        <t-input-number v-model="dataForm.sort" :min="0" />
      </t-form-item>
      <t-form-item label="状态" name="status">
        <t-radio-group v-model="dataForm.status">
          <t-radio :value="1">启用</t-radio>
          <t-radio :value="0">禁用</t-radio>
        </t-radio-group>
      </t-form-item>
      <t-form-item label="备注" name="remark">
        <t-textarea v-model="dataForm.remark" placeholder="选填" />
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
import {
  listDictTypes, createDictType, updateDictType, deleteDictType,
  listDictData, createDictData, updateDictData, deleteDictData,
  type DictType, type DictTypeForm, type DictData, type DictDataForm,
} from '@/api/system/dict';

const tableRef = ref<TablePlusExpose>();
const query = reactive({ name: '', code: '' });

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'name', title: '名称', width: 160 },
  { colKey: 'code', title: '编码', width: 180 },
  { colKey: 'status', title: '状态', width: 90 },
  { colKey: 'remark', title: '备注' },
  { colKey: 'op', title: '操作', width: 200, fixed: 'right' as const },
];

// ---- 类型 CRUD ----
const dialogVisible = ref(false);
const formRef = ref<FormInstanceFunctions>();

const emptyForm = (): DictTypeForm => ({ name: '', code: '', status: 1, remark: '' });
const form = reactive<DictTypeForm>(emptyForm());

const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入字典名称' }],
  code: [{ required: true, message: '请输入字典编码' }],
};

function openCreate(): void {
  Object.assign(form, emptyForm(), { id: undefined });
  dialogVisible.value = true;
}

function openEdit(row: DictType): void {
  Object.assign(form, emptyForm(), { id: row.id, name: row.name, code: row.code, status: row.status, remark: row.remark });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if ((await formRef.value?.validate()) !== true) return Promise.reject();
  if (form.id) {
    await updateDictType(form.id, { ...form });
    MessagePlugin.success('更新成功');
  } else {
    await createDictType({ ...form });
    MessagePlugin.success('创建成功');
  }
  tableRef.value?.refresh();
}

async function onDelete(row: DictType): Promise<void> {
  await deleteDictType(row.id);
  MessagePlugin.success('删除成功');
  tableRef.value?.refresh();
}

// ---- 字典数据 ----
const dataVisible = ref(false);
const dataLoading = ref(false);
const currentType = ref<DictType | null>(null);
const dataList = ref<DictData[]>([]);

const dataColumns = [
  { colKey: 'label', title: '标签', width: 140 },
  { colKey: 'value', title: '键值', width: 120 },
  { colKey: 'sort', title: '排序', width: 70 },
  { colKey: 'status', title: '状态', width: 80 },
  { colKey: 'remark', title: '备注' },
  { colKey: 'op', title: '操作', width: 120 },
];

async function loadData(): Promise<void> {
  if (!currentType.value) return;
  dataLoading.value = true;
  try {
    const result = await listDictData({ type_code: currentType.value.code, page: 1, page_size: 100 });
    dataList.value = result.list;
  } finally {
    dataLoading.value = false;
  }
}

function openData(row: DictType): void {
  currentType.value = row;
  dataVisible.value = true;
  loadData();
}

// ---- 字典项 CRUD ----
const dataFormVisible = ref(false);
const dataFormRef = ref<FormInstanceFunctions>();

const emptyDataForm = (): DictDataForm => ({ type_code: '', label: '', value: '', sort: 0, status: 1, remark: '' });
const dataForm = reactive<DictDataForm>(emptyDataForm());

const dataRules: FormProps['rules'] = {
  label: [{ required: true, message: '请输入标签' }],
  value: [{ required: true, message: '请输入键值' }],
};

function openDataCreate(): void {
  Object.assign(dataForm, emptyDataForm(), { id: undefined, type_code: currentType.value?.code ?? '' });
  dataFormVisible.value = true;
}

function openDataEdit(row: DictData): void {
  Object.assign(dataForm, emptyDataForm(), {
    id: row.id, type_code: row.type_code, label: row.label, value: row.value,
    sort: row.sort, status: row.status, remark: row.remark,
  });
  dataFormVisible.value = true;
}

async function saveData(): Promise<void> {
  if ((await dataFormRef.value?.validate()) !== true) return Promise.reject();
  if (dataForm.id) {
    await updateDictData(dataForm.id, { ...dataForm });
    MessagePlugin.success('更新成功');
  } else {
    await createDictData({ ...dataForm });
    MessagePlugin.success('创建成功');
  }
  await loadData();
}

async function onDataDelete(row: DictData): Promise<void> {
  await deleteDictData(row.id);
  MessagePlugin.success('删除成功');
  await loadData();
}
</script>

<style scoped>
.data-toolbar {
  margin-bottom: 12px;
}
</style>
