<!--
  TablePlus 通用分页表格:搜索区 + 工具栏 + 表格 + 分页,一个 fetcher 函数搞定数据加载。

  用法:
    <table-plus ref="tableRef" :columns="columns" :fetcher="listUsers" :query="query">
      <template #search>(搜索表单项,v-model 绑定父组件的 query)</template>
      <template #toolbar>(左上角按钮)</template>
      <template #状态等列槽名="{ row }">(自定义单元格,槽名 = colKey)</template>
    </table-plus>
  父组件通过 ref 调 reload()(回第一页)/ refresh()(留在当前页)。
  Author: qiufeng
-->
<template>
  <div class="table-plus">
    <t-card v-if="$slots.search" :bordered="false" class="search-card">
      <div class="search-row">
        <slot name="search" />
        <div class="search-actions">
          <t-button theme="primary" @click="reload">
            <template #icon><search-icon /></template>查询
          </t-button>
          <t-button variant="outline" @click="onReset">
            <template #icon><refresh-icon /></template>重置
          </t-button>
        </div>
      </div>
    </t-card>

    <t-card :bordered="false">
      <div v-if="$slots.toolbar" class="toolbar">
        <slot name="toolbar" />
      </div>

      <t-table
        :data="data"
        :columns="columns"
        :row-key="rowKey"
        :loading="loading"
        :pagination="paginationConfig"
        @page-change="onPageChange"
      >
        <template v-for="(_, name) in $slots" #[name]="scope">
          <slot :name="name" v-bind="scope" />
        </template>
      </t-table>
    </t-card>
  </div>
</template>

<script lang="ts">
/** ref 引用类型:const tableRef = ref<TablePlusExpose>() */
export interface TablePlusExpose {
  /** 查询:回到第一页 */
  reload: () => void;
  /** 刷新:停留当前页 */
  refresh: () => void;
}
</script>

<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, onMounted, ref } from 'vue';
import { SearchIcon, RefreshIcon } from 'tdesign-icons-vue-next';
import type { PageInfo, TableProps } from 'tdesign-vue-next';
import type { PageResult } from '@/types/api';

const props = withDefaults(
  defineProps<{
    /** 列配置(TDesign 原生) */
    columns: TableProps['columns'];
    /** 数据加载函数:收到 {page, page_size, ...query},返回 PageResult */
    fetcher: (params: Record<string, unknown>) => Promise<PageResult<T>>;
    /** 搜索条件对象(父组件持有,查询/重置时使用) */
    query?: Record<string, unknown>;
    rowKey?: string;
    pageSize?: number;
  }>(),
  { query: () => ({}), rowKey: 'id', pageSize: 20 },
);

const data = ref<T[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(props.pageSize);
const total = ref(0);

const paginationConfig = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showJumper: true,
}));

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await props.fetcher({ page: page.value, page_size: pageSize.value, ...props.query });
    data.value = result.list;
    total.value = result.pagination.total;
  } finally {
    loading.value = false;
  }
}

/** 查询:回到第一页 */
function reload(): void {
  page.value = 1;
  load();
}

/** 刷新:停留当前页(编辑/删除后用) */
function refresh(): void {
  load();
}

function onReset(): void {
  // 清空父组件的搜索条件后重查
  for (const key of Object.keys(props.query)) {
    (props.query as Record<string, unknown>)[key] = '';
  }
  reload();
}

function onPageChange(info: PageInfo): void {
  page.value = info.current;
  pageSize.value = info.pageSize;
  load();
}

onMounted(load);
defineExpose({ reload, refresh });
</script>

<style scoped>
.table-plus {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.search-row :deep(.t-input__wrap),
.search-row :deep(.t-select__wrap),
.search-row :deep(.t-select-input) {
  width: 200px;
}

/* 日期区间放两个日期,200px 放不下 */
.search-row :deep(.t-range-input) {
  width: 280px;
}

.search-actions {
  display: flex;
  gap: 8px;
}

.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
</style>
