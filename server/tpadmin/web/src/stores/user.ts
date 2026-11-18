/**
 * 用户登录态 store:token、用户信息、菜单树、权限集合。
 * Author: qiufeng
 */
import { defineStore } from 'pinia';
import { type LoginParams } from '@/api/auth';
import { loginAdmin, logoutAdmin, loadAdminProfile, readAdminToken } from '@/utils/sealAuth';
import type { MenuNode, UserInfo, RoleInfo } from '@/types/auth';

interface UserState {
  token: string;
  user: UserInfo | null;
  roles: RoleInfo[];
  permissions: string[];
  menus: MenuNode[];
  /** profile 是否已加载(路由守卫用来决定是否需要拉取) */
  loaded: boolean;
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    token: readAdminToken(),
    user: null,
    roles: [],
    permissions: [],
    menus: [],
    loaded: false,
  }),

  getters: {
    /** 超管或拥有 * 权限时放行一切 */
    isSuper(state): boolean {
      return state.user?.is_super === 1 || state.permissions.includes('*');
    },
  },

  actions: {
    async login(params: LoginParams): Promise<void> {
      await loginAdmin(params.username, params.password);
      this.token = readAdminToken();
    },

    async fetchProfile(): Promise<void> {
      const profile = await loadAdminProfile();
      this.user = profile.user;
      this.roles = profile.roles;
      this.permissions = profile.permissions;
      this.menus = profile.menus;
      this.loaded = true;

    },

    /** 是否拥有某权限标识(按钮/接口级控制) */
    hasPermission(permission: string): boolean {
      if (!permission) return true;
      return this.permissions.includes('*') || this.permissions.includes(permission);
    },

    async logout(): Promise<void> {
      try {
        await logoutAdmin();
      } catch {
        /* token 已失效也要继续清理本地状态 */
      }
      this.$reset();
    },
  },
});
