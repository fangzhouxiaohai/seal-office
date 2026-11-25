<template>
  <div class="page-container">
    <header class="page-heading">
      <div>
        <h1>数据概览</h1>
        <p>用户增长、云空间使用、内容审核与服务运行的整体情况{{ stats ? ' · 更新于 ' + stamp(stats.generated) : '' }}</p>
      </div>
      <div class="page-actions">
        <el-button :loading="busy" :icon="Refresh" @click="refresh">刷新数据</el-button>
      </div>
    </header>

    <el-skeleton v-if="!stats && busy" :rows="12" animated />

    <template v-if="stats">
      <!-- 核心指标 -->
      <div class="kpi-row">
        <div v-for="item in kpis" :key="item.label" class="kpi-card">
          <span class="kpi-icon" :class="`is-${item.tint}`">
            <el-icon :size="20"><component :is="item.icon" /></el-icon>
          </span>
          <div class="kpi-meta">
            <span class="kpi-label">{{ item.label }}</span>
            <strong class="kpi-value">{{ item.value }}</strong>
            <span class="kpi-hint">{{ item.hint }}</span>
          </div>
        </div>
      </div>

      <!-- 用户趋势 + 云空间开通 -->
      <div class="grid grid-2-1">
        <ChartCard title="用户趋势" subtitle="近 30 天每日新增注册与活跃用户" :option="userTrend" :height="300" />
        <ChartCard title="云空间开通" subtitle="已注册账号中开通云空间的比例" :option="spacePie" :height="300" :empty="!k.users" />
      </div>

      <!-- 累计用户 + 上传量 -->
      <div class="grid grid-1-1">
        <ChartCard title="累计用户" subtitle="近 30 天注册账号总数" :option="totalTrend" :height="260" />
        <ChartCard title="云端上传" subtitle="近 30 天每日保存的文件版本数" :option="uploadBar" :height="260" />
      </div>

      <!-- 活跃时段 / 操作排行 / 上传容量 -->
      <div class="grid grid-3">
        <ChartCard title="活跃时段" subtitle="近 7 天各小时操作次数" :option="hourlyBar" :height="260" />
        <ChartCard title="一周分布" subtitle="近 7 天按星期统计操作次数" :option="weekdayBar" :height="260" />
        <ChartCard title="操作类型排行" subtitle="近 30 天" :option="actionBar" :height="260" :empty="!stats.actions.length" />
      </div>

      <!-- 公开内容 -->
      <div class="grid grid-3">
        <ChartCard title="公开内容类型" subtitle="演示模板、知识与皮肤" :option="kindPie" :height="260" :empty="!k.publications" />
        <ChartCard title="审核状态" subtitle="全部公开申请" :option="statusPie" :height="260" :empty="!k.publications" />
        <ChartCard title="在架版本" subtitle="按平台统计未下架的发布" :option="releasePie" :height="260" :empty="!k.releases" />
      </div>

      <!-- 存储 -->
      <div class="grid grid-2-1">
        <ChartCard title="存储占用排行" subtitle="占用最多的 10 个账号（含历史版本与回收站）" :option="storageBar" :height="300" :empty="!stats.storage.top.length" />
        <ChartCard title="账号存储分布" subtitle="按单个账号占用分段" :option="bucketPie" :height="300" :empty="!k.users" />
      </div>

      <!-- 协作与运行 -->
      <div class="grid grid-1-1">
        <el-card shadow="never">
          <template #header>
            <div class="panel-head"><span class="panel-title">协作与终端</span></div>
          </template>
          <div class="mini-grid">
            <div v-for="item in collaboration" :key="item.label" class="mini">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header>
            <div class="panel-head">
              <span class="panel-title">服务运行</span>
              <el-tag type="success" effect="light" round>
                <el-icon class="tag-icon"><CircleCheckFilled /></el-icon>运行中
              </el-tag>
            </div>
          </template>
          <div class="meter">
            <div class="meter-head">
              <span>数据磁盘</span>
              <span>已用 {{ bytes(diskUsed) }} / 共 {{ bytes(runtime.diskTotal) }}</span>
            </div>
            <el-progress :percentage="diskPercent" :stroke-width="10" :show-text="false" :color="diskPercent >= 85 ? '#dc3c3d' : '#257de0'" />
            <span class="meter-foot">剩余 {{ bytes(runtime.diskFree) }}{{ diskPercent >= 85 ? ' · 空间偏紧，请及时清理' : '' }}</span>
          </div>
          <div class="mini-grid compact">
            <div class="mini">
              <span>进程内存</span>
              <strong>{{ bytes(runtime.memory) }}</strong>
            </div>
            <div class="mini">
              <span>连续运行</span>
              <strong>{{ uptime(runtime.uptime) }}</strong>
            </div>
            <div class="mini">
              <span>待提交上传</span>
              <strong>{{ runtime.pendingUploads }}</strong>
            </div>
            <div class="mini">
              <span>每账号配额</span>
              <strong>{{ bytes(k.quota) }}</strong>
            </div>
          </div>
          <div class="privacy-note">
            <el-icon><Lock /></el-icon>
            <span>私有文档保持客户端加密，统计只含数量与容量，管理后台不提供解密入口。</span>
          </div>
        </el-card>
      </div>

      <el-card v-if="shortcuts.length" shadow="never">
        <template #header>
          <div class="panel-head">
            <span class="panel-title">常用功能 <small class="text-muted">快速访问业务管理</small></span>
          </div>
        </template>
        <div class="shortcut-grid">
          <router-link v-for="item in shortcuts" :key="item.key" :to="'/' + item.key" class="shortcut">
            <span class="shortcut-icon">
              <el-icon :size="18"><component :is="menuIcon(item.icon)" /></el-icon>
            </span>
            <span>{{ item.title }}</span>
          </router-link>
        </div>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  CircleCheckFilled,
  Document,
  Folder,
  Lock,
  Refresh,
  Stamp,
  TrendCharts,
  User,
  UserFilled
} from '@element-plus/icons-vue'
import ChartCard from '@/components/ChartCard.vue'
import { fetchDashboardStats } from '@/api/admin'
import { runTask } from '@/utils/run'
import { stamp } from '@/utils/format'
import { actionLabels } from '@/utils/auditText'
import { menuIcon } from '@/utils/icons'
import { SERIES, barOption, bytes, lineOption, pieOption, uptime } from '@/utils/charts'
import { menuKey, useUserStore } from '@/stores/user'
import type { CountItem, DashboardStats } from '@/types'

