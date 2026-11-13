<!--
  演示订单管理(代码生成器生成)。
  Author: qiufeng(代码生成器)
-->
<template>
  <table-plus ref="tableRef" :columns="columns" :fetcher="listDemoOrders" :query="query">

    <template #search>
      <t-input v-model="query.order_no" placeholder="订单号" clearable />
      <t-input v-model="query.customer_name" placeholder="客户" clearable />
      <t-select v-model="query.is_paid" placeholder="已支付" clearable>
        <t-option label="是" :value="1" />
        <t-option label="否" :value="0" />
      </t-select>
      <t-date-range-picker
        :value="query.pay_time_start ? [Number(query.pay_time_start) * 1000, Number(query.pay_time_end) * 1000] : []"
        value-type="time-stamp"
        clearable
        :placeholder="['支付时间起', '支付时间止']"
        @change="(v: unknown) => {
          const [start, end] = (v as number[]) ?? [];
          query.pay_time_start = start ? String(Math.floor(start / 1000)) : '';
          query.pay_time_end = end ? String(Math.floor(end / 1000) + 86399) : '';
        }"
      />
    </template>

    <template #toolbar>
      <t-button v-permission="'demo-order:create'" theme="primary" @click="openCreate">
        <template #icon><add-icon /></template>新增演示订单
      </t-button>
    </template>

    <template #amount="{ row }">{{ formatMoney(row.amount, { fromFen: true }) }}</template>
    <template #is_paid="{ row }">
      <t-tag :theme="row.is_paid === 1 ? 'success' : 'default'" variant="light">
        {{ row.is_paid === 1 ? '是' : '否' }}
      </t-tag>
    </template>
    <template #pay_time="{ row }">{{ formatDate(row.pay_time) }}</template>
    <template #create_time="{ row }">{{ formatDate(row.create_time) }}</template>

    <template #op="{ row }">
      <t-space size="12px">
        <t-link v-permission="'demo-order:update'" theme="primary" @click="openEdit(row)">编辑</t-link>
        <t-popconfirm content="确定删除吗?" theme="danger" @confirm="onDelete(row)">
          <t-link v-permission="'demo-order:delete'" theme="danger">删除</t-link>
        </t-popconfirm>
      </t-space>
    </template>
  </table-plus>

  <form-dialog v-model:visible="dialogVisible" :title="form.id ? '编辑演示订单' : '新增演示订单'" :on-submit="save">
    <t-form ref="formRef" :data="form" label-width="90px">
      <t-form-item label="订单号" name="order_no">
        <t-input v-model="form.order_no" placeholder="请输入订单号" />
      </t-form-item>
      <t-form-item label="客户" name="customer_name">
        <t-input v-model="form.customer_name" placeholder="请输入客户" />
      </t-form-item>
      <t-form-item label="商品" name="goods_name">
        <t-input v-model="form.goods_name" placeholder="请输入商品" />
      </t-form-item>
      <t-form-item label="数量" name="quantity">
        <t-input-number v-model="form.quantity" />
      </t-form-item>
      <t-form-item label="订单金额" name="amount">
        <t-input-number
          :value="form.amount / 100"
          :decimal-places="2"
          :min="0"
          theme="normal"
          suffix="元"
          style="width: 200px"
          @change="(v: unknown) => (form.amount = Math.round(Number(v || 0) * 100))"
        />
      </t-form-item>
      <t-form-item label="已支付" name="is_paid">
        <t-radio-group v-model="form.is_paid">
          <t-radio :value="1">是</t-radio>
          <t-radio :value="0">否</t-radio>
        </t-radio-group>
      </t-form-item>
      <t-form-item label="支付时间" name="pay_time">
        <t-date-picker
          :value="form.pay_time ? form.pay_time * 1000 : undefined"
          enable-time-picker
          value-type="time-stamp"
          clearable
          placeholder="请选择支付时间"
          @change="(v: unknown) => (form.pay_time = v ? Math.floor(Number(v) / 1000) : 0)"
        />
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
  listDemoOrders, getDemoOrder, createDemoOrder, updateDemoOrder, deleteDemoOrder,
  type DemoOrderItem, type DemoOrderForm,
} from '@/api/gen/demo_order';
import { formatDate } from '@/utils/date';
import { formatMoney } from '@/utils/money';

const tableRef = ref<TablePlusExpose>();
const query = reactive({ order_no: '', customer_name: '', is_paid: '' as string | number, pay_time_start: '', pay_time_end: '', });

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'order_no', title: '订单号', width: 140 },
  { colKey: 'customer_name', title: '客户', width: 140 },
  { colKey: 'goods_name', title: '商品', width: 140 },
  { colKey: 'quantity', title: '数量', width: 140 },
  { colKey: 'amount', title: '订单金额', width: 140 },
  { colKey: 'is_paid', title: '已支付', width: 140 },
  { colKey: 'pay_time', title: '支付时间', width: 140 },
  { colKey: 'create_time', title: '创建时间', width: 140 },
  { colKey: 'op', title: '操作', width: 120, fixed: 'right' as const },
];

const dialogVisible = ref(false);
const formRef = ref<FormInstanceFunctions>();

const emptyForm = (): DemoOrderForm => ({ order_no: '', customer_name: '', goods_name: '', quantity: 0, amount: 0, is_paid: 0, pay_time: 0, remark: '', });
const form = reactive<DemoOrderForm>(emptyForm());

function openCreate(): void {
  Object.assign(form, emptyForm(), { id: undefined });
  dialogVisible.value = true;
}

// 列表只返回展示字段,编辑时按 ID 拉取完整详情再回填表单
async function openEdit(row: DemoOrderItem): Promise<void> {
  const detail = await getDemoOrder(row.id);
  Object.assign(form, emptyForm(), {
    id: detail.id,
    order_no: detail.order_no,
    customer_name: detail.customer_name,
    goods_name: detail.goods_name,
    quantity: detail.quantity,
    amount: detail.amount,
    is_paid: detail.is_paid,
    pay_time: detail.pay_time,
    remark: detail.remark,
  });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if (form.id) {
    await updateDemoOrder(form.id, { ...form });
    MessagePlugin.success('更新成功');
  } else {
    await createDemoOrder({ ...form });
    MessagePlugin.success('创建成功');
  }
  tableRef.value?.refresh();
}

async function onDelete(row: DemoOrderItem): Promise<void> {
  await deleteDemoOrder(row.id);
  MessagePlugin.success('删除成功');
  tableRef.value?.refresh();
}
</script>
