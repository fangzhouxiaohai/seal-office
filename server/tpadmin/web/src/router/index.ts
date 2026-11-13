/**
 * 路由:静态路由(登录/异常页)+ 登录后按后端菜单树注入动态路由。
 * Author: qiufeng
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { buildDynamicRoutes } from '@/router/dynamic';
import { readAdminToken } from '@/utils/sealAuth';
import { MessagePlugin } from 'tdesign-vue-next';

const staticRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/login/index.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/pages/error/403.vue'),
    meta: { title: '无权限', public: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/pages/error/404.vue'),
    meta: { title: '页面不存在', public: true },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes: staticRoutes,
});

/** 全局守卫:无 token 跳登录;有 token 未加载 profile 时拉取并注入动态路由后重放导航 */
router.beforeEach(async (to) => {
  const userStore = useUserStore();
  document.title = to.meta.title ? `${to.meta.title as string} - 海豹办公管理后台` : '海豹办公管理后台';

  // 未登录:除登录/403 外一律跳登录(动态路由未注册时业务路径会先命中 404 兜底,也要拦)
  if (!userStore.token) {
    if (to.name === 'Login' || to.name === 'Forbidden') return true;
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  // 已登录但 profile 未加载:拉取后注入动态路由并重放当前导航,否则首次会命中 404
  if (!userStore.loaded) {
    try {
      await userStore.fetchProfile();
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '无法获取管理权限');
      if (!readAdminToken()) { userStore.$reset(); return { path: '/login' }; }
      return false;
    }
    router.addRoute(buildDynamicRoutes(userStore.menus));
    return { path: to.path, query: to.query, hash: to.hash, replace: true };
  }

  // 已登录访问登录页直接回首页
  if (to.name === 'Login') return { path: '/' };

  return true;
});

export default router;