const userStore = useUserStore()
const stats = ref<DashboardStats>()
const busy = ref(false)

const k = computed(() => stats.value!.kpis)
const runtime = computed(() => stats.value!.runtime)
const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0)

const kpis = computed(() => {
  const v = k.value
  return [
    { label: '注册用户', value: v.users.toLocaleString(), hint: `今日新增 ${v.newUsersToday} · 近 7 天 ${v.newUsers7d}`, icon: User, tint: 'blue' },
    { label: '7 日活跃', value: v.activeUsers7d.toLocaleString(), hint: `占注册用户 ${percent(v.activeUsers7d, v.users)}%`, icon: TrendCharts, tint: 'green' },
    { label: '云空间开通', value: v.spaceUsers.toLocaleString(), hint: `开通率 ${percent(v.spaceUsers, v.users)}%`, icon: UserFilled, tint: 'purple' },
    { label: '存储占用', value: bytes(v.storageUsed), hint: '含历史版本与回收站', icon: Folder, tint: 'orange' },
    { label: '云端文件', value: v.files.toLocaleString(), hint: `${v.versions.toLocaleString()} 个版本 · 今日上传 ${v.uploadsToday}`, icon: Document, tint: 'aqua' },
    { label: '待审核', value: v.pendingReviews.toLocaleString(), hint: `公开内容共 ${v.publications}`, icon: Stamp, tint: v.pendingReviews ? 'red' : 'gray' }
  ]
})

const collaboration = computed(() => {
  const v = k.value
  return [
    { label: '文件夹', value: v.folders.toLocaleString() },
    { label: '回收站条目', value: v.trashed.toLocaleString() },
    { label: '文档共享', value: v.shares.toLocaleString() },
    { label: '分享链接', value: v.shareLinks.toLocaleString() },
    { label: '协作团队', value: v.teams.toLocaleString() },
    { label: '登录终端', value: v.devices.toLocaleString() },
    { label: '24 小时在线终端', value: v.onlineDevices24h.toLocaleString() },
    { label: '今日操作', value: v.operationsToday.toLocaleString() }
  ]
})

const diskUsed = computed(() => Math.max(0, runtime.value.diskTotal - runtime.value.diskFree))
const diskPercent = computed(() => percent(diskUsed.value, runtime.value.diskTotal))

const t = computed(() => stats.value!.trend)
const userTrend = computed(() =>
  lineOption(t.value.days, [
    { name: '活跃用户', data: t.value.activeUsers, color: SERIES[0], area: true },
    { name: '新增注册', data: t.value.newUsers, color: SERIES[1] }
  ])
)
const totalTrend = computed(() => lineOption(t.value.days, [{ name: '累计用户', data: t.value.totalUsers, color: SERIES[6], area: true }]))
const uploadBar = computed(() => barOption(t.value.days, [{ name: '上传版本', data: t.value.uploads, color: SERIES[2] }]))

const hours = Array.from({ length: 24 }, (_, i) => `${i}时`)
const hourlyBar = computed(() => barOption(hours, [{ name: '操作次数', data: stats.value!.hourly, color: SERIES[0] }]))
const weekdayBar = computed(() =>
  barOption(['周一', '周二', '周三', '周四', '周五', '周六', '周日'], [{ name: '操作次数', data: stats.value!.weekday, color: SERIES[6] }])
)
const actionBar = computed(() => {
  const rows = stats.value!.actions.slice(0, 8)
  return barOption(
    rows.map((row) => actionLabels[String(row.action)] || String(row.action)),
    [{ name: '次数', data: rows.map((row) => row.count), color: SERIES[0] }],
    { horizontal: true }
  )
})

