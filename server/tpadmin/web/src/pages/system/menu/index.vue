<!--
  菜单管理:树形表格展示四类节点(目录/菜单/按钮/接口),表单字段随类型动态变化。
  Author: qiufeng
-->
<template>
  <t-card :bordered="false">
    <div class="toolbar">
      <t-button v-permission="'system:menu:create'" theme="primary" @click="openCreate(0)">
        <template #icon><add-icon /></template>新增根节点
      </t-button>
      <t-button variant="outline" @click="expandAll = !expandAll">
        {{ expandAll ? '收起全部' : '展开全部' }}
      </t-button>
    </div>

    <t-enhanced-table
      ref="tableRef"
      row-key="id"
      :data="menus"
      :columns="columns"
      :loading="loading"
      :tree="{ childrenKey: 'children', treeNodeColumnIndex: 0, expandTreeNodeOnClick: true }"
    >
      <template #title="{ row }">
        <t-space size="6px" align="center">
          <icon v-if="row.icon" :name="row.icon" />
          <span>{{ row.title }}</span>
        </t-space>
      </template>

      <template #type="{ row }">
        <t-tag :theme="TYPE_META[row.type as MenuType].theme" variant="light" size="small">
          {{ TYPE_META[row.type as MenuType].label }}
        </t-tag>
      </template>

      <template #info="{ row }">
        <span class="info-text">{{ row.type === 'button' || row.type === 'api' ? row.permission : row.path }}</span>
      </template>

      <template #visible="{ row }">
        <template v-if="row.type === 'catalog' || row.type === 'menu'">
          {{ row.visible === 1 ? '显示' : '隐藏' }}
        </template>
        <span v-else>-</span>
      </template>

      <template #status="{ row }">
        <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light" size="small">
          {{ row.status === 1 ? '启用' : '禁用' }}
        </t-tag>
      </template>

      <template #op="{ row }">
        <t-space size="12px">
          <t-link
            v-if="row.type === 'catalog' || row.type === 'menu'"
            v-permission="'system:menu:create'"
            theme="primary"
            @click.stop="openCreate(row.id)"
          >新增子级</t-link>
          <t-link v-permission="'system:menu:update'" theme="primary" @click.stop="openEdit(row)">编辑</t-link>
          <t-popconfirm content="确定删除该节点吗?" theme="danger" @confirm="onDelete(row)">
            <t-link v-permission="'system:menu:delete'" theme="danger" @click.stop>删除</t-link>
          </t-popconfirm>
        </t-space>
      </template>
    </t-enhanced-table>
  </t-card>

  <form-dialog v-model:visible="dialogVisible" :title="form.id ? '编辑节点' : '新增节点'" :on-submit="save" width="620px">
    <t-form ref="formRef" :data="form" :rules="rules" label-width="90px">
      <t-form-item label="上级节点" name="parent_id">
        <t-tree-select
          v-model="form.parent_id"
          :data="parentOptions"
          :tree-props="{ keys: { value: 'id', label: 'title', children: 'children' } }"
          placeholder="不选则为根节点"
          clearable
        />
      </t-form-item>
      <t-form-item label="类型" name="type">
        <t-radio-group v-model="form.type" :disabled="!!form.id">
          <t-radio-button v-for="(meta, key) in TYPE_META" :key="key" :value="key">{{ meta.label }}</t-radio-button>
        </t-radio-group>
      </t-form-item>
      <t-form-item label="标题" name="title">
        <t-input v-model="form.title" placeholder="菜单显示名称" />
      </t-form-item>

      <template v-if="form.type === 'catalog' || form.type === 'menu'">
        <t-form-item label="路由路径" name="path">
          <t-input v-model="form.path" placeholder="如 /system/user" />
        </t-form-item>
        <t-form-item v-if="form.type === 'menu'" label="路由名称" name="name">
          <t-input v-model="form.name" placeholder="如 SystemUser(可选)" />
        </t-form-item>
        <t-form-item v-if="form.type === 'menu'" label="页面组件" name="component">
          <t-input v-model="form.component" placeholder="如 system/user/index(对应 src/pages 下文件)" />
        </t-form-item>
        <t-form-item label="图标" name="icon">
          <t-input v-model="form.icon" placeholder="TDesign 图标名,如 user / setting">
            <template #suffix-icon><icon v-if="form.icon" :name="form.icon" /></template>
          </t-input>
        </t-form-item>
        <t-form-item label="是否显示" name="visible">
          <t-radio-group v-model="form.visible">
            <t-radio :value="1">显示</t-radio>
            <t-radio :value="0">隐藏</t-radio>
          </t-radio-group>
        </t-form-item>
      </template>

      <t-form-item v-if="form.type === 'button' || form.type === 'api'" label="权限标识" name="permission">
        <t-input v-model="form.permission" placeholder="如 system:user:create" />
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
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { MessagePlugin, type EnhancedTableInstanceFunctions, type FormInstanceFunctions, type FormProps } from 'tdesign-vue-next';
import { AddIcon, Icon } from 'tdesign-icons-vue-next';
import FormDialog from '@/components/FormDialog.vue';
import { listMenus, createMenu, updateMenu, deleteMenu, type MenuForm } from '@/api/system/menu';
import type { MenuNode } from '@/types/auth';

