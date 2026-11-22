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
          <el-input
            v-model="query"
            clearable
            placeholder="搜索标题、分类或说明"
            style="width: 280px"
          />
        </div>
        <div class="toolbar-right">
          <div class="segment-tabs" role="tablist" aria-label="审核状态">
            <button
              v-for="tab in statusTabs"
              :key="tab.value"
              type="button"
              role="tab"
              :aria-selected="status === tab.value"
              :class="{ active: status === tab.value }"
              @click="status = tab.value"
            >
              {{ tab.label }} <span>{{ tab.count }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="!filtered.length" class="review-empty" v-loading="busy">暂无匹配的公开内容</div>
      <div v-else class="review-grid" v-loading="busy">
        <el-card v-for="item in pagedRows" :key="item.id" shadow="hover" class="review-card">
          <div class="review-card__title" :title="item.title">{{ item.title }}</div>
          <p class="text-muted">{{ item.category || '未分类' }} · {{ statusLabels[item.status] || item.status }}</p>
          <p v-if="item.description" class="review-card__desc">{{ item.description }}</p>
          <el-button :disabled="busy" @click="openReview(item.id)">查看资料并审核</el-button>
        </el-card>
      </div>

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

    <el-dialog
      :model-value="Boolean(review)"
      title="公开内容审核"
      width="800px"
      :close-on-click-modal="false"
      @close="review = null"
    >
      <template v-if="review">
        <h2 class="review-dialog__title">{{ review.title }}</h2>
        <p>状态：{{ statusLabels[review.status] || review.status }}</p>
        <p class="text-muted">仅显示用户主动发布的公开资料，请检查原文件后决定是否发布。</p>
        <div class="review-dialog__actions">
          <el-button :disabled="busy || review.status === 'withdrawn'" @click="download">下载公开原文件检查</el-button>
        </div>
        <pre class="review-dialog__text">{{ review.text || '暂无文字预览，请下载公开文件检查。' }}</pre>
      </template>
      <template #footer>
        <template v-if="review && canReview">
          <el-button
            type="primary"
            :disabled="busy || ['withdrawn', 'approved'].includes(review.status)"
            @click="decide('approved')"
          >
            通过并公开
          </el-button>
          <el-button
            type="warning"
            :disabled="busy || ['withdrawn', 'rejected'].includes(review.status)"
            @click="decide('rejected')"
          >
            拒绝发布
          </el-button>
          <el-button type="danger" :disabled="busy || review.status === 'withdrawn'" @click="confirmWithdraw">
            下架
          </el-button>
        </template>
        <el-button @click="review = null">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { downloadPublication, fetchOverview, fetchPublication, reviewPublication } from '@/api/admin'
import { runTask } from '@/utils/run'
import { useUserStore } from '@/stores/user'
import type { Publication, PublicationDetail } from '@/types'

const props = defineProps<{ section: 'template' | 'knowledge' | 'skin' }>()
const userStore = useUserStore()

const titles: Record<string, [string, string]> = {
  template: ['演示模板审核', '审核用户主动发布的演示模板'],
  knowledge: ['知识内容审核', '审核用户主动发布的知识资料'],
  skin: ['皮肤审核', '审核用户主动发布的界面皮肤']
}
const title = computed(() => titles[props.section][0])
const subtitle = computed(() => titles[props.section][1])

const statusLabels: Record<string, string> = {
  pending: '待审核',
  approved: '已公开',
  rejected: '已拒绝',
  withdrawn: '已撤回'
}

const rows = ref<Publication[]>([])
const busy = ref(false)
const query = ref('')
const status = ref('all')
const page = ref(1)
const pageSize = 12
const review = ref<(Publication & Partial<PublicationDetail>) | null>(null)
// 防止详情请求在组件卸载或会话变更后回填
let reviewEpoch = 0

const canReview = computed(() => userStore.hasPerm(`${props.section}:review`))

// 状态页签带上当前分类下的数量
const statusTabs = computed(() =>
  [{ value: 'all', label: '全部' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))].map(
    (tab) => ({
      ...tab,
      count: rows.value.filter(
        (row) => row.kind === props.section && (tab.value === 'all' || row.status === tab.value)
      ).length
    })
  )
)

const filtered = computed(() => {
  const text = query.value.trim().toLowerCase()
  return rows.value.filter(
    (row) =>
      row.kind === props.section &&
      (status.value === 'all' || row.status === status.value) &&
      [row.title, row.category, row.description].join(' ').toLowerCase().includes(text)
  )
})

const pagedRows = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

watch([query, status], () => {
  page.value = 1
})

function refresh() {
  void runTask(busy, async () => {
    const result = await fetchOverview()
    if (!Array.isArray(result.publications)) throw new Error(`无权查看${title.value}`)
    rows.value = result.publications
  })
}

function openReview(id: string) {
  const requestId = ++reviewEpoch
  void runTask(busy, async () => {
    const detail = await fetchPublication(id)
    const item = rows.value.find((row) => row.id === id)
    if (!item) throw new Error('所选公开资料已不存在，请刷新列表')
    if (detail.id !== item.id) throw new Error('资料详情与所选记录不一致')
    if (requestId === reviewEpoch) review.value = { ...item, ...detail, status: item.status }
  })
}

function decide(next: 'approved' | 'rejected' | 'withdrawn') {
  void runTask(busy, async () => {
    if (!review.value) return
    await reviewPublication(review.value.id, next)
    review.value = null
    await reload()
  })
}

async function reload() {
  const result = await fetchOverview()
  rows.value = result.publications || []
}

async function confirmWithdraw() {
  try {
    await ElMessageBox.confirm('下架会清除该公开资料的原文件，操作后无法从后台恢复。确定继续吗？', '确认下架公开资料', {
      type: 'warning',
      confirmButtonText: '确认下架',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  decide('withdrawn')
}

function download() {
  void runTask(busy, async () => {
    if (!review.value) return
    await downloadPublication(review.value.id, review.value.name || review.value.title)
  })
}

onMounted(refresh)
onUnmounted(() => {
  reviewEpoch++
  review.value = null
})
</script>

<style scoped lang="scss">
.review-empty {
  padding: 48px;
  text-align: center;
  color: var(--text-3);
}

.review-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.review-card__title {
  font-weight: 600;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.review-card__desc {
  color: var(--text-2);
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 34px;
}

.review-dialog__title {
  margin: 0 0 8px;
  font-size: 18px;
}

.review-dialog__actions {
  margin: 12px 0;
}

.review-dialog__text {
  white-space: pre-wrap;
  max-height: 40vh;
  overflow: auto;
  padding: 16px;
  background: #f7f8fb;
  border-radius: 8px;
  overflow-wrap: anywhere;
  margin: 0;
  font-size: 13px;
}
</style>
