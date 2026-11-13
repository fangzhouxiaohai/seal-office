import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callAdmin, uploadRelease } from './sealApi';

describe('海豹业务接口适配', () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

  it('常规业务由 PHP 入口转发并传递会话令牌', async () => {
    sessionStorage.setItem('seal-admin-token', 'issued');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ users: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(callAdmin('overview')).resolves.toEqual({ users: [] });
    expect(fetcher.mock.calls[0][0]).toBe('/seal-admin/api/overview');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer issued');
  });

  it('拒绝非法路径，避免把授权令牌发到其他地址', async () => {
    sessionStorage.setItem('seal-admin-token', 'issued');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(callAdmin('../other')).rejects.toThrow();
    await expect(callAdmin('%2e%2e/other')).rejects.toThrow();
    await expect(callAdmin('releases/%2e%2e/other')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('登录过期会清除会话并通知界面', async () => {
    sessionStorage.setItem('seal-admin-token', 'expired');
    const handler = vi.fn(); window.addEventListener('seal-session-expired', handler, { once: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '登录已过期' }), { status: 401 })));
    await expect(callAdmin('overview')).rejects.toThrow('登录已过期');
    expect(sessionStorage.getItem('seal-admin-token')).toBeNull();
    expect(handler).toHaveBeenCalledOnce();
  });
  it('无权限时通知界面重新读取权限，但不伪造登录过期', async () => {
    sessionStorage.setItem('seal-admin-token', 'issued');
    const handler = vi.fn(); window.addEventListener('seal-permissions-changed', handler, {once:true});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'无权执行操作'}),{status:403})));
    await expect(callAdmin('access/admins')).rejects.toThrow('无权执行操作');
    expect(handler).toHaveBeenCalledOnce(); expect(sessionStorage.getItem('seal-admin-token')).toBe('issued');
  });

  it('取消前不得发起附件上传', async () => {
    sessionStorage.setItem('seal-admin-token', 'issued');
    const request = vi.fn(); vi.stubGlobal('XMLHttpRequest', request);
    const controller = new AbortController(); controller.abort();
    await expect(uploadRelease('windows', '2.7.2', new File(['x'], 'seal-office-setup-2.7.2.exe'), () => {}, controller.signal)).rejects.toThrow('上传已取消');
    expect(request).not.toHaveBeenCalled();
  });
});
