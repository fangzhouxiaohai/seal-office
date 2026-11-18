import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUserStore } from './user';

describe('后台真实授权', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('超级管理员仍受服务端返回的停用菜单权限约束', () => {
    const store=useUserStore();store.user={id:1,username:'admin',nickname:'管理员',avatar:'',email:'',mobile:'',dept_id:0,is_super:1,last_login_time:0,last_login_ip:''};
    store.permissions=['users:read'];
    expect(store.hasPermission('users:read')).toBe(true);
    expect(store.hasPermission('releases:write')).toBe(false);
  });
  it('兼容显式通配授权', () => {
    const store=useUserStore();store.permissions=['*'];expect(store.hasPermission('roles:write')).toBe(true);
  });
});
