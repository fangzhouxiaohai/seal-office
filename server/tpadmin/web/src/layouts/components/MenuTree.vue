<!--
  递归菜单:catalog 渲染为子菜单,menu 渲染为可点击项(value 为路由路径)。
  Author: qiufeng
-->
<template>
  <template v-for="node in visibleMenus" :key="node.id">
    <t-submenu v-if="node.type === 'catalog'" :value="node.path || String(node.id)" :title="node.title">
      <template #icon><component :is="icons[node.icon]" v-if="icons[node.icon]" /></template>
      <menu-tree :menus="node.children ?? []" />
    </t-submenu>
    <t-menu-item v-else :value="node.path" :to="node.path">
      <template #icon><component :is="icons[node.icon]" v-if="icons[node.icon]" /></template>
      {{ node.title }}
    </t-menu-item>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DashboardIcon, UsergroupIcon, UserSettingIcon, ViewModuleIcon, BookIcon, PaletteIcon, TimeIcon, FileCopyIcon, SystemApplicationIcon } from 'tdesign-icons-vue-next';
import type { Component } from 'vue';
import type { MenuNode } from '@/types/auth';

defineOptions({ name: 'MenuTree' });

const props = defineProps<{ menus: MenuNode[] }>();
const icons: Record<string, Component> = { dashboard: DashboardIcon, usergroup: UsergroupIcon, 'user-setting': UserSettingIcon, 'view-module': ViewModuleIcon, book: BookIcon, palette: PaletteIcon, time: TimeIcon, 'file-copy': FileCopyIcon, 'system-application': SystemApplicationIcon };

/** 只渲染可见的目录/菜单节点 */
const visibleMenus = computed(() =>
  props.menus.filter((m) => (m.type === 'catalog' || m.type === 'menu') && m.visible === 1),
);
</script>
