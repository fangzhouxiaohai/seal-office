<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useUserStore } from '@/stores/user';
import { buildDynamicRoutes } from '@/router/dynamic';
import { readAdminToken } from '@/utils/sealAuth';
const router = useRouter();
const user = useUserStore();
function sessionExpired() { user.$reset(); MessagePlugin.error('管理员登录已过期，请重新登录'); void router.replace('/login'); }
let refreshing = false;
async function permissionsChanged() {
  if (refreshing || !readAdminToken()) return;
  refreshing = true;
  try {
    await user.fetchProfile();
    if (router.hasRoute('Layout')) router.removeRoute('Layout');
    router.addRoute(buildDynamicRoutes(user.menus));
    const paths = (nodes: typeof user.menus): string[] => nodes.flatMap(node => [node.path, ...paths(node.children || [])]);
    const current = router.currentRoute.value.fullPath;
    await router.replace(paths(user.menus).includes(router.currentRoute.value.path) ? current : '/');
  } catch (error) {
    if (!readAdminToken()) sessionExpired();
    else MessagePlugin.error(error instanceof Error ? error.message : '无法刷新管理员权限');
  } finally { refreshing = false; }
}
onMounted(() => { window.addEventListener('seal-session-expired', sessionExpired); window.addEventListener('seal-permissions-changed', permissionsChanged); });
onUnmounted(() => { window.removeEventListener('seal-session-expired', sessionExpired); window.removeEventListener('seal-permissions-changed', permissionsChanged); });
</script>
<template>
  <router-view />
</template>
