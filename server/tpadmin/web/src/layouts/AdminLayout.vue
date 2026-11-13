<!--
  后台主布局:左侧动态菜单 + 顶栏(折叠/面包屑/用户菜单)+ 多标签页 + 内容区。
  Author: qiufeng
-->
<template>
  <div class="admin-layout">
    <aside class="layout-aside" :class="{ collapsed: menuCollapsed }">
      <router-link to="/" class="layout-brand">
        <img :src="logoUrl" alt="海豹办公" />
        <span v-show="!menuCollapsed" class="layout-brand__name">海豹办公<em>云端管理</em></span>
      </router-link>
      <t-menu
        theme="light"
        v-model:expanded="expanded"
        :value="activePath"
        :collapsed="menuCollapsed"
        :width="['220px', '64px']"
        expand-mutex
        class="layout-menu"
      >
        <menu-tree :menus="userStore.menus" />
      </t-menu>
    </aside>

    <div class="layout-main">
      <header class="layout-header">
        <div class="header-left">
          <t-tooltip :content="menuCollapsed ? '展开菜单' : '收起菜单'" placement="bottom">
            <button class="header-icon-btn" type="button" @click="toggleMenu">
              <menu-unfold-icon v-if="menuCollapsed" size="18px" />
              <menu-fold-icon v-else size="18px" />
            </button>
          </t-tooltip>
          <t-breadcrumb class="header-breadcrumb">
            <t-breadcrumb-item v-for="item in breadcrumbs" :key="item">{{ item }}</t-breadcrumb-item>
          </t-breadcrumb>
        </div>

        <div class="header-right">
          <t-dropdown :options="themeOptions" trigger="click" @click="(d: DropdownOption) => setThemeMode(d.value as ThemeMode)">
            <button class="header-icon-btn" type="button" :aria-label="`主题:${THEME_LABELS[themeMode]}`">
              <desktop-icon v-if="themeMode === 'auto'" size="18px" />
              <moon-icon v-else-if="themeMode === 'dark'" size="18px" />
              <sunny-icon v-else size="18px" />
            </button>
          </t-dropdown>
          <t-tooltip :content="isFullscreen ? '退出全屏' : '全屏'" placement="bottom">
            <button class="header-icon-btn" type="button" @click="toggleFullscreen">
              <fullscreen-exit-icon v-if="isFullscreen" size="18px" />
              <fullscreen-icon v-else size="18px" />
            </button>
          </t-tooltip>
          <t-dropdown :options="userMenuOptions" trigger="click" @click="onUserMenuClick">
            <div class="header-user">
              <t-avatar size="30px" :image="userStore.user?.avatar || undefined">{{ avatarText }}</t-avatar>
              <div class="header-user__meta">
                <span class="header-user__name">{{ userStore.user?.nickname || userStore.user?.username }}</span>
                <span v-if="roleText" class="header-user__role">{{ roleText }}</span>
              </div>
              <chevron-down-icon class="header-user__caret" />
            </div>
          </t-dropdown>
        </div>
      </header>

      <nav class="layout-tabs">
        <div class="layout-tabs__list">
          <div
            v-for="tab in tabs"
            :key="tab.path"
            class="layout-tab"
            :class="{ active: tab.path === activePath }"
            @click="onTabChange(tab.path)"
            @mouseup.middle="tabs.length > 1 && onTabRemove(tab.path)"
          >
            <span>{{ tab.title }}</span>
            <close-icon v-if="tabs.length > 1" class="layout-tab__close" @click.stop="onTabRemove(tab.path)" />
          </div>
        </div>
        <t-dropdown :options="tabMenuOptions" trigger="click" placement="bottom-right" @click="onTabMenuClick">
          <button class="header-icon-btn layout-tabs__more" type="button" aria-label="标签操作">
            <chevron-down-icon />
          </button>
        </t-dropdown>
      </nav>

      <main class="layout-content">
        <router-view v-slot="{ Component }">
          <!-- 页面多为多根节点(表格 + 弹窗),包一层 div,否则 Transition 无法执行离场动画,切换后内容区空白 -->
          <transition name="fade-slide" mode="out-in">
            <div :key="`${route.path}#${reloadSeq}`">
              <component :is="Component" />
            </div>
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DialogPlugin, type DropdownOption, type DropdownProps } from 'tdesign-vue-next';
import {
  MenuFoldIcon,
  MenuUnfoldIcon,
  FullscreenIcon,
  FullscreenExitIcon,
  ChevronDownIcon,
  CloseIcon,
  SunnyIcon,
  MoonIcon,
  DesktopIcon,
} from 'tdesign-icons-vue-next';
import { setThemeMode, themeMode, type ThemeMode } from '@/utils/theme';
import { useUserStore } from '@/stores/user';
import type { MenuNode } from '@/types/auth';
import MenuTree from '@/layouts/components/MenuTree.vue';
import logoUrl from '@/assets/seal-logo.png';

const COLLAPSE_KEY = 'tladmin:menu_collapsed';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

