<template>
  <div class="page-container">
    <header class="page-heading">
      <div>
        <h1>{{ title }}</h1>
        <p>{{ subtitle }}</p>
      </div>
      <div class="page-actions">
        <el-button :loading="busy" @click="refresh">刷新数据</el-button>
      </div>
    </header>

    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="toolbar-left">
          <el-input v-model="query" clearable :placeholder="'搜索' + title" style="width: 280px" />
        </div>
        <div class="toolbar-right">
          <el-button v-if="canWrite" type="primary" @click="create">
            {{ scope === 'admins' ? '新增管理员' : scope === 'roles' ? '新增角色' : '新增菜单' }}
          </el-button>
        </div>
      </div>

      <!-- 管理员 -->
      <el-table v-if="scope === 'admins'" v-loading="busy" :data="pagedRows" row-key="id" stripe>
        <el-table-column label="账号" min-width="150">
          <template #default="{ row }">
            {{ row.username }}
            <el-tag v-if="row.builtin" type="primary" effect="light" size="small" class="ml4">内置超管</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="角色" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ roleNames(row) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'danger'" effect="light">{{ row.enabled ? '启用' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ row.created ? stamp(row.created) : '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <template v-if="canWrite && !row.builtin">
              <el-button link type="primary" @click="edit(row)">编辑</el-button>
              <el-button link type="danger" :disabled="busy" @click="confirmDelete(row)">删除</el-button>
            </template>
            <span v-else class="text-muted">只读</span>
          </template>
        </el-table-column>
      </el-table>

      <!-- 角色 -->
      <el-table v-else-if="scope === 'roles'" v-loading="busy" :data="pagedRows" row-key="id" stripe>
        <el-table-column prop="name" label="角色名称" min-width="140" />
        <el-table-column label="权限" min-width="320" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.permissions.map((p: string) => permissionLabel(p)).join('、') || '未分配权限' }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ row.created ? stamp(row.created) : '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <template v-if="canWrite">
              <el-button link type="primary" @click="edit(row)">编辑</el-button>
              <el-button link type="danger" :disabled="busy" @click="confirmDelete(row)">删除</el-button>
            </template>
            <span v-else class="text-muted">只读</span>
          </template>
        </el-table-column>
      </el-table>

      <!-- 菜单 -->
      <el-table v-else v-loading="busy" :data="pagedRows" row-key="key" stripe>
        <el-table-column prop="title" label="菜单名称" min-width="130" />
        <el-table-column prop="path" label="路由" min-width="130" />
        <el-table-column label="查看权限" min-width="130">
          <template #default="{ row }">{{ permissionLabel(row.readPermission) }}</template>
        </el-table-column>
        <el-table-column label="导航显示" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.visible ? 'success' : 'info'" effect="light">{{ row.visible ? '显示' : '隐藏' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'danger'" effect="light">{{ row.enabled ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="70" align="center" />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canWrite" link type="primary" @click="edit(row)">编辑</el-button>
            <span v-else class="text-muted">只读</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="visibleRows.length"
          layout="total, prev, pager, next"
          background
        />
      </div>
    </el-card>

    <!-- 编辑 / 新增弹窗 -->
    <el-dialog
      v-model="dialog"
      :title="(editing ? '编辑' : '新增') + (scope === 'admins' ? '管理员' : scope === 'roles' ? '角色' : '菜单')"
      width="680px"
      :close-on-click-modal="false"
      @closed="closeDialog"
    >
      <!-- 管理员表单 -->
      <el-form v-if="scope === 'admins'" label-position="top">
        <el-form-item label="管理员账号">
          <el-input v-model="adminForm.username" :disabled="!!editing" placeholder="请输入登录账号" />
        </el-form-item>
        <el-form-item :label="editing ? '重置密码（留空不修改）' : '管理员密码'">
          <el-input v-model="adminForm.password" type="password" show-password autocomplete="new-password" placeholder="请输入密码，8 至 128 个字符" />
        </el-form-item>
        <el-form-item label="分配角色">
          <el-select v-model="adminForm.roleIds" multiple clearable placeholder="请选择角色" style="width: 100%">
            <el-option v-for="item in roles" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="adminForm.enabled" />
        </el-form-item>
      </el-form>

      <!-- 角色表单 -->
      <el-form v-else-if="scope === 'roles'" label-position="top">
        <el-form-item label="角色名称">
          <el-input v-model="roleForm.name" placeholder="请输入角色名称" />
        </el-form-item>
        <el-form-item label="角色权限">
          <div class="permission-box">
            <el-checkbox-group v-model="roleForm.permissions">
              <el-checkbox
                v-for="item in permissionOptions"
                :key="item.value"
                :value="item.value"
                :disabled="!userStore.hasPerm(item.value)"
              >
                {{ item.label }}
              </el-checkbox>
            </el-checkbox-group>
          </div>
        </el-form-item>
        <p class="text-muted">只能授予当前账号自身拥有的权限。</p>
      </el-form>

      <!-- 菜单编辑表单 -->
      <el-form v-else-if="editing" label-position="top">
        <el-form-item label="菜单名称">
          <el-input v-model="menuForm.title" placeholder="请输入名称" />
        </el-form-item>
        <el-form-item label="导航显示">
          <el-switch v-model="menuForm.visible" :disabled="systemMenus.includes(editing)" />
        </el-form-item>
        <el-form-item label="启用菜单">
          <el-switch v-model="menuForm.enabled" :disabled="systemMenus.includes(editing)" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="menuForm.sort" :min="0" />
        </el-form-item>
        <p class="text-muted">隐藏只影响导航；停用后对应业务接口也会被拒绝。系统管理入口不能隐藏或停用。路由和权限由系统定义。</p>
      </el-form>

      <!-- 菜单新增表单 -->
      <div v-else>
        <p class="text-muted">仅可添加系统已注册但当前停用的业务页面，不能添加任意路由。</p>
        <el-form v-if="candidates.length" label-position="top">
          <el-form-item label="选择业务页面">
            <el-select v-model="candidate" placeholder="请选择业务页面" style="width: 100%">
              <el-option v-for="item in candidates" :key="item.key" :label="item.title" :value="item.key" />
            </el-select>
          </el-form-item>
        </el-form>
        <p v-else class="text-muted">当前没有可新增的业务页面。</p>
      </div>

      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="busy"
          :disabled="busy || (scope === 'menus' && !editing && !candidate)"
          @click="save"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createAccess,
  deleteAccess,
  listAccess,
  menuCandidates,
  updateAccess,
  type AccessScope
} from '@/api/admin'
import { runTask } from '@/utils/run'
import { stamp } from '@/utils/format'
import { permissionLabel, permissionOptions } from '@/utils/permissions'
import { useUserStore } from '@/stores/user'
import type { AdminRow, MenuRow, RoleRow } from '@/types'

const props = defineProps<{ scope: AccessScope }>()
const userStore = useUserStore()

const titles: Record<AccessScope, [string, string]> = {
  admins: ['管理员管理', '维护后台管理员及其角色'],
  roles: ['角色管理', '配置角色可使用的菜单和操作权限'],
  menus: ['菜单管理', '调整已支持菜单的名称、显示状态和顺序']
}
const title = computed(() => titles[props.scope][0])
const subtitle = computed(() => titles[props.scope][1])
const canWrite = computed(() => userStore.hasPerm(props.scope + ':write'))

// 系统管理入口不允许隐藏或停用
const systemMenus = ['admins', 'roles', 'menus']

const rows = ref<any[]>([])
const roles = ref<RoleRow[]>([])
const busy = ref(false)
const dialog = ref(false)
const editing = ref('')
const query = ref('')
const page = ref(1)
const pageSize = 20
const candidates = ref<MenuRow[]>([])
const candidate = ref('')

const adminForm = reactive({ username: '', password: '', roleIds: [] as string[], enabled: true })
const roleForm = reactive({ name: '', permissions: [] as string[] })
const menuForm = reactive({ title: '', visible: true, enabled: true, sort: 0 })

const visibleRows = computed(() => {
  const text = query.value.trim().toLowerCase()
  return rows.value.filter((row) => !text || JSON.stringify(row).toLowerCase().includes(text))
})

const pagedRows = computed(() => visibleRows.value.slice((page.value - 1) * pageSize, page.value * pageSize))

watch(query, () => {
  page.value = 1
})

const roleNames = (row: AdminRow) =>
  Array.isArray(row.roleNames)
    ? row.roleNames.join('、') || '未分配角色'
    : row.roleIds.map((id) => roles.value.find((role) => role.id === id)?.name || id).join('、') || '未分配角色'

function refresh() {
  void runTask(busy, load)
}

async function load() {
  const response = await listAccess(props.scope)
  if (!Array.isArray(response.items)) throw new Error('管理服务返回的数据不完整')
  rows.value = response.items
  // 管理员页需要角色下拉；有角色查看权限时一并加载
  if (props.scope === 'admins' && (canWrite.value || userStore.hasPerm('roles:read'))) {
    const result = await listAccess('roles')
    if (!Array.isArray(result.items)) throw new Error('角色列表返回的数据不完整')
    roles.value = result.items
  }
}

function closeDialog() {
  adminForm.password = ''
}

function create() {
  void runTask(busy, async () => {
    editing.value = ''
    Object.assign(adminForm, { username: '', password: '', roleIds: [], enabled: true })
    Object.assign(roleForm, { name: '', permissions: [] })
    if (props.scope === 'menus') {
      const result = await menuCandidates()
      if (!Array.isArray(result.items)) throw new Error('菜单候选列表返回的数据不完整')
      candidates.value = result.items
      candidate.value = ''
    }
    dialog.value = true
  })
}

function edit(item: any) {
  editing.value = props.scope === 'menus' ? item.key : item.id
  adminForm.password = ''
  if (props.scope === 'admins') {
    Object.assign(adminForm, { username: item.username, password: '', roleIds: [...item.roleIds], enabled: item.enabled })
  } else if (props.scope === 'roles') {
    Object.assign(roleForm, { name: item.name, permissions: [...item.permissions] })
  } else {
    Object.assign(menuForm, { title: item.title, visible: item.visible, enabled: item.enabled, sort: item.sort })
  }
  dialog.value = true
}

// 表单校验与载荷组装，规则与现役后台 accessModel 一致
function buildPayload(): Record<string, unknown> {
  if (props.scope === 'admins') {
    const creating = !editing.value
    if (creating && !adminForm.username.trim()) throw new Error('请输入管理员账号')
    if (creating && !adminForm.password) throw new Error('请输入管理员密码')
    return {
      ...(creating ? { username: adminForm.username.trim() } : {}),
      ...(adminForm.password ? { password: adminForm.password } : {}),
      enabled: adminForm.enabled,
      roleIds: [...adminForm.roleIds]
    }
  }
  if (props.scope === 'roles') {
    if (!roleForm.name.trim()) throw new Error('请输入角色名称')
    if (roleForm.permissions.some((value) => !permissionOptions.some((p) => p.value === value))) {
      throw new Error('存在无效权限')
    }
    return { name: roleForm.name.trim(), permissions: [...new Set(roleForm.permissions)] }
  }
  if (editing.value) {
    if (!menuForm.title.trim()) throw new Error('请输入菜单名称')
    if (!Number.isSafeInteger(menuForm.sort) || menuForm.sort < 0) throw new Error('菜单排序必须为非负整数')
    return { title: menuForm.title.trim(), visible: menuForm.visible, enabled: menuForm.enabled, sort: menuForm.sort }
  }
  if (!candidates.value.some((item) => item.key === candidate.value)) throw new Error('请选择可新增的系统业务页面')
  return { key: candidate.value }
}

function save() {
  void runTask(busy, async () => {
    if (!canWrite.value) throw new Error('当前账号没有修改权限')
    const payload = buildPayload()
    const response = editing.value
      ? await updateAccess(props.scope, editing.value, payload)
      : await createAccess(props.scope, payload)
    if (!response.item || typeof response.item !== 'object') {
      throw new Error('管理服务未确认保存结果，请刷新后核对')
    }
    dialog.value = false
    await load()
    ElMessage.success('保存成功')
  })
}

async function confirmDelete(item: any) {
  const label = props.scope === 'admins' ? item.username : item.name
  try {
    await ElMessageBox.confirm(`确定删除“${label}”吗？`, '确认删除', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  void runTask(busy, async () => {
    const result = await deleteAccess(props.scope, item.id)
    if (result.deleted !== true) throw new Error('管理服务未确认删除结果')
    await load()
    ElMessage.success('删除成功')
  })
}

onMounted(refresh)
</script>

<style scoped lang="scss">
.ml4 {
  margin-left: 4px;
}

.permission-box {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;

  :deep(.el-checkbox-group) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 12px;
  }

  :deep(.el-checkbox) {
    margin-right: 0;
  }
}

@media (max-width: 720px) {
  .permission-box :deep(.el-checkbox-group) {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
