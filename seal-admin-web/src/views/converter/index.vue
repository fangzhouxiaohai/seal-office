<template>
  <div class="page-container">
    <header class="page-heading">
      <div>
        <h1>文档转换</h1>
        <p>管理手机兼容格式转换、访问令牌与任务状态</p>
      </div>
      <div class="page-actions">
        <el-button :loading="busy" @click="refresh">刷新状态</el-button>
        <el-button
          v-if="canWrite"
          type="primary"
          plain
          :disabled="busy || !state?.engine?.ready || state?.testing"
          @click="test"
        >
          测试真实文档转换
        </el-button>
      </div>
    </header>

    <template v-if="state">
      <div class="stat-row">
        <el-card shadow="never">
          <div class="stat-title">转换服务</div>
          <strong class="stat-value">{{ !state.connected ? '未连接' : state.config.enabled ? '已启用' : '已暂停' }}</strong>
          <p class="text-muted">{{ state.engine?.ready ? state.engine.version : state.error || '转换引擎不可用' }}</p>
        </el-card>
        <el-card shadow="never">
          <div class="stat-title">正在运行 / 并发上限</div>
          <strong class="stat-value">{{ state.statistics?.active ?? '暂无数据' }} / {{ state.config.concurrency }}</strong>
          <p class="text-muted">{{ state.testing ? '正在进行管理测试' : '最近任务仅记录格式、大小与结果' }}</p>
        </el-card>
        <el-card shadow="never">
          <div class="stat-title">本次启动成功 / 失败</div>
          <strong class="stat-value">{{ state.statistics?.succeeded ?? '暂无数据' }} / {{ state.statistics?.failed ?? '暂无数据' }}</strong>
          <p class="text-muted">服务重启后此统计重新计数</p>
        </el-card>
      </div>

      <div class="converter-grid">
        <el-card shadow="never">
          <template #header>转换接口与访问令牌</template>
          <el-form label-position="top">
            <el-form-item label="手机服务地址">
              <div class="endpoint-row">
                <el-input :model-value="state.config.endpoint" readonly />
                <el-button :disabled="busy" @click="copy(state.config.endpoint)">复制服务地址</el-button>
              </div>
            </el-form-item>
          </el-form>
          <p>访问令牌：{{ state.config.tokenConfigured ? '已配置 · 指纹 ' + state.config.tokenFingerprint : '尚未生成' }}</p>
          <p class="text-muted">手机设置 → 文档格式兼容，填写此地址和访问令牌。每次上传正文前由用户确认。</p>
          <el-button v-if="canWrite" type="primary" plain :disabled="busy || !state.connected" @click="confirmReset = true">
            {{ state.config.tokenConfigured ? '重置访问令牌' : '生成访问令牌' }}
          </el-button>
        </el-card>

        <el-card shadow="never">
          <template #header>运行配置</template>
          <el-form label-position="top" @submit.prevent>
            <el-form-item label="接收新的转换请求">
              <el-switch v-model="enabled" :disabled="busy || !canWrite" />
            </el-form-item>
            <el-form-item label="同时处理任务数">
              <el-radio-group v-model="concurrency" :disabled="busy || !canWrite">
                <el-radio :value="1">1 个</el-radio>
                <el-radio :value="2">2 个</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-form>
          <p class="text-muted">单文件限制 / 转换超时：20 MiB / 90 秒</p>
          <p class="text-muted">
            最后真实转换测试：{{ lastTestText }}
          </p>
          <p class="text-muted">暂停会拒绝新请求，已开始的任务继续完成。设置与令牌重置记入操作记录。</p>
          <el-button v-if="canWrite" type="primary" :loading="busy" @click="save">保存转换配置</el-button>
        </el-card>
      </div>

      <el-card shadow="never">
        <template #header>近期转换任务</template>
        <div class="table-toolbar">
          <div class="toolbar-left">
            <el-input v-model="search" clearable placeholder="搜索格式、结果或失败原因" style="width: 280px" />
          </div>
        </div>
        <el-table :data="pagedJobs" stripe>
          <el-table-column label="开始时间" width="170">
            <template #default="{ row }">{{ new Date(row.startedAt).toLocaleString('zh-CN', { hour12: false }) }}</template>
          </el-table-column>
          <el-table-column label="格式" width="140">
            <template #default="{ row }">{{ row.inputFormat.toUpperCase() }} → {{ row.outputFormat.toUpperCase() }}</template>
          </el-table-column>
          <el-table-column label="文件大小" width="110" align="right">
            <template #default="{ row }">{{ (row.inputBytes / 1048576).toFixed(2) }} MiB</template>
          </el-table-column>
          <el-table-column label="用时" width="100" align="right">
            <template #default="{ row }">{{ (row.milliseconds / 1000).toFixed(2) }} 秒</template>
          </el-table-column>
          <el-table-column label="结果" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'succeeded' ? 'success' : 'danger'" effect="light">
                {{ row.status === 'succeeded' ? '成功' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="error" label="原因" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.error || '—' }}</template>
          </el-table-column>
        </el-table>
        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="jobPage"
            :page-size="jobPageSize"
            :total="jobs.length"
            layout="total, prev, pager, next"
            background
          />
        </div>
        <p class="text-muted">不记录文件名、正文、访问令牌或私有云资料。</p>
      </el-card>
    </template>

    <el-dialog
      v-model="confirmReset"
      :title="state?.config.tokenConfigured ? '重置访问令牌' : '生成访问令牌'"
      width="420px"
    >
      <span>{{ state?.config.tokenConfigured ? '重置后手机原令牌失效，正在运行的任务会继续完成。' : '令牌只在生成后显示一次。' }}</span>
      <template #footer>
        <el-button @click="confirmReset = false">取消</el-button>
        <el-button type="primary" :loading="busy" @click="rotate">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      :model-value="Boolean(issuedToken)"
      title="保存新的访问令牌"
      width="480px"
      :close-on-click-modal="false"
      :show-close="false"
      @close="issuedToken = ''"
    >
      <p>此令牌仅显示一次，请复制到手机的文档转换配置。</p>
      <el-input :model-value="issuedToken" type="password" show-password readonly />
      <template #footer>
        <el-button type="primary" @click="copy(issuedToken)">复制访问令牌</el-button>
        <el-button @click="issuedToken = ''">已保存，关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchConverter, resetConverterToken, saveConverter, testConverter } from '@/api/admin'