// ---- 菜单折叠:记住上次状态,存储不可用时按展开处理 ----
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

const collapsed = ref(readCollapsed());
watch(collapsed, (value) => {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    /* 隐私模式等场景写不进去,忽略 */
  }
});

// ---- 窄屏(< 1024px)自动收起菜单;点按钮临时展开,切换页面后再收起,不改宽屏下记住的状态 ----
const NARROW_WIDTH = 1024;
const narrow = ref(window.innerWidth < NARROW_WIDTH);
const narrowExpanded = ref(false);

const menuCollapsed = computed(() => (narrow.value ? !narrowExpanded.value : collapsed.value));

function toggleMenu(): void {
  if (narrow.value) {
    narrowExpanded.value = !narrowExpanded.value;
  } else {
    collapsed.value = !collapsed.value;
  }
}

function syncNarrow(): void {
  narrow.value = window.innerWidth < NARROW_WIDTH;
}

const activePath = computed(() => route.path);

watch(activePath, () => {
  narrowExpanded.value = false;
});

// ---- 展开当前页所在的目录(直接打开深层地址或刷新时,侧栏也能定位到当前菜单) ----
const expanded = ref<Array<string | number>>([]);

function findAncestors(nodes: MenuNode[], trail: string[]): string[] | null {
  for (const node of nodes) {
    if (node.path === route.path) return trail;
    if (node.children?.length) {
      // 与 MenuTree 中 t-submenu 的 value 保持一致
      const found = findAncestors(node.children, [...trail, node.path || String(node.id)]);
      if (found) return found;
    }
  }
  return null;
}

watch(
  [() => route.path, () => userStore.menus],
  () => {
    const ancestors = findAncestors(userStore.menus, []);
    if (ancestors?.length) expanded.value = ancestors;
  },
  { immediate: true },
);

// ---- 面包屑:在菜单树中找到当前路径的祖先链 ----
const breadcrumbs = computed<string[]>(() => {
  const chain: string[] = [];
  const walk = (nodes: MenuNode[], trail: string[]): boolean => {
    for (const node of nodes) {
      const next = [...trail, node.title];
      if (node.path === route.path) {
        chain.push(...next);
        return true;
      }
      if (node.children?.length && walk(node.children, next)) return true;
    }
    return false;
  };
  walk(userStore.menus, []);
  return chain.length ? chain : [String(route.meta.title ?? '')];
});

// ---- 多标签页:存 sessionStorage,刷新页面后恢复;关掉浏览器标签页即清空 ----
interface TabItem {
  path: string;
  title: string;
}

const TABS_KEY = 'tladmin:tabs';

function readTabs(): TabItem[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TABS_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((t) => typeof t?.path === 'string' && typeof t?.title === 'string') : [];
  } catch {
    return [];
  }
}

const tabs = ref<TabItem[]>(readTabs());

watch(
  tabs,
  (value) => {
    try {
      sessionStorage.setItem(TABS_KEY, JSON.stringify(value));
    } catch {
      /* 存储不可用时只是刷新后不恢复,不影响使用 */
    }
  },
  { deep: true },
);

const reloadSeq = ref(0);

watch(
  () => route.path,
  () => {
    if (route.meta.public) return;
    if (!tabs.value.some((t) => t.path === route.path)) {
      tabs.value.push({ path: route.path, title: String(route.meta.title ?? route.path) });
    }
  },
  { immediate: true },
);

function onTabChange(path: string): void {
  if (path !== route.path) router.push(path);
}

function onTabRemove(path: string): void {
  const index = tabs.value.findIndex((t) => t.path === path);
  tabs.value.splice(index, 1);
  // 关掉当前页时跳到相邻标签
  if (path === route.path && tabs.value.length) {
    router.push(tabs.value[Math.min(index, tabs.value.length - 1)]!.path);
  }
}

const tabMenuOptions: DropdownProps['options'] = [
  { content: '刷新当前页', value: 'reload', divider: true },
  { content: '关闭其他', value: 'others' },
  { content: '关闭右侧', value: 'right' },
  { content: '关闭全部', value: 'all' },
];

function onTabMenuClick(data: DropdownOption): void {
  const current = tabs.value.find((t) => t.path === route.path);
  switch (data.value) {
    case 'reload':
      reloadSeq.value++;
      break;
    case 'others':
      tabs.value = current ? [current] : [];
      break;
    case 'right': {
      const index = tabs.value.findIndex((t) => t.path === route.path);
      if (index >= 0) tabs.value.splice(index + 1);
      break;
    }
    case 'all':
      // 回到首页,只留首页一个标签(首页标签由路由监听自动加回)
      tabs.value = [];
      if (route.path === '/' || route.path === '/dashboard') {
        tabs.value = current ? [current] : [];
      } else {
        router.push('/');
      }
      break;
  }
}

// ---- 顶栏右侧 ----
const avatarText = computed(() => (userStore.user?.nickname || userStore.user?.username || '?').slice(0, 1));

