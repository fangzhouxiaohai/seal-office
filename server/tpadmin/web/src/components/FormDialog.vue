<!--
  FormDialog 新增/编辑弹窗:确认时执行 onSubmit(异步),成功自动关闭,失败保持打开。

  用法:
    <form-dialog v-model:visible="visible" :title="form.id ? '编辑' : '新增'" :on-submit="save">
      (表单内容)
    </form-dialog>
  Author: qiufeng
-->
<template>
  <t-dialog
    :visible="visible"
    :header="title"
    :width="width"
    :confirm-btn="{ content: '确定', loading: submitting }"
    :close-on-overlay-click="false"
    @confirm="onConfirm"
    @close="emit('update:visible', false)"
  >
    <slot />
  </t-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title: string;
    /** 确认回调:resolve 后自动关闭,reject(校验失败/接口报错)保持打开 */
    onSubmit: () => Promise<unknown>;
    width?: string | number;
  }>(),
  { width: '560px' },
);

const emit = defineEmits<{ 'update:visible': [value: boolean] }>();

const submitting = ref(false);

async function onConfirm(): Promise<void> {
  submitting.value = true;
  try {
    await props.onSubmit();
    emit('update:visible', false);
  } catch {
    /* 校验失败或接口报错(request.ts 已弹提示),保持弹窗 */
  } finally {
    submitting.value = false;
  }
}
</script>
