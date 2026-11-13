<script setup lang="ts">
import { computed } from 'vue';
import { UsergroupIcon, UserSettingIcon, FolderIcon, TaskCheckedIcon, CloudUploadIcon, ViewModuleIcon, BookIcon, PaletteIcon, TimeIcon, FileCopyIcon, SystemApplicationIcon } from 'tdesign-icons-vue-next';
import type { Component } from 'vue';
import { useUserStore } from '@/stores/user';
import type { MenuNode } from '@/types/auth';

const props = defineProps<{ data: any }>();
const icons: Record<string, Component> = { usergroup: UsergroupIcon, 'user-setting': UserSettingIcon, folder: FolderIcon, 'task-checked': TaskCheckedIcon, 'cloud-upload': CloudUploadIcon, 'view-module': ViewModuleIcon, book: BookIcon, palette: PaletteIcon, time: TimeIcon, 'file-copy': FileCopyIcon, 'system-application': SystemApplicationIcon };
const user = useUserStore();
const size = (value: number) => (value / 1000000).toFixed(2);
const metrics = computed(() => [
  { label: '账号总数', value: props.data.overviewCounts.users, hint: '已注册的海豹办公账号', icon: 'usergroup', tint: 'green' },
  { label: '实际文件占用', value: size(props.data.overviewCounts.used) + ' MB', hint: '包含历史版本与回收站', icon: 'folder', tint: 'blue' },
  { label: '等待审核', value: props.data.overviewCounts.pending, hint: '演示模板、知识与皮肤', icon: 'task-checked', tint: 'orange' },
  { label: '待提交上传', value: props.data.runtime?.pendingUploads ?? '暂无数据', hint: '当前云服务上传任务', icon: 'cloud-upload', tint: 'purple' },
]);
const shortcuts = computed(() => {
  const collect = (menus: MenuNode[]): MenuNode[] => menus.flatMap(item => item.visible === 1 ? [item, ...collect(item.children || [])] : []);
  return collect(user.menus).filter(item => item.type === 'menu' && item.path && item.path !== '/seal/overview');
});
</script>

<template>
  <div class="dashboard">
    <div class="stat-row">
      <div v-for="item in metrics" :key="item.label" class="stat-card">
        <span class="stat-card__icon" :class="`is-${item.tint}`"><component :is="icons[item.icon]" size="22px" /></span>
        <div class="stat-card__meta"><span class="stat-card__label">{{ item.label }}</span><strong class="stat-card__value">{{ item.value }}</strong><span class="stat-card__hint">{{ item.hint }}</span></div>
      </div>
    </div>
    <div class="dashboard__grid">
      <div class="panel"><div class="panel__header"><span class="panel__title">云服务运行</span><t-tag theme="success" variant="light">已连接</t-tag></div>
        <dl class="detail-grid"><div><dt>服务器剩余磁盘</dt><dd>{{ data.runtime ? size(data.runtime.diskFree / 1000) + ' GB' : '暂无数据' }}</dd></div><div><dt>进程内存</dt><dd>{{ data.runtime ? size(data.runtime.memory) + ' MB' : '暂无数据' }}</dd></div><div v-if="data.quota != null"><dt>每账号实际配额</dt><dd>{{ size(data.quota) + ' MB' }}</dd></div><div><dt>待提交上传</dt><dd>{{ data.runtime?.pendingUploads ?? '暂无数据' }}</dd></div></dl>
        <div class="privacy-note"><strong>客户端加密保护</strong><p>私有文档保持客户端加密，管理后台不提供解密入口。</p></div>
      </div>
      <div class="panel"><div class="panel__header"><span class="panel__title">短信服务</span><t-tag :theme="data.smsConfigured ? 'success' : 'warning'" variant="light">{{ data.smsConfigured ? '已配置' : '未配置' }}</t-tag></div>
        <dl class="service-list"><div><dt>短信签名</dt><dd>{{ data.sms?.sign || '未设置' }}</dd></div><div><dt>验证码模板</dt><dd>{{ data.sms?.template || '未设置' }}</dd></div><div><dt>24 小时发送请求</dt><dd>{{ data.sms?.lastDay ?? '暂无数据' }}</dd></div></dl>
      </div>
    </div>
    <div v-if="shortcuts.length" class="panel"><div class="panel__header"><span class="panel__title">常用功能 <small>快速访问业务管理</small></span></div><div class="shortcut-grid"><router-link v-for="item in shortcuts" :key="item.path" :to="item.path" class="shortcut"><span class="shortcut__icon"><component :is="icons[item.icon] || SystemApplicationIcon" size="20px" /></span><span>{{ item.title }}</span></router-link></div></div>
  </div>
</template>

<style scoped>
.dashboard{display:flex;flex-direction:column;gap:16px}.stat-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.stat-card{display:flex;align-items:center;gap:14px;min-width:0;padding:20px;background:var(--tl-surface);border-radius:8px;box-shadow:var(--tl-shadow)}.stat-card__icon{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:48px;height:48px;border-radius:12px}.is-green{color:var(--tl-primary);background:rgba(22,163,122,.12)}.is-blue{color:#3b82f6;background:rgba(59,130,246,.12)}.is-orange{color:#f59e0b;background:rgba(245,158,11,.14)}.is-purple{color:#8b5cf6;background:rgba(139,92,246,.14)}.stat-card__meta{display:flex;flex-direction:column;min-width:0}.stat-card__label,.detail-grid dt,.service-list dt{font-size:13px;color:var(--tl-text-2)}.stat-card__value{font-size:24px;line-height:1.35;overflow-wrap:anywhere}.stat-card__hint,.panel__title small{font-size:12px;color:var(--tl-text-3);font-weight:400}.dashboard__grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin:24px 0}.detail-grid dd{margin:6px 0 0;font-size:21px;font-weight:600}.privacy-note{background:var(--tl-surface-2);border-radius:8px;padding:14px;color:var(--tl-text-2)}.privacy-note strong{color:var(--tl-primary)}.privacy-note p{margin:4px 0 0}.service-list{margin:0}.service-list div{padding:12px 0;border-bottom:1px solid var(--tl-line)}.service-list div:last-child{border:0}.service-list dd{margin:4px 0 0}.shortcut-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.shortcut{display:flex;align-items:center;gap:12px;min-width:0;padding:14px 16px;color:var(--tl-text-1);border:1px solid var(--tl-line);border-radius:8px}.shortcut:hover{background:var(--tl-hover);border-color:var(--td-brand-color-3)}.shortcut__icon{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:36px;height:36px;color:var(--tl-primary);background:var(--tl-primary-light);border-radius:8px}@media(max-width:1200px){.stat-row,.shortcut-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard__grid{grid-template-columns:minmax(0,1fr)}}@media(max-width:500px){.stat-row,.shortcut-grid{grid-template-columns:minmax(0,1fr)}}
</style>
