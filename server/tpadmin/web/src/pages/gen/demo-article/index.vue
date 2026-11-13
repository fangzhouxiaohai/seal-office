<!--
  演示文章管理(代码生成器生成)。
  Author: qiufeng(代码生成器)
-->
<template>
  <table-plus ref="tableRef" :columns="columns" :fetcher="listDemoArticles" :query="query">

    <template #search>
      <t-input v-model="query.title" placeholder="文章标题" clearable />
      <t-input v-model="query.author" placeholder="作者" clearable />
      <t-input v-model="query.category" placeholder="分类" clearable />
      <t-select v-model="query.is_top" placeholder="置顶" clearable>
        <t-option label="是" :value="1" />
        <t-option label="否" :value="0" />
      </t-select>
      <t-date-range-picker
        :value="query.publish_time_start ? [Number(query.publish_time_start) * 1000, Number(query.publish_time_end) * 1000] : []"
        value-type="time-stamp"
        clearable
        :placeholder="['发布时间起', '发布时间止']"
        @change="(v: unknown) => {
          const [start, end] = (v as number[]) ?? [];
          query.publish_time_start = start ? String(Math.floor(start / 1000)) : '';
          query.publish_time_end = end ? String(Math.floor(end / 1000) + 86399) : '';
        }"
      />
      <t-select v-model="query.status" placeholder="状态" clearable>
        <t-option label="启用" :value="1" />
        <t-option label="禁用" :value="0" />
      </t-select>
    </template>

    <template #toolbar>
      <t-button v-permission="'demo-article:create'" theme="primary" @click="openCreate">
        <template #icon><add-icon /></template>新增演示文章
      </t-button>
    </template>

    <template #is_top="{ row }">
      <t-tag :theme="row.is_top === 1 ? 'success' : 'default'" variant="light">
        {{ row.is_top === 1 ? '是' : '否' }}
      </t-tag>
    </template>
    <template #publish_time="{ row }">{{ formatDate(row.publish_time) }}</template>
    <template #status="{ row }">
      <t-tag :theme="row.status === 1 ? 'success' : 'danger'" variant="light">
        {{ row.status === 1 ? '启用' : '禁用' }}
      </t-tag>
    </template>
    <template #create_time="{ row }">{{ formatDate(row.create_time) }}</template>

    <template #op="{ row }">
      <t-space size="12px">
        <t-link v-permission="'demo-article:update'" theme="primary" @click="openEdit(row)">编辑</t-link>
        <t-popconfirm content="确定删除吗?" theme="danger" @confirm="onDelete(row)">
          <t-link v-permission="'demo-article:delete'" theme="danger">删除</t-link>
        </t-popconfirm>
      </t-space>
    </template>
  </table-plus>

  <form-dialog v-model:visible="dialogVisible" :title="form.id ? '编辑演示文章' : '新增演示文章'" :on-submit="save">
    <t-form ref="formRef" :data="form" label-width="90px">
      <t-form-item label="文章标题" name="title">
        <t-input v-model="form.title" placeholder="请输入文章标题" />
      </t-form-item>
      <t-form-item label="作者" name="author">
        <t-input v-model="form.author" placeholder="请输入作者" />
      </t-form-item>
      <t-form-item label="分类" name="category">
        <t-input v-model="form.category" placeholder="请输入分类" />
      </t-form-item>
      <t-form-item label="摘要" name="summary">
        <t-input v-model="form.summary" placeholder="请输入摘要" />
      </t-form-item>
      <t-form-item label="正文" name="content">
        <t-textarea v-model="form.content" placeholder="请输入正文" />
      </t-form-item>
      <t-form-item label="阅读量" name="views">
        <t-input-number v-model="form.views" />
      </t-form-item>
      <t-form-item label="置顶" name="is_top">
        <t-radio-group v-model="form.is_top">
          <t-radio :value="1">是</t-radio>
          <t-radio :value="0">否</t-radio>
        </t-radio-group>
      </t-form-item>
      <t-form-item label="发布时间" name="publish_time">
        <t-date-picker
          :value="form.publish_time ? form.publish_time * 1000 : undefined"
          enable-time-picker
          value-type="time-stamp"
          clearable
          placeholder="请选择发布时间"
          @change="(v: unknown) => (form.publish_time = v ? Math.floor(Number(v) / 1000) : 0)"
        />
      </t-form-item>
      <t-form-item label="状态" name="status">
        <t-radio-group v-model="form.status">
          <t-radio :value="1">启用</t-radio>
          <t-radio :value="0">禁用</t-radio>
        </t-radio-group>
      </t-form-item>
    </t-form>
  </form-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { MessagePlugin, type FormInstanceFunctions } from 'tdesign-vue-next';
import { AddIcon } from 'tdesign-icons-vue-next';
import TablePlus, { type TablePlusExpose } from '@/components/TablePlus.vue';
import FormDialog from '@/components/FormDialog.vue';
import {
  listDemoArticles, getDemoArticle, createDemoArticle, updateDemoArticle, deleteDemoArticle,
  type DemoArticleItem, type DemoArticleForm,
} from '@/api/gen/demo_article';
import { formatDate } from '@/utils/date';

const tableRef = ref<TablePlusExpose>();
const query = reactive({ title: '', author: '', category: '', is_top: '' as string | number, publish_time_start: '', publish_time_end: '', status: '' as string | number, });

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'title', title: '文章标题', width: 140 },
  { colKey: 'author', title: '作者', width: 140 },
  { colKey: 'category', title: '分类', width: 140 },
  { colKey: 'views', title: '阅读量', width: 140 },
  { colKey: 'is_top', title: '置顶', width: 140 },
  { colKey: 'publish_time', title: '发布时间', width: 140 },
  { colKey: 'status', title: '状态', width: 140 },
  { colKey: 'create_time', title: '创建时间', width: 140 },
  { colKey: 'op', title: '操作', width: 120, fixed: 'right' as const },
];

const dialogVisible = ref(false);
const formRef = ref<FormInstanceFunctions>();

const emptyForm = (): DemoArticleForm => ({ title: '', author: '', category: '', summary: '', content: '', views: 0, is_top: 0, publish_time: 0, status: 1, });
const form = reactive<DemoArticleForm>(emptyForm());

function openCreate(): void {
  Object.assign(form, emptyForm(), { id: undefined });
  dialogVisible.value = true;
}

// 列表只返回展示字段,编辑时按 ID 拉取完整详情再回填表单
async function openEdit(row: DemoArticleItem): Promise<void> {
  const detail = await getDemoArticle(row.id);
  Object.assign(form, emptyForm(), {
    id: detail.id,
    title: detail.title,
    author: detail.author,
    category: detail.category,
    summary: detail.summary,
    content: detail.content,
    views: detail.views,
    is_top: detail.is_top,
    publish_time: detail.publish_time,
    status: detail.status,
  });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if (form.id) {
    await updateDemoArticle(form.id, { ...form });
    MessagePlugin.success('更新成功');
  } else {
    await createDemoArticle({ ...form });
    MessagePlugin.success('创建成功');
  }
  tableRef.value?.refresh();
}

async function onDelete(row: DemoArticleItem): Promise<void> {
  await deleteDemoArticle(row.id);
  MessagePlugin.success('删除成功');
  tableRef.value?.refresh();
}
</script>
