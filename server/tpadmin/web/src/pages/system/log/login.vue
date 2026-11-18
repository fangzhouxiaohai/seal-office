<!--
  登录日志。
  Author: qiufeng
-->
<template>
  <table-plus :columns="columns" :fetcher="listLoginLogs" :query="query" row-key="id">
    <template #search>
      <t-input v-model="query.username" placeholder="账号" clearable />
      <t-input v-model="query.ip" placeholder="IP" clearable />
      <t-select v-model="query.status" placeholder="结果" clearable>
        <t-option label="成功" :value="1" />
        <t-option label="失败" :value="0" />
      </t-select>
    </template>

    <template #status="{ row }">
      <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light" size="small">
        {{ row.status === 1 ? '成功' : '失败' }}
      </t-tag>
    </template>

    <template #message="{ row }">{{ row.message || '-' }}</template>
    <template #location="{ row }">{{ row.location || '-' }}</template>
    <template #create_time="{ row }">{{ formatDate(row.create_time) }}</template>
  </table-plus>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import TablePlus from '@/components/TablePlus.vue';
import { listLoginLogs } from '@/api/system/log';
import { formatDate } from '@/utils/date';

const query = reactive({ username: '', ip: '', status: '' as string | number });

const columns = [
  { colKey: 'username', title: '账号', width: 130 },
  { colKey: 'status', title: '结果', width: 90 },
  { colKey: 'message', title: '说明', width: 200 },
  { colKey: 'ip', title: 'IP', width: 140 },
  { colKey: 'location', title: '归属地', width: 140 },
  { colKey: 'user_agent', title: 'User-Agent', ellipsis: true },
  { colKey: 'create_time', title: '时间', width: 170 },
];
</script>
