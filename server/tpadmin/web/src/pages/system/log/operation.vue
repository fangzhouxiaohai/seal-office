<!--
  操作日志:筛选 + 详情弹窗(请求参数)。
  Author: qiufeng
-->
<template>
  <table-plus ref="tableRef" :columns="columns" :fetcher="listOperationLogs" :query="query" row-key="id">
    <template #search>
      <t-input v-model="query.username" placeholder="操作人" clearable />
      <t-input v-model="query.path" placeholder="请求路径" clearable />
      <t-input v-model="query.request_id" placeholder="请求 ID" clearable />
      <t-date-range-picker v-model="timeRange" enable-time-picker clearable @change="onTimeChange" />
    </template>

    <template #method="{ row }">
      <t-tag :theme="METHOD_THEME[row.method] ?? 'default'" variant="light" size="small">{{ row.method }}</t-tag>
    </template>

    <template #status_code="{ row }">
      <t-tag :theme="row.status_code < 400 ? 'success' : 'danger'" variant="light" size="small">
        {{ row.status_code }}
      </t-tag>
    </template>

    <template #duration_ms="{ row }">{{ row.duration_ms }} ms</template>
    <template #create_time="{ row }">{{ formatDate(row.create_time) }}</template>

    <template #op="{ row }">
      <t-link theme="primary" @click="openDetail(row)">详情</t-link>
    </template>
  </table-plus>

  <t-dialog v-model:visible="detailVisible" header="操作详情" width="640px" :footer="false">
    <t-descriptions v-if="current" :column="1" bordered size="small">
      <t-descriptions-item label="操作人">{{ current.username }}(ID: {{ current.user_id }})</t-descriptions-item>
      <t-descriptions-item label="请求">{{ current.method }} {{ current.path }}</t-descriptions-item>
      <t-descriptions-item label="权限标识">{{ current.permission || '-' }}</t-descriptions-item>
      <t-descriptions-item label="状态 / 耗时">{{ current.status_code }} / {{ current.duration_ms }} ms</t-descriptions-item>
      <t-descriptions-item label="IP">{{ current.ip }}</t-descriptions-item>
      <t-descriptions-item label="请求 ID">{{ current.request_id }}</t-descriptions-item>
      <t-descriptions-item label="User-Agent">{{ current.user_agent }}</t-descriptions-item>
      <t-descriptions-item label="参数">
        <pre class="params-pre">{{ prettyParams }}</pre>
      </t-descriptions-item>
      <t-descriptions-item label="时间">{{ formatDate(current.create_time) }}</t-descriptions-item>
    </t-descriptions>
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import TablePlus, { type TablePlusExpose } from '@/components/TablePlus.vue';
import { listOperationLogs, type OperationLog } from '@/api/system/log';
import { formatDate } from '@/utils/date';

const METHOD_THEME: Record<string, 'primary' | 'success' | 'warning' | 'danger'> = {
  GET: 'primary', POST: 'success', PUT: 'warning', DELETE: 'danger',
};

const tableRef = ref<TablePlusExpose>();
const query = reactive({ username: '', path: '', request_id: '', start_time: '', end_time: '' });
const timeRange = ref<string[]>([]);

function onTimeChange(): void {
  query.start_time = timeRange.value?.[0] ?? '';
  query.end_time = timeRange.value?.[1] ?? '';
}

const columns = [
  { colKey: 'username', title: '操作人', width: 110 },
  { colKey: 'method', title: '方法', width: 90 },
  { colKey: 'path', title: '路径', minWidth: 220 },
  { colKey: 'permission', title: '权限标识', width: 200 },
  { colKey: 'status_code', title: '状态', width: 80 },
  { colKey: 'duration_ms', title: '耗时', width: 90 },
  { colKey: 'ip', title: 'IP', width: 130 },
  { colKey: 'create_time', title: '时间', width: 170 },
  { colKey: 'op', title: '操作', width: 80, fixed: 'right' as const },
];

const detailVisible = ref(false);
const current = ref<OperationLog | null>(null);

const prettyParams = computed(() => {
  try {
    return JSON.stringify(JSON.parse(current.value?.params ?? '{}'), null, 2);
  } catch {
    return current.value?.params ?? '';
  }
});

function openDetail(row: OperationLog): void {
  current.value = row;
  detailVisible.value = true;
}
</script>

<style scoped>
.params-pre {
  max-height: 200px;
  margin: 0;
  overflow: auto;
  font-size: 12px;
}
</style>
