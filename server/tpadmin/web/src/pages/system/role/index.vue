<!--
  角色管理:列表 + 新增/编辑(数据范围 + 菜单权限树勾选)+ 删除。
  Author: qiufeng
-->
<template>
  <table-plus ref="tableRef" :columns="columns" :fetcher="listRoles" :query="query">
    <template #search>
      <t-input v-model="query.name" placeholder="角色名称" clearable />
    </template>

    <template #toolbar>
      <t-button v-permission="'system:role:create'" theme="primary" @click="openCreate">
        <template #icon><add-icon /></template>新增角色
      </t-button>
    </template>

    <template #data_scope="{ row }">
      {{ DATA_SCOPES.find((s) => s.value === row.data_scope)?.label ?? row.data_scope }}
    </template>

    <template #status="{ row }">
      <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light">
        {{ row.status === 1 ? '启用' : '禁用' }}
      </t-tag>
    </template>

    <template #create_time="{ row }">{{ formatDate(row.create_time) }}</template>

    <template #op="{ row }">
      <t-space size="12px">
        <t-link v-permission="'system:role:update'" theme="primary" @click="openEdit(row)">编辑</t-link>
        <t-popconfirm content="确定删除该角色吗?" theme="danger" @confirm="onDelete(row)">
          <t-link v-permission="'system:role:delete'" theme="danger">删除</t-link>
        </t-popconfirm>
      </t-space>
    </template>
  </table-plus>

  <form-dialog v-model:visible="dialogVisible" :title="form.id ? '编辑角色' : '新增角色'" :on-submit="save" width="640px">
    <t-form ref="formRef" :data="form" :rules="rules" label-width="80px">
      <t-form-item label="名称" name="name">
        <t-input v-model="form.name" placeholder="角色名称" />
      </t-form-item>
      <t-form-item label="标识" name="code">
        <t-input v-model="form.code" placeholder="唯一编码,如 operator" :disabled="!!form.id" />
      </t-form-item>
      <t-form-item label="数据范围" name="data_scope">
        <t-select v-model="form.data_scope">
          <t-option v-for="scope in DATA_SCOPES" :key="scope.value" :label="scope.label" :value="scope.value" />
        </t-select>
      </t-form-item>
      <t-form-item v-if="form.data_scope === 'custom'" label="可见部门" name="dept_ids">
        <t-tree-select
          v-model="form.dept_ids"
          :data="deptOptions"
          :tree-props="{ keys: { value: 'id', label: 'name', children: 'children' }, checkable: true, valueMode: 'all' }"
          multiple
          placeholder="选择可见部门"
        />
      </t-form-item>
      <t-form-item label="菜单权限" name="menu_ids">
        <div class="menu-tree-box">
          <t-tree
            ref="menuTreeRef"
            :data="menuTree"
            :keys="{ value: 'id', label: 'title', children: 'children' }"
            checkable
            hover
            expand-all
            value-mode="all"
            :value="form.menu_ids"
            @change="(val: unknown) => (form.menu_ids = val as number[])"
          />
        </div>
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
import { onMounted, reactive, ref } from 'vue';
import { MessagePlugin, type FormInstanceFunctions, type FormProps } from 'tdesign-vue-next';
import { AddIcon } from 'tdesign-icons-vue-next';
import TablePlus, { type TablePlusExpose } from '@/components/TablePlus.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  listRoles, getRole, createRole, updateRole, deleteRole, DATA_SCOPES,
  type RoleItem, type RoleForm,
} from '@/api/system/role';
import { listMenus } from '@/api/system/menu';
import { listDepts, type DeptNode } from '@/api/system/dept';
import type { MenuNode } from '@/types/auth';
import { formatDate } from '@/utils/date';

const tableRef = ref<TablePlusExpose>();
const query = reactive({ name: '' });

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'name', title: '名称', width: 140 },
  { colKey: 'code', title: '标识', width: 130 },
  { colKey: 'data_scope', title: '数据范围', width: 120 },
  { colKey: 'status', title: '状态', width: 80 },
  { colKey: 'remark', title: '备注' },
  { colKey: 'create_time', title: '创建时间', width: 170 },
  { colKey: 'op', title: '操作', width: 120, fixed: 'right' as const },
];

const menuTree = ref<MenuNode[]>([]);
const deptOptions = ref<DeptNode[]>([]);

onMounted(async () => {
  [menuTree.value, deptOptions.value] = await Promise.all([
    listMenus().catch(() => []),
    listDepts().catch(() => []),
  ]);
});

const dialogVisible = ref(false);
const formRef = ref<FormInstanceFunctions>();

const emptyForm = (): RoleForm => ({
  name: '', code: '', data_scope: 'self', sort: 0, status: 1, remark: '', menu_ids: [], dept_ids: [],
});
const form = reactive<RoleForm>(emptyForm());

const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入角色名称' }],
  code: [{ required: true, message: '请输入角色标识' }],
};

function openCreate(): void {
  Object.assign(form, emptyForm(), { id: undefined });
  dialogVisible.value = true;
}

async function openEdit(row: RoleItem): Promise<void> {
  const detail = await getRole(row.id);
  Object.assign(form, emptyForm(), {
    id: detail.id,
    name: detail.name,
    code: detail.code,
    data_scope: detail.data_scope,
    sort: detail.sort,
    status: detail.status,
    remark: detail.remark,
    menu_ids: detail.menu_ids,
    dept_ids: detail.dept_ids,
  });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if ((await formRef.value?.validate()) !== true) return Promise.reject();
  if (form.id) {
    await updateRole(form.id, { ...form });
    MessagePlugin.success('更新成功');
  } else {
    await createRole({ ...form });
    MessagePlugin.success('创建成功');
  }
  tableRef.value?.refresh();
}

async function onDelete(row: RoleItem): Promise<void> {
  await deleteRole(row.id);
  MessagePlugin.success('删除成功');
  tableRef.value?.refresh();
}
</script>

<style scoped>
.menu-tree-box {
  width: 100%;
  max-height: 280px;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-default);
}
</style>
