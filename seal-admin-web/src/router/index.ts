import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { menuKey, useUserStore } from '@/stores/user'
import Layout from '@/layout/index.vue'

// 菜单键到页面组件的固定映射；审核与访问控制三页共用组件、按属性区分
const pageMap: Record<string, { component: () => Promise<any>; props?: Record<string, string> }> = {
  overview: { component: () => import('@/views/overview/index.vue') },
  users: { component: () => import('@/views/users/index.vue') },
  template: { component: () => import('@/views/review/index.vue'), props: { section: 'template' } },
  knowledge: { component: () => import('@/views/review/index.vue'), props: { section: 'knowledge' } },
  skin: { component: () => import('@/views/review/index.vue'), props: { section: 'skin' } },
  audit: { component: () => import('@/views/audit/index.vue') },
  converter: { component: () => import('@/views/converter/index.vue') },
  sms: { component: () => import('@/views/sms/index.vue') },
  releases: { component: () => import('@/views/releases/index.vue') },
  admins: { component: () => import('@/views/access/index.vue'), props: { scope: 'admins' } },
  roles: { component: () => import('@/views/access/index.vue'), props: { scope: 'roles' } },
  menus: { component: () => import('@/views/access/index.vue'), props: { scope: 'menus' } }
}

const staticRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', public: true }
  },
  {
    path: '/',
    name: 'Root',
    component: Layout,
    // 首页去向在守卫里按会话菜单决定，不能写死：动态路由注册前任何固定目标都会落到 404
    children: []
  },
  // 错误页不标记 public：全站除登录页外都要求登录态，
  // 否则刷新动态页面会先命中通配路由并被 public 分支直接放行成 404
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/error/403.vue'),
    meta: { title: '无权访问' }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    meta: { title: '页面不存在' }
  }
]

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes: staticRoutes,
  scrollBehavior: () => ({ top: 0 })
})

// 动态路由按会话菜单注册，退出登录时移除
let registeredNames: string[] = []

export function registerDynamicRoutes(): void {
  clearDynamicRoutes()
  const store = useUserStore()
  for (const menu of store.menus) {
    const key = menuKey(menu)
    const page = pageMap[key]
    if (!key || !page || router.hasRoute(key)) continue
    router.addRoute('Root', {
      path: key,
      name: key,
      component: page.component,
      props: page.props,
      meta: { title: menu.title, icon: menu.icon, permission: menu.permission }
    })
    registeredNames.push(key)
  }
}

export function clearDynamicRoutes(): void {
  for (const name of registeredNames) {
    if (router.hasRoute(name)) router.removeRoute(name)
  }
  registeredNames = []
}

router.beforeEach(async (to) => {
  const store = useUserStore()

  if (to.meta.public) {
    if (to.path === '/login' && store.isLogin) return '/'
    return true
  }

  if (!store.isLogin) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (!store.sessionLoaded) {
    try {
      await store.loadSession()
      registerDynamicRoutes()
      // 路由刚注册，replace 重触发本次导航以匹配动态页面
      return { path: to.fullPath, replace: true }
    } catch {
      store.reset()
      clearDynamicRoutes()
      return { path: '/login', query: { redirect: to.fullPath } }
    }
  }

  // 首页落到会话菜单的第一项；一个菜单都没有时按无权处理
  if (to.path === '/') {
    const first = store.menus[0]
    return first ? `/${menuKey(first)}` : '/403'
  }

  const perm = to.meta.permission as string | undefined
  if (perm && !store.hasPerm(perm)) return '/403'

  return true
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || ''
  document.title = title ? `${title} - 海豹办公云端管理` : '海豹办公云端管理'
})

export default router