const kindNames: Record<string, string> = { template: '演示模板', knowledge: '知识内容', skin: '界面皮肤' }
const statusNames: Record<string, string> = { pending: '待审核', approved: '已公开', rejected: '已拒绝', withdrawn: '已撤回' }
const platformNames: Record<string, string> = { windows: 'Windows', linux: 'Linux', macos: 'macOS', android: 'Android', harmony: 'HarmonyOS', web: '网页版' }

// 颜色跟随实体：每个取值固定一个分类色位，筛选后不重新着色
function fixedPie(rows: CountItem[], key: string, names: Record<string, string>) {
  const order = Object.keys(names)
  const sorted = [...rows].sort((a, b) => order.indexOf(String(a[key])) - order.indexOf(String(b[key])))
  return pieOption(
    sorted.map((row) => ({ name: names[String(row[key])] || String(row[key]), value: row.count })),
    sorted.map((row) => {
      const index = order.indexOf(String(row[key]))
      return SERIES[index >= 0 ? index : SERIES.length - 1]
    })
  )
}

const kindPie = computed(() => fixedPie(stats.value!.publicationKinds, 'kind', kindNames))
const statusPie = computed(() => fixedPie(stats.value!.publicationStatus, 'status', statusNames))
const releasePie = computed(() => fixedPie(stats.value!.releasePlatforms, 'platform', platformNames))
const spacePie = computed(() =>
  pieOption(
    [
      { name: '已开通', value: k.value.spaceUsers },
      { name: '未开通', value: Math.max(0, k.value.users - k.value.spaceUsers) }
    ],
    [SERIES[0], '#c9d2de']
  )
)
const storageBar = computed(() => {
  const rows = stats.value!.storage.top
  return barOption(
    rows.map((row) => row.phone),
    [{ name: '占用', data: rows.map((row) => row.used), color: SERIES[1] }],
    { horizontal: true, formatter: bytes }
  )
})
const bucketPie = computed(() =>
  pieOption(
    stats.value!.storage.buckets.map((row) => ({ name: String(row.label), value: row.count })),
    ['#c9d2de', SERIES[0], SERIES[2], SERIES[3], SERIES[1]]
  )
)

// 快捷入口取会话菜单，排除概览自身
const shortcuts = computed(() =>
  userStore.menus
    .map((menu) => ({ key: menuKey(menu), title: menu.title, icon: menu.icon }))
    .filter((item) => item.key && item.key !== 'overview')
)

function refresh() {
  void runTask(busy, async () => {
    stats.value = await fetchDashboardStats()
  })
}

onMounted(refresh)
</script>

<style scoped lang="scss">
.kpi-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.kpi-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 18px 16px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}

.kpi-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;

  &.is-blue { color: #257de0; background: rgba(37, 125, 224, 0.1); }
  &.is-green { color: #0a8f1f; background: rgba(10, 172, 35, 0.1); }
  &.is-purple { color: #6a5cf5; background: rgba(106, 92, 245, 0.12); }
  &.is-orange { color: #d65a1a; background: rgba(244, 114, 48, 0.12); }
  &.is-aqua { color: #00937a; background: rgba(0, 184, 148, 0.12); }
  &.is-red { color: #dc3c3d; background: rgba(220, 60, 61, 0.1); }
  &.is-gray { color: #8c9bab; background: #f1f4f8; }
}

.kpi-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.kpi-label {
  font-size: 13px;
  color: var(--text-2);
}

.kpi-value {
  font-size: 24px;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.kpi-hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

.grid {
  display: grid;
  gap: 16px;
  margin-bottom: 16px;
}

.grid-2-1 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
.grid-1-1 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  font-weight: 600;
}

.tag-icon {
  margin-right: 4px;
  vertical-align: -2px;
}

.mini-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  &.compact {
    margin: 16px 0;
  }
}

.mini {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  background: #f7f8fb;
  border-radius: 8px;
  min-width: 0;

  span {
    font-size: 12px;
    color: var(--text-2);
  }

  strong {
    font-size: 20px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
}

.meter {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meter-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--text-2);

  span:first-child {
    font-weight: 600;
    color: var(--text-1);
  }
}

.meter-foot {
  font-size: 12px;
  color: var(--text-3);
}

.privacy-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-2);
  background: var(--brand-soft);
  border-radius: 8px;

  .el-icon {
    color: var(--brand);
  }
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.shortcut {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 14px 16px;
  color: var(--text-1);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: #f8f7ff;
    border-color: #cfc7fb;
  }
}

.shortcut-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--brand);
  background: var(--brand-soft);
  border-radius: 8px;
}

@media (max-width: 1500px) {
  .kpi-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 1100px) {
  .kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid-2-1,
  .grid-1-1,
  .grid-3 { grid-template-columns: minmax(0, 1fr); }
  .shortcut-grid,
  .mini-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 600px) {
  .kpi-row,
  .shortcut-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
