import { defineStore } from 'pinia'
import { fetchSession, login as loginApi, logout as logoutApi } from '@/api/auth'
import { clearToken, readToken, saveToken } from '@/utils/session'
import type { SessionMenu, SessionProfile, SessionRole, SessionUser } from '@/types'

// 菜单键统一从 component（形如 seal/users）或 path（形如 /seal/users）推导
export const menuKey = (menu: Pick<SessionMenu, 'component' | 'path'>): string =>
  (menu.component || menu.path || '').split('/').filter(Boolean).pop() || ''

export const useUserStore = defineStore('user', {
  state: () => ({
    token: readToken(),
    user: null as SessionUser | null,
    roles: [] as SessionRole[],
    permissionList: [] as string[],
    menuList: [] as SessionMenu[],
    sessionLoaded: false
  }),

  getters: {
    isLogin: (state) => !!state.token,
    permissions: (state) => state.permissionList,
    menus: (state) => state.menuList,
    displayName: (state) => state.user?.nickname || state.user?.username || ''
  },

  actions: {
    async login(form: { username: string; password: string }) {
      const res = await loginApi(form)
      if (!res.token) throw new Error('登录响应缺少管理员令牌')
      this.token = res.token
      saveToken(res.token)
      await this.loadSession()
    },

    async loadSession() {
      const profile: SessionProfile = await fetchSession()
      if (!profile.user || !Array.isArray(profile.menus) || !Array.isArray(profile.permissions)) {
        throw new Error('管理服务返回的用户资料不完整')
      }
      this.user = profile.user
      this.roles = profile.roles || []
      this.permissionList = profile.permissions
      this.menuList = [...profile.menus].sort((a, b) => a.sort - b.sort)
      this.sessionLoaded = true
    },

    async logout() {
      try {
        await logoutApi()
      } catch {
        // 退出接口异常不阻塞本地清理
      }
      this.reset()
    },

    reset() {
      this.token = ''
      this.user = null
      this.roles = []
      this.permissionList = []
      this.menuList = []
      this.sessionLoaded = false
      clearToken()
    },

    hasPerm(perm?: string) {
      if (!perm) return true
      return this.permissionList.includes(perm)
    }
  }
})
