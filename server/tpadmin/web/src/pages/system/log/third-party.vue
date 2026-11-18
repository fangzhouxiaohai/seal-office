<!--
  第三方请求日志(Tools::httpRequest 出站请求记录)。
  Author: qiufeng
-->
<template>
  <table-plus :columns="columns" :fetcher="listThirdPartyLogs" :query="query" row-key="id">
    <template #search>
      <t-input v-model="query.host" placeholder="目标主机" clearable />
      <t-select v-model="query.ok" placeholder="结果" clearable>
        <t-option label="成功" :value="1" />
        <t-option label="失败" :value="0" />
      </t-select>
    </template>

    <template #method="{ row }">
      <t-tag variant="light" size="small">{{ row.method }}</t-tag>
    </template>

    <template #ok="{ row }">
      <t-tag :theme="row.ok ? 'success' : 'danger'" variant="light" size="small">
        {{ row.ok ? '成功' : '失败' }}
      </t-tag>
    </template>

    <template #status="{ row }">{{ row.status || '-' }}</template>
    <template #duration_ms="{ row }">{{ row.duration_ms }} ms</template>
    <template #response_size="{ row }">{{ formatSize(row.response_size) }}</template>
    <template #error="{ row }">{{ row.error || '-' }}</template>
    <template #create_time="{ row }">{{ formatDate(row.create_time) }}</template>
  </table-plus>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import TablePlus from '@/components/TablePlus.vue';
import { listThirdPartyLogs } from '@/api/system/log';
import { formatDate } from '@/utils/date';
import { formatSize } from '@/utils/file';

const query = reactive({ host: '', ok: '' as string | number });

const columns = [
  { colKey: 'method', title: '方法', width: 90 },
  { colKey: 'host', title: '目标主机', width: 220 },
  { colKey: 'url', title: 'URL', minWidth: 240, ellipsis: true },
  { colKey: 'ok', title: '结果', width: 80 },
  { colKey: 'status', title: '状态码', width: 90 },
  { colKey: 'duration_ms', title: '耗时', width: 90 },
  { colKey: 'response_size', title: '响应大小', width: 100 },
  { colKey: 'error', title: '错误', width: 200, ellipsis: true },
  { colKey: 'create_time', title: '时间', width: 170 },
];
</script>
