import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAdminSession, loginAdmin, loadAdminProfile, readAdminToken } from './sealAuth';

describe('海豹管理认证适配', () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

  it('登录成功仅将真实令牌保存在当前会话', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'server-issued' }), { status: 200 })));
    await loginAdmin('admin', '密码');
    expect(readAdminToken()).toBe('server-issued');
    expect(localStorage.getItem('seal-admin-token')).toBeNull();
  });

  it('令牌校验失败时清除本地会话，不返回伪造菜单', async () => {
    sessionStorage.setItem('seal-admin-token', 'expired');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '登录已过期' }), { status: 401 })));
    await expect(loadAdminProfile()).rejects.toThrow();
    expect(readAdminToken()).toBe('');
  });

  it('注销会清除会话', () => {
    sessionStorage.setItem('seal-admin-token', 'issued');
    clearAdminSession();
    expect(readAdminToken()).toBe('');
  });
});
