<!--
  代码生成器:选表 → 逐字段配置(列表/搜索/表单/控件)→ 预览代码 → 一键生成
  (后端 VO/Service/Controller + 前端 API/页面 + 菜单种子)。
  Author: qiufeng
-->
<template>
  <t-card :bordered="false">
    <t-alert
      theme="info"
      class="tip"
      message="选择数据库表,逐字段配置后预览并生成 CRUD 全套代码。生成后在服务器执行 php bin/console seed 写入菜单,重新登录即可使用。"
    />

    <div class="toolbar">
      <t-button variant="outline" :loading="loading" @click="loadTables">
        <template #icon><refresh-icon /></template>刷新表列表
      </t-button>
    </div>

    <t-table row-key="name" :data="tables" :columns="tableColumns" :loading="loading">
      <template #op="{ row }">
        <t-button size="small" theme="primary" @click="openConfig(row)">
          <template #icon><setting-icon /></template>配置生成
        </t-button>
      </template>
    </t-table>
  </t-card>

  <!-- 字段配置抽屉 -->
  <t-drawer
    v-model:visible="configVisible"
    :header="`配置生成:${current?.name ?? ''}`"
    size="920px"
    :footer="false"
  >
    <div class="config-body">
      <t-form label-width="90px" class="title-form">
        <t-form-item label="业务标题" help="用于菜单名称、控制器注释、页面标题">
          <t-input v-model="title" placeholder="如 演示商品" style="width: 280px" />
        </t-form-item>
      </t-form>

      <p class="section-title">字段配置</p>
      <t-table row-key="name" :data="columns" :columns="fieldColumns" size="small" bordered :loading="columnsLoading">
        <template #label="{ row }">
          <t-input v-model="row.label" size="small" />
        </template>
        <template #list="{ row }">
          <t-switch v-model="row.list" size="small" />
        </template>
        <template #search="{ row }">
          <t-switch v-model="row.search" size="small" />
        </template>
        <template #search_type="{ row }">
          <t-select v-model="row.search_type" size="small" :disabled="!row.search" style="width: 96px">
            <t-option label="模糊" value="like" />
            <t-option label="精确" value="eq" />
            <t-option label="区间(时间)" value="between" />
          </t-select>
        </template>
        <template #form="{ row }">
          <t-switch v-model="row.form" size="small" :disabled="row.system" />
        </template>
        <template #component="{ row }">
          <t-select v-model="row.component" size="small" style="width: 130px">
            <t-option v-for="c in COMPONENT_OPTIONS" :key="c.value" :label="c.label" :value="c.value" />
          </t-select>
        </template>
      </t-table>

      <div class="config-actions">
        <t-checkbox v-model="force">覆盖已生成文件</t-checkbox>
        <div class="spacer" />
        <t-button variant="outline" :loading="previewing" @click="onPreview">
          <template #icon><code-icon /></template>预览代码
        </t-button>
        <t-button theme="primary" :loading="generating" @click="onGenerate">
          <template #icon><check-icon /></template>生成
        </t-button>
      </div>
    </div>
  </t-drawer>

  <!-- 代码预览 -->
  <t-dialog v-model:visible="previewVisible" header="代码预览" width="1000px" :footer="false">
    <t-tabs v-model="activeTab">
      <t-tab-panel v-for="(f, i) in previewFiles" :key="f.display" :value="i" :label="shortName(f.display)">
        <div class="code-path">{{ f.display }}</div>
        <pre class="code-block"><code>{{ f.content }}</code></pre>
      </t-tab-panel>
    </t-tabs>
    <div class="preview-footer">
      <t-checkbox v-model="force">覆盖已生成文件</t-checkbox>
      <t-button theme="primary" :loading="generating" @click="onGenerate">确认生成</t-button>
    </div>
  </t-dialog>

  <!-- 生成结果 -->
  <t-dialog v-model:visible="resultVisible" header="生成结果" :footer="false" width="660px">
    <p class="result-summary">已处理 {{ result.length }} 个文件:</p>
    <ul class="file-list">
      <li v-for="f in result" :key="f" :class="{ skipped: f.includes('跳过') }">{{ f }}</li>
    </ul>
    <t-alert
      theme="warning"
      message="在服务器执行 php bin/console seed 写入菜单后,重新登录即可在左侧看到新生成的页面。"
    />
  </t-dialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { RefreshIcon, SettingIcon, CodeIcon, CheckIcon } from 'tdesign-icons-vue-next';
