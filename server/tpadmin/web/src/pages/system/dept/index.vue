<!--
  部门管理:树形表格 + 新增/编辑/删除。
  Author: qiufeng
-->
<template>
  <t-card :bordered="false">
    <div class="toolbar">
      <t-button v-permission="'system:dept:create'" theme="primary" @click="openCreate(0)">
        <template #icon><add-icon /></template>新增部门
      </t-button>
    </div>

    <t-enhanced-table
      ref="tableRef"
      row-key="id"
      :data="depts"
      :columns="columns"
      :loading="loading"
      :tree="{ childrenKey: 'children', treeNodeColumnIndex: 0, defaultExpandAll: true, expandTreeNodeOnClick: true }"
    >
      <template #status="{ row }">
        <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light" size="small">
          {{ row.status === 1 ? '启用' : '禁用' }}
        </t-tag>
      </template>

      <template #op="{ row }">
        <t-space size="12px">
          <t-link v-permission="'system:dept:create'" theme="primary" @click.stop="openCreate(row.id)">新增子部门</t-link>
          <t-link v-permission="'system:dept:update'" theme="primary" @click.stop="openEdit(row)">编辑</t-link>
          <t-popconfirm content="确定删除该部门吗?" theme="danger" @confirm="onDelete(row)">
            <t-link v-permission="'system:dept:delete'" theme="danger" @click.stop>删除</t-link>
          </t-popconfirm>
        </t-space>
      </template>
    </t-enhanced-table>
  </t-card>

  <form-dialog v-model:visible="dialogVisible" :title="form.id ? '编辑部门' : '新增部门'" :on-submit="save">
    <t-form ref="formRef" :data="form" :rules="rules" label-width="90px">
      <t-form-item label="上级部门" name="parent_id">
        <t-tree-select
          v-model="form.parent_id"
          :data="depts"
          :tree-props="{ keys: { value: 'id', label: 'name', children: 'children' } }"
          placeholder="不选则为顶级部门"
          clearable
        />
      </t-form-item>
      <t-form-item label="部门名称" name="name">
        <t-input v-model="form.name" placeholder="部门名称" />
      </t-form-item>
      <t-form-item label="负责人" name="leader">
        <t-input v-model="form.leader" placeholder="选填" />
      </t-form-item>
      <t-form-item label="联系电话" name="phone">
        <t-input v-model="form.phone" placeholder="选填" />
      </t-form-item>
      <t-form-item label="邮箱" name="email">
        <t-input v-model="form.email" placeholder="选填" />
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
    </t-form>
  </form-dialog>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue';
import { MessagePlugin, type EnhancedTableInstanceFunctions, type FormInstanceFunctions, type FormProps } from 'tdesign-vue-next';
import { AddIcon } from 'tdesign-icons-vue-next';
import FormDialog from '@/components/FormDialog.vue';
import { listDepts, createDept, updateDept, deleteDept, type DeptNode, type DeptForm } from '@/api/system/dept';

const tableRef = ref<EnhancedTableInstanceFunctions>();
const depts = ref<DeptNode[]>([]);
const loading = ref(false);

const columns = [
  { colKey: 'name', title: '部门名称', width: 240 },
  { colKey: 'leader', title: '负责人', width: 120 },
  { colKey: 'phone', title: '联系电话', width: 140 },
  { colKey: 'email', title: '邮箱', width: 180 },
  { colKey: 'sort', title: '排序', width: 80 },
  { colKey: 'status', title: '状态', width: 90 },
  { colKey: 'op', title: '操作', width: 220 },
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    depts.value = await listDepts();
    // 异步数据下 defaultExpandAll 不生效,加载后主动展开
    await nextTick();
    tableRef.value?.expandAll();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const dialogVisible = ref(false);
const formRef = ref<FormInstanceFunctions>();

const emptyForm = (): DeptForm => ({ parent_id: 0, name: '', leader: '', phone: '', email: '', sort: 0, status: 1 });
const form = reactive<DeptForm>(emptyForm());

const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入部门名称' }],
};

function openCreate(parentId: number): void {
  Object.assign(form, emptyForm(), { id: undefined, parent_id: parentId });
  dialogVisible.value = true;
}

function openEdit(row: DeptNode): void {
  Object.assign(form, emptyForm(), {
    id: row.id,
    parent_id: row.parent_id,
    name: row.name,
    leader: row.leader,
    phone: row.phone,
    email: row.email,
    sort: row.sort,
    status: row.status,
  });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if ((await formRef.value?.validate()) !== true) return Promise.reject();
  const payload = { ...form, parent_id: form.parent_id || 0 };
  if (form.id) {
    await updateDept(form.id, payload);
    MessagePlugin.success('更新成功');
  } else {
    await createDept(payload);
    MessagePlugin.success('创建成功');
  }
  await load();
}

async function onDelete(row: DeptNode): Promise<void> {
  await deleteDept(row.id);
  MessagePlugin.success('删除成功');
  await load();
}
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
</style>