const roleText = computed(() =>
  userStore.user?.is_super === 1 ? '超级管理员' : userStore.roles.map((r) => r.name).join(' / '),
);

const userMenuOptions: DropdownProps['options'] = [
  { content: '退出登录', value: 'logout', divider: true },
];

async function onUserMenuClick(data: DropdownOption): Promise<void> {
  if (data.value === 'logout') {
    const dialog = DialogPlugin.confirm({
      header: '退出登录',
      body: '确定要退出当前账号吗?',
      onConfirm: async () => {
        await userStore.logout();
        try {
          sessionStorage.removeItem(TABS_KEY);
        } catch {
          /* 忽略 */
        }
        dialog.destroy();
        router.replace('/login');
      },
    });
  }
}

// ---- 主题:浅色 / 暗色 / 跟随系统 ----
const THEME_LABELS: Record<ThemeMode, string> = { light: '浅色', dark: '暗色', auto: '跟随系统' };

const themeOptions = computed<DropdownProps['options']>(() =>
  (Object.keys(THEME_LABELS) as ThemeMode[]).map((mode) => ({
    content: THEME_LABELS[mode],
    value: mode,
    active: themeMode.value === mode,
  })),
);

const isFullscreen = ref(false);

function syncFullscreen(): void {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullscreen);
  window.addEventListener('resize', syncNarrow);
});
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen);
  window.removeEventListener('resize', syncNarrow);
});
</script>

<style scoped>
.admin-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ---------- 侧栏 ---------- */
.layout-aside {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  width: 220px;
  background: var(--tl-surface);
  border-right: 1px solid var(--tl-line);
  transition: width 0.2s ease;
}

.layout-aside.collapsed {
  width: 64px;
}

.layout-brand {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 17px;
  overflow: hidden;
  white-space: nowrap;
  color: var(--tl-text-1);
  border-bottom: 1px solid var(--tl-line);
}

.layout-brand img {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
}

.layout-brand__name {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.5px;
}

.layout-brand__name em {
  display: block;
  font-size: 11px;
  font-style: normal;
  font-weight: 400;
  letter-spacing: 1px;
  color: var(--tl-text-3);
}

.layout-menu {
  flex: 1;
  min-height: 0;
}

.layout-menu :deep(.t-menu__item) {
  height: 42px;
  color: var(--tl-text-sub);
}

.layout-menu :deep(.t-menu__item.t-is-active:not(.t-is-opened)) {
  font-weight: 500;
  color: var(--tl-primary);
  background: var(--tl-primary-light);
}

.layout-menu :deep(.t-menu__item:hover:not(.t-is-active):not(.t-is-disabled)) {
  color: var(--tl-text-1);
  background: var(--tl-hover);
}

.layout-menu :deep(.t-submenu.t-is-active > .t-menu__item) {
  color: var(--tl-primary);
}

/* ---------- 主区域 ---------- */
.layout-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.layout-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 20px 0 12px;
  background: var(--tl-surface);
  border-bottom: 1px solid var(--tl-line);
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-left {
  gap: 10px;
}

.header-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--tl-text-2);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 6px;
}

.header-icon-btn:hover {
  color: var(--tl-text-1);
  background: var(--tl-hover);
}

.header-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 8px;
}

.header-user:hover {
  background: var(--tl-hover);
}

.header-user :deep(.t-avatar) {
  font-weight: 600;
  color: #fff;
  background: var(--tl-primary);
}

.header-user__meta {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.header-user__name,
.header-user__role {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-user__name {
  font-size: 14px;
  color: var(--tl-text-1);
}

.header-user__role {
  font-size: 11px;
  color: var(--tl-text-3);
}

.header-user__caret {
  color: var(--tl-text-3);
}

/* ---------- 标签栏 ---------- */
.layout-tabs {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 8px 0 12px;
  background: var(--tl-surface);
  border-bottom: 1px solid var(--tl-line);
}

.layout-tabs__list {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.layout-tabs__list::-webkit-scrollbar {
  display: none;
}

.layout-tabs__more {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
}

.layout-tab {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  font-size: 13px;
  color: var(--tl-text-2);
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}

.layout-tab:hover {
  color: var(--tl-text-1);
  background: var(--tl-hover);
}

.layout-tab.active {
  font-weight: 500;
  color: var(--tl-primary);
  background: var(--tl-primary-light);
}

.layout-tab__close {
  font-size: 14px;
  color: var(--tl-text-3);
  border-radius: 50%;
}

.layout-tab__close:hover {
  color: #fff;
  background: var(--tl-text-3);
}

.layout-content {
  flex: 1;
  min-height: 0;
  padding: 20px;
  overflow: auto;
}
/* ---------- 窄屏 ---------- */
@media (max-width: 768px) {
  .header-breadcrumb,
  .header-user__meta {
    display: none;
  }

  .layout-header {
    padding: 0 12px 0 8px;
  }

  .layout-content {
    padding: 12px;
  }
}
</style>
