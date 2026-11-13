<!--
  附件管理:上传(直传)、列表、图片预览、复制链接、删除。
  Author: qiufeng
-->
<template>
  <table-plus ref="tableRef" :columns="columns" :fetcher="listAttachments" :query="query">
    <template #search>
      <t-input v-model="query.name" placeholder="文件名" clearable />
      <t-input v-model="query.ext" placeholder="扩展名,如 png" clearable />
    </template>

    <template #toolbar>
      <upload-plus @success="tableRef?.reload()" />
    </template>

    <template #preview="{ row }">
      <t-image
        v-if="isImage(row.name)"
        :src="row.url"
        fit="cover"
        :style="{ width: '48px', height: '48px', borderRadius: '4px' }"
        :gallery="false"
        @click="previewImage(row)"
      />
      <file-icon v-else size="32" />
    </template>

    <template #size="{ row }">{{ formatSize(row.size) }}</template>
    <template #disk="{ row }">
      <t-tag variant="light" size="small">{{ row.disk }}</t-tag>
    </template>
    <template #create_time="{ row }">{{ formatDate(row.create_time) }}</template>

    <template #op="{ row }">
      <t-space size="12px">
        <t-link theme="primary" @click="copyUrl(row)">复制链接</t-link>
        <t-link theme="primary" @click="download(row)">下载</t-link>
        <t-popconfirm content="确定删除该附件吗?(云端文件一并删除)" theme="danger" @confirm="onDelete(row)">
          <t-link v-permission="'system:attachment:delete'" theme="danger">删除</t-link>
        </t-popconfirm>
      </t-space>
    </template>
  </table-plus>

  <t-image-viewer v-model:visible="viewerVisible" :images="viewerImages" />
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { FileIcon } from 'tdesign-icons-vue-next';
import TablePlus, { type TablePlusExpose } from '@/components/TablePlus.vue';
import UploadPlus from '@/components/UploadPlus.vue';
import { listAttachments, deleteAttachment, getAttachmentUrl, type AttachmentItem } from '@/api/system/attachment';
import { formatSize, isImage, downloadUrl } from '@/utils/file';
import { formatDate } from '@/utils/date';

const tableRef = ref<TablePlusExpose>();
const query = reactive({ name: '', ext: '' });

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'preview', title: '预览', width: 80 },
  { colKey: 'name', title: '文件名', minWidth: 180, ellipsis: true },
  { colKey: 'ext', title: '类型', width: 80 },
  { colKey: 'size', title: '大小', width: 100 },
  { colKey: 'disk', title: '存储', width: 90 },
  { colKey: 'create_time', title: '上传时间', width: 170 },
  { colKey: 'op', title: '操作', width: 190, fixed: 'right' as const },
];

const viewerVisible = ref(false);
const viewerImages = ref<string[]>([]);

function previewImage(row: AttachmentItem): void {
  viewerImages.value = [resolveUrl(row.url)];
  viewerVisible.value = true;
}

function resolveUrl(url: string): string {
  return url.startsWith('http') ? url : location.origin + url;
}

async function copyUrl(row: AttachmentItem): Promise<void> {
  // 私有桶走临时签名接口,公开桶直接用 url
  const { url } = await getAttachmentUrl(row.id).catch(() => ({ url: row.url }));
  await navigator.clipboard.writeText(resolveUrl(url));
  MessagePlugin.success('链接已复制');
}

async function download(row: AttachmentItem): Promise<void> {
  const { url } = await getAttachmentUrl(row.id).catch(() => ({ url: row.url }));
  downloadUrl(resolveUrl(url), row.name);
}

async function onDelete(row: AttachmentItem): Promise<void> {
  const result = await deleteAttachment(row.id);
  MessagePlugin.success(result.remote_deleted === false ? '已删除(远端对象删除失败,请手动清理)' : '删除成功');
  tableRef.value?.refresh();
}
</script>
