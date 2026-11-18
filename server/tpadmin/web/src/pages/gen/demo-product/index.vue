<!--
  演示商品管理(代码生成器生成)。
  Author: qiufeng(代码生成器)
-->
<template>
  <table-plus ref="tableRef" :columns="columns" :fetcher="listDemoProducts" :query="query">

    <template #search>
      <t-input v-model="query.name" placeholder="商品名称" clearable />
      <t-select v-model="query.status" placeholder="状态" clearable>
        <t-option label="启用" :value="1" />
        <t-option label="禁用" :value="0" />
      </t-select>
    </template>

    <template #toolbar>
      <t-button v-permission="'demo-product:create'" theme="primary" @click="openCreate">
        <template #icon><add-icon /></template>新增演示商品
      </t-button>
    </template>

    <template #price="{ row }">{{ formatMoney(row.price, { fromFen: true }) }}</template>
    <template #status="{ row }">
      <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light">
        {{ row.status === 1 ? '启用' : '禁用' }}
      </t-tag>
    </template>
    <template #create_time="{ row }">{{ formatDate(row.create_time) }}</template>
    <template #update_time="{ row }">{{ formatDate(row.update_time) }}</template>

    <template #op="{ row }">
      <t-space size="12px">
        <t-link v-permission="'demo-product:update'" theme="primary" @click="openEdit(row)">编辑</t-link>
        <t-popconfirm content="确定删除吗?" theme="danger" @confirm="onDelete(row)">
          <t-link v-permission="'demo-product:delete'" theme="danger">删除</t-link>
        </t-popconfirm>
      </t-space>
    </template>
  </table-plus>

  <form-dialog v-model:visible="dialogVisible" :title="form.id ? '编辑演示商品' : '新增演示商品'" :on-submit="save">
    <t-form ref="formRef" :data="form" label-width="90px">
      <t-form-item label="商品名称" name="name">
        <t-input v-model="form.name" placeholder="请输入商品名称" />
      </t-form-item>
      <t-form-item label="价格" name="price">
        <t-input-number
          :value="form.price / 100"
          :decimal-places="2"
          :min="0"
          theme="normal"
          suffix="元"
          style="width: 200px"
          @change="(v: unknown) => (form.price = Math.round(Number(v || 0) * 100))"
        />
      </t-form-item>
      <t-form-item label="库存" name="stock">
        <t-input-number v-model="form.stock" />
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
  listDemoProducts, getDemoProduct, createDemoProduct, updateDemoProduct, deleteDemoProduct,
  type DemoProductItem, type DemoProductForm,
} from '@/api/gen/demo_product';
import { formatDate } from '@/utils/date';
import { formatMoney } from '@/utils/money';

const tableRef = ref<TablePlusExpose>();
const query = reactive({ name: '', status: '' as string | number, });

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'name', title: '商品名称', width: 140 },
  { colKey: 'price', title: '价格', width: 140 },
  { colKey: 'stock', title: '库存', width: 140 },
  { colKey: 'status', title: '状态', width: 140 },
  { colKey: 'remark', title: '备注', width: 140 },
  { colKey: 'create_time', title: '创建时间', width: 140 },
  { colKey: 'update_time', title: '更新时间', width: 140 },
  { colKey: 'op', title: '操作', width: 120, fixed: 'right' as const },
];

const dialogVisible = ref(false);
const formRef = ref<FormInstanceFunctions>();

const emptyForm = (): DemoProductForm => ({ name: '', price: 0, stock: 0, status: 1, remark: '', });
const form = reactive<DemoProductForm>(emptyForm());

function openCreate(): void {
  Object.assign(form, emptyForm(), { id: undefined });
  dialogVisible.value = true;
}

// 列表只返回展示字段,编辑时按 ID 拉取完整详情再回填表单
async function openEdit(row: DemoProductItem): Promise<void> {
  const detail = await getDemoProduct(row.id);
  Object.assign(form, emptyForm(), {
    id: detail.id,
    name: detail.name,
    price: detail.price,
    stock: detail.stock,
    status: detail.status,
    remark: detail.remark,
  });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if (form.id) {
    await updateDemoProduct(form.id, { ...form });
    MessagePlugin.success('更新成功');
  } else {
    await createDemoProduct({ ...form });
    MessagePlugin.success('创建成功');
  }
  tableRef.value?.refresh();
}

async function onDelete(row: DemoProductItem): Promise<void> {
  await deleteDemoProduct(row.id);
  MessagePlugin.success('删除成功');
  tableRef.value?.refresh();
}
</script>