import { runTask } from '@/utils/run'
import { useUserStore } from '@/stores/user'
import type { ConverterState } from '@/types'

const userStore = useUserStore()
const canWrite = computed(() => userStore.hasPerm('converter:write'))

const state = ref<ConverterState | null>(null)
const busy = ref(false)
const enabled = ref(false)
const concurrency = ref(1)
const search = ref('')
const jobPage = ref(1)
const jobPageSize = 10
const confirmReset = ref(false)
const issuedToken = ref('')
let disposed = false

const lastTestText = computed(() => {
  const last = state.value?.lastTest
  if (!last) return '尚未运行'
  return (last.passed ? '通过' : '失败') + ' · ' + new Date(last.finishedAt).toLocaleString('zh-CN', { hour12: false })
})

const jobs = computed(() => {
  const rows = state.value?.statistics?.recent || []
  const text = search.value.trim().toLowerCase()
  if (!text) return rows
  return rows.filter((row) =>
    [
      row.inputFormat,
      row.outputFormat,
      `${row.inputFormat} → ${row.outputFormat}`,
      row.status === 'succeeded' ? '成功' : '失败',
      row.status,
      row.error,
      new Date(row.startedAt).toLocaleString('zh-CN', { hour12: false })
    ]
      .join(' ')
      .toLowerCase()
      .includes(text)
  )
})

const pagedJobs = computed(() => jobs.value.slice((jobPage.value - 1) * jobPageSize, jobPage.value * jobPageSize))

watch(search, () => {
  jobPage.value = 1
})

function refresh() {
  void runTask(busy, async () => {
    const result = await fetchConverter()
    if (disposed) return
    state.value = result
    enabled.value = result.config.enabled
    concurrency.value = result.config.concurrency
  })
}

function save() {
  void runTask(busy, async () => {
    await saveConverter({ enabled: enabled.value, concurrency: concurrency.value })
    const result = await fetchConverter()
    if (!disposed) {
      state.value = result
      ElMessage.success('配置已保存并应用到转换服务')
    }
  })
}

function rotate() {
  confirmReset.value = false
  void runTask(busy, async () => {
    const result = await resetConverterToken()
    if (disposed) return
    issuedToken.value = result.token
    state.value = await fetchConverter()
  })
}

function test() {
  void runTask(busy, async () => {
    const result = await testConverter()
    if (disposed) return
    state.value = await fetchConverter()
    if (result.passed) {
      ElMessage.success('真实 DOC 转换、重开及中文前导零检查通过')
    } else {
      ElMessage.error('转换测试未通过')
    }
  })
}

async function copy(value: string) {
  if (!navigator.clipboard?.writeText) {
    ElMessage.error('浏览器不支持自动复制，请选择文本后手动复制')
    return
  }
  await navigator.clipboard.writeText(value)
  ElMessage.success('已复制')
}

onMounted(refresh)
onUnmounted(() => {
  disposed = true
  issuedToken.value = ''
})
</script>

<style scoped lang="scss">
.stat-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.stat-title {
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  line-height: 1.35;
}

.converter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.endpoint-row {
  display: flex;
  gap: 10px;
  width: 100%;
}

@media (max-width: 900px) {
  .stat-row,
  .converter-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