import {
  listGenTables, getGenColumns, previewGenerate, runGenerate,
  type GenTable, type GenColumn, type GenFile,
} from '@/api/system/generator';

const COMPONENT_OPTIONS = [
  { label: '输入框', value: 'input' },
  { label: '多行文本', value: 'textarea' },
  { label: '数字', value: 'number' },
  { label: '金额(存分,按元显示)', value: 'money' },
  { label: '开关(status 启用/禁用,其他是/否)', value: 'switch' },
  { label: '日期时间', value: 'datetime' },
];

// ---- 表列表 ----
const tables = ref<GenTable[]>([]);
const loading = ref(false);

const tableColumns = [
  { colKey: 'name', title: '表名', width: 240 },
  { colKey: 'comment', title: '注释', minWidth: 160 },
  { colKey: 'rows', title: '行数', width: 100 },
  { colKey: 'columns', title: '字段数', width: 100 },
  { colKey: 'op', title: '操作', width: 140, fixed: 'right' as const },
];

async function loadTables(): Promise<void> {
  loading.value = true;
  try {
    tables.value = await listGenTables();
  } finally {
    loading.value = false;
  }
}

onMounted(loadTables);

// ---- 配置抽屉 ----
const configVisible = ref(false);
const current = ref<GenTable | null>(null);
const title = ref('');
const force = ref(false);
const columns = ref<GenColumn[]>([]);
const columnsLoading = ref(false);

const fieldColumns = [
  { colKey: 'name', title: '字段', width: 150 },
  { colKey: 'label', title: '显示名', width: 140 },
  { colKey: 'list', title: '列表', width: 70, align: 'center' as const },
  { colKey: 'search', title: '搜索', width: 70, align: 'center' as const },
  { colKey: 'search_type', title: '搜索方式', width: 110 },
  { colKey: 'form', title: '表单', width: 70, align: 'center' as const },
  { colKey: 'component', title: '表单控件', width: 150 },
];

async function openConfig(row: GenTable): Promise<void> {
  current.value = row;
  title.value = row.comment || '';
  force.value = false;
  configVisible.value = true;
  columnsLoading.value = true;
  try {
    columns.value = await getGenColumns(row.name);
  } finally {
    columnsLoading.value = false;
  }
}

// ---- 预览 ----
const previewVisible = ref(false);
const previewing = ref(false);
const previewFiles = ref<GenFile[]>([]);
const activeTab = ref(0);

function shortName(display: string): string {
  return display.split('/').pop() ?? display;
}

async function onPreview(): Promise<void> {
  if (!title.value.trim()) {
    MessagePlugin.warning('请填写业务标题');
    return;
  }
  previewing.value = true;
  try {
    previewFiles.value = await previewGenerate(current.value!.name, title.value.trim(), columns.value);
    activeTab.value = 0;
    previewVisible.value = true;
  } finally {
    previewing.value = false;
  }
}

// ---- 生成 ----
const generating = ref(false);
const resultVisible = ref(false);
const result = ref<string[]>([]);

async function onGenerate(): Promise<void> {
  if (!title.value.trim()) {
    MessagePlugin.warning('请填写业务标题');
    return;
  }
  generating.value = true;
  try {
    const res = await runGenerate(current.value!.name, title.value.trim(), columns.value, force.value);
    result.value = res.files;
    MessagePlugin.success('生成完成');
    previewVisible.value = false;
    configVisible.value = false;
    resultVisible.value = true;
  } finally {
    generating.value = false;
  }
}
</script>

<style scoped>
.tip {
  margin-bottom: 16px;
}

.toolbar {
  margin-bottom: 12px;
}

.config-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  margin: 8px 0 0;
  font-weight: 600;
}

.config-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--td-component-stroke);
}

.config-actions .spacer {
  flex: 1;
}

.code-path {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.code-block {
  max-height: 460px;
  margin: 0;
  padding: 12px 16px;
  overflow: auto;
  background: var(--td-bg-color-code, #1e1e1e);
  border-radius: 6px;
}

.code-block code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  color: #d4d4d4;
  white-space: pre;
}

.preview-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  margin-top: 12px;
}

.result-summary {
  margin: 0 0 8px;
  font-weight: 600;
}

.file-list {
  margin: 0 0 16px;
  padding-left: 20px;
  line-height: 1.9;
  font-family: monospace;
  font-size: 13px;
}

.file-list .skipped {
  color: var(--td-text-color-placeholder);
}
</style>
