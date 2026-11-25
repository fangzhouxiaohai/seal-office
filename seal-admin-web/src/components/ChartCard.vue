<template>
  <el-card shadow="never" class="chart-card">
    <template #header>
      <div class="chart-head">
        <div>
          <span class="chart-title">{{ title }}</span>
          <span v-if="subtitle" class="chart-subtitle">{{ subtitle }}</span>
        </div>
        <slot name="extra" />
      </div>
    </template>
    <div v-if="empty" class="chart-empty" :style="{ height: height + 'px' }">
      <el-icon :size="28"><DataAnalysis /></el-icon>
      <span>{{ emptyText }}</span>
    </div>
    <v-chart v-else-if="option" class="chart-body" :style="{ height: height + 'px' }" :option="option" autoresize />
    <slot />
  </el-card>
</template>

<script setup lang="ts">
import VChart from 'vue-echarts'
import { DataAnalysis } from '@element-plus/icons-vue'
import '@/utils/charts'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    option?: Record<string, any>
    height?: number
    empty?: boolean
    emptyText?: string
  }>(),
  { height: 280, empty: false, emptyText: '暂无数据' }
)
</script>

<style scoped lang="scss">
.chart-card {
  height: 100%;
  min-width: 0;
}

.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chart-title {
  font-weight: 600;
  color: var(--text-1);
}

.chart-subtitle {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-3);
}

.chart-body {
  width: 100%;
}

.chart-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-3);
  font-size: 13px;
}
</style>
