<template>
  <div class="page-container">
    <header class="page-heading">
      <div>
        <h1>操作记录</h1>
        <p>查看云端操作与审核记录</p>
      </div>
      <div class="page-actions">
        <el-button :loading="busy" @click="refresh">刷新数据</el-button>
      </div>
    </header>

    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="toolbar-left">
          <el-input
            v-model="query"
            clearable
            placeholder="搜索账号、动作或记录"
            style="width: 280px"
          />
          <el-select v-model="action" style="width: 180px">
            <el-option v-for="item in actionOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </div>
        <div class="toolbar-right text-muted">共 {{ filtered.length }} 条记录</div>
      </div>

      <el-table v-loading="busy" :data="pagedRows" stripe>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ stamp(row.time) }}</template>
        </el-table-column>
        <el-table-column label="操作账号" width="150">
          <template #default="{ row }">{{ actorLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="动作" width="140">
          <template #default="{ row }">{{ actionLabels[row.action] || row.action }}</template>
        </el-table-column>
        <el-table-column label="记录" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ auditDetail(row) }}</template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="filtered.length"
          layout="total, prev, pager, next"
          background
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { fetchOverview } from '@/api/admin'
import { runTask } from '@/utils/run'
import { stamp } from '@/utils/format'
import { actionLabels, auditDetail } from '@/utils/auditText'
import type { AuditRow, CloudUser } from '@/types'

const rows = ref<AuditRow[]>([])
const users = ref<CloudUser[]>([])
const busy = ref(false)
const query = ref('')
const action = ref('all')
const page = ref(1)
const pageSize = 20

// 动作下拉按当前记录中实际出现的类型生成
const actionOptions = computed(() => [
  { label: '全部动作', value: 'all' },
  ...Array.from(new Set(rows.value.map((row) => row.action))).map((value) => ({
    value,
    label: actionLabels[value] || value
  }))
])

const phoneOf = (userId: string) => users.value.find((user) => user.id === userId)?.phone || userId

const actorLabel = (row: AuditRow) => (row.user_id === 'admin' ? '管理员' : phoneOf(row.user_id))

const filtered = computed(() => {
  const text = query.value.trim().toLowerCase()
  return rows.value.filter((row) => {
    if (action.value !== 'all' && row.action !== action.value) return false
    if (!text) return true
    return [
      row.user_id,
      actorLabel(row),
      row.action,
      actionLabels[row.action],
      row.detail,
      auditDetail(row),
      stamp(row.time)
    ]
      .join(' ')
      .toLowerCase()
      .includes(text)
  })
})

const pagedRows = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

watch([query, action], () => {
  page.value = 1
})

function refresh() {
  void runTask(busy, async () => {
    const result = await fetchOverview()
    if (!Array.isArray(result.audit)) throw new Error('无权查看操作记录')
    rows.value = result.audit
    users.value = result.users || []
  })
}

onMounted(refresh)
</script>
