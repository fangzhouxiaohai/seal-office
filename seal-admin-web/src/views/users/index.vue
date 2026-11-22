<template>
  <div class="page-container">
    <header class="page-heading">
      <div>
        <h1>用户管理</h1>
        <p>查看用户状态与实际空间占用</p>
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
            placeholder="搜索号码片段或账号标识"
            style="width: 280px"
          />
        </div>
        <div class="toolbar-right text-muted">共 {{ filtered.length }} 个账号</div>
      </div>

      <el-table v-loading="busy" :data="pagedRows" row-key="id" stripe>
        <el-table-column prop="phone" label="手机号" min-width="130" />
        <el-table-column prop="id" label="账号标识" min-width="200" show-overflow-tooltip />
        <el-table-column label="云空间" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" effect="light">
              {{ row.enabled ? '已开通' : '关闭' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="自动保存" width="90" align="center">
          <template #default="{ row }">{{ row.autosave ? '开启' : '关闭' }}</template>
        </el-table-column>
        <el-table-column label="注册时间" width="170">
          <template #default="{ row }">{{ stamp(row.created) }}</template>
        </el-table-column>
        <el-table-column label="最后一次操作" width="170">
          <template #default="{ row }">{{ stamp(row.lastAction) }}</template>
        </el-table-column>
        <el-table-column label="实际占用" width="110" align="right">
          <template #default="{ row }">{{ sizeMB(row.used) }} MB</template>
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
import { sizeMB, stamp } from '@/utils/format'
import type { CloudUser } from '@/types'

const rows = ref<CloudUser[]>([])
const busy = ref(false)
const query = ref('')
const page = ref(1)
const pageSize = 20

// 按最近一次操作时间倒排，再按搜索词过滤
const filtered = computed(() => {
  const text = query.value.trim().toLowerCase()
  return [...rows.value]
    .sort((a, b) => (Number(b.lastAction) || 0) - (Number(a.lastAction) || 0))
    .filter((user) => !text || `${user.phone} ${user.id}`.toLowerCase().includes(text))
})

const pagedRows = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

watch(query, () => {
  page.value = 1
})

function refresh() {
  void runTask(busy, async () => {
    const result = await fetchOverview()
    if (!Array.isArray(result.users)) throw new Error('无权查看用户管理')
    rows.value = result.users
  })
}

onMounted(refresh)
</script>