type MenuType = 'catalog' | 'menu' | 'button' | 'api';

const TYPE_META: Record<MenuType, { label: string; theme: 'primary' | 'success' | 'warning' | 'default' }> = {
  catalog: { label: '目录', theme: 'primary' },
  menu: { label: '菜单', theme: 'success' },
  button: { label: '按钮', theme: 'warning' },
  api: { label: '接口', theme: 'default' },
};

const tableRef = ref<EnhancedTableInstanceFunctions>();
const menus = ref<MenuNode[]>([]);
const loading = ref(false);
const expandAll = ref(false);

const columns = [
  { colKey: 'title', title: '标题', width: 240 },
  { colKey: 'type', title: '类型', width: 90 },
  { colKey: 'info', title: '路由 / 权限标识', width: 240 },
  { colKey: 'sort', title: '排序', width: 80 },
  { colKey: 'visible', title: '显示', width: 80 },
  { colKey: 'status', title: '状态', width: 90 },
  { colKey: 'op', title: '操作', width: 200 },
];

watch(expandAll, (val) => (val ? tableRef.value?.expandAll() : tableRef.value?.foldAll()));

async function load(): Promise<void> {
  loading.value = true;
  try {
    menus.value = await listMenus();
    // 重新加载后树回到折叠态,同步开关状态
    expandAll.value = false;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** 上级节点候选:只有目录/菜单能挂子级 */
const parentOptions = computed(() => {
  const filter = (nodes: MenuNode[]): MenuNode[] =>
    nodes
      .filter((n) => n.type === 'catalog' || n.type === 'menu')
      .map((n) => ({ ...n, children: filter(n.children ?? []) }));
  return filter(menus.value);
});

// ---- 新增/编辑 ----
const dialogVisible = ref(false);
const formRef = ref<FormInstanceFunctions>();

const emptyForm = (): MenuForm => ({
  parent_id: 0, type: 'menu', title: '', name: '', path: '', component: '',
  icon: '', permission: '', sort: 0, visible: 1, status: 1,
});
const form = reactive<MenuForm>(emptyForm());

const rules: FormProps['rules'] = {
  title: [{ required: true, message: '请输入标题' }],
  permission: [{ required: true, message: '请输入权限标识' }],
};

function openCreate(parentId: number): void {
  Object.assign(form, emptyForm(), { id: undefined, parent_id: parentId, type: parentId === 0 ? 'catalog' : 'menu' });
  dialogVisible.value = true;
}

function openEdit(row: MenuNode): void {
  Object.assign(form, emptyForm(), {
    id: row.id,
    parent_id: row.parent_id,
    type: row.type,
    title: row.title,
    name: row.name,
    path: row.path,
    component: row.component,
    icon: row.icon,
    permission: row.permission,
    sort: row.sort,
    visible: row.visible,
    status: row.status,
  });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if ((await formRef.value?.validate()) !== true) return Promise.reject();
  const payload = { ...form, parent_id: form.parent_id || 0 };
  if (form.id) {
    await updateMenu(form.id, payload);
    MessagePlugin.success('更新成功');
  } else {
    await createMenu(payload);
    MessagePlugin.success('创建成功');
  }
  await load();
}

async function onDelete(row: MenuNode): Promise<void> {
  await deleteMenu(row.id);
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

.info-text {
  color: var(--td-text-color-secondary);
  font-family: monospace;
}
</style>
