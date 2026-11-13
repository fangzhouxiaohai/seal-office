/**
 * 动态路由构建:把后端菜单树(catalog/menu 节点)转换为挂在 AdminLayout 下的路由。
 *
 * component 字段对应 src/pages 下的 vue 文件,如 'dashboard/index' → pages/dashboard/index.vue;
 * 页面文件还没建好的菜单自动落到占位页,保证菜单先行可用。
 * Author: qiufeng
 */
import type { RouteRecordRaw } from 'vue-router';
import type { MenuNode } from '@/types/auth';

/** pages 下全部页面组件(懒加载) */
const views = import.meta.glob('@/pages/**/*.vue');

function resolveComponent(component: string): (() => Promise<unknown>) | undefined {
  if (!component) return undefined;
  const path = `/src/pages/${component.replace(/^\/+|\.vue$/g, '')}.vue`;
  return views[path] as (() => Promise<unknown>) | undefined;
}

/** 菜单树 → 扁平路由(只取可显示的 catalog/menu 节点,catalog 自身不渲染页面) */
function collectRoutes(menus: MenuNode[], routes: RouteRecordRaw[] = []): RouteRecordRaw[] {
  for (const node of menus) {
    if (node.type === 'menu' && node.path) {
      routes.push({
        path: node.path,
        name: node.name || `menu-${node.id}`,
        component: resolveComponent(node.component) ?? (() => import('@/pages/error/developing.vue')),
        meta: { title: node.title, icon: node.icon, menuId: node.id },
      });
    }
    if (node.children?.length) collectRoutes(node.children, routes);
  }
  return routes;
}

/** 构建挂在 AdminLayout 下的根路由(/ 重定向到第一个菜单) */
export function buildDynamicRoutes(menus: MenuNode[]): RouteRecordRaw {
  const children = collectRoutes(menus);
  const first = children[0]?.path ?? '/dashboard';

  return {
    path: '/',
    name: 'Layout',
    component: () => import('@/layouts/AdminLayout.vue'),
    redirect: first,
    children,
  };
}
