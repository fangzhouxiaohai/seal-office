<!--
  UploadPlus 统一上传组件:选择文件后自动走直传流程(policy → 云端直传/本地兜底 → 登记)。

  用法:<upload-plus @success="onUploaded" />,success 事件携带登记后的附件记录。
  Author: qiufeng
-->
<template>
  <div class="upload-plus">
    <input ref="inputRef" type="file" class="file-input" :accept="accept" @change="onPick" />
    <t-button :loading="uploading" theme="primary" variant="outline" @click="inputRef?.click()">
      <template #icon><upload-icon /></template>
      {{ uploading ? '上传中…' : text }}
    </t-button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { UploadIcon } from 'tdesign-icons-vue-next';
import { uploadFile, type AttachmentItem } from '@/api/system/attachment';

withDefaults(defineProps<{ text?: string; accept?: string }>(), { text: '上传文件', accept: '' });

const emit = defineEmits<{ success: [attachment: AttachmentItem] }>();

const inputRef = ref<HTMLInputElement>();
const uploading = ref(false);

async function onPick(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  uploading.value = true;
  try {
    const attachment = await uploadFile(file);
    MessagePlugin.success('上传成功');
    emit('success', attachment);
  } catch (err) {
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message;
    MessagePlugin.error(message || '上传失败');
  } finally {
    uploading.value = false;
  }
}
</script>

<style scoped>
.file-input {
  display: none;
}
</style>
