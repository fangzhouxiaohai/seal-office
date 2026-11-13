import type { UserProfile } from '@/types/auth';

const key = 'seal-admin-token';
export const readAdminToken = (): string => sessionStorage.getItem(key) || '';
export const clearAdminSession = (): void => { sessionStorage.removeItem(key); };

async function responseJson(response: Response): Promise<any> {
  let result: any;
  try { result = await response.json(); } catch { throw new Error('管理服务响应无效，请稍后重试'); }
  if (!response.ok) {
    if (response.status === 401) clearAdminSession();
    throw new Error(result.error || result.message || '管理服务请求失败');
  }
  return result;
}

export async function loginAdmin(username: string, password: string): Promise<void> {
  const response = await fetch('/api/v1/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
  const result = await responseJson(response);
  if (typeof result.token !== 'string' || !result.token) throw new Error('登录响应缺少管理员令牌');
  sessionStorage.setItem(key, result.token);
}

export async function loadAdminProfile(): Promise<UserProfile> {
  const token = readAdminToken();
  if (!token) throw new Error('请先登录管理后台');
  const result = await responseJson(await fetch('/seal-admin/profile', { headers: { Authorization: `Bearer ${token}` } }));
  if (result.code !== 0 || !result.data?.user || !Array.isArray(result.data?.menus) || !Array.isArray(result.data?.permissions) || !Array.isArray(result.data?.roles)) {
    throw new Error('管理服务返回的用户资料不完整');
  }
  return result.data as UserProfile;
}

export async function logoutAdmin(): Promise<void> {
  const token = readAdminToken();
  try {
    if (token) await responseJson(await fetch('/api/v1/admin/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }));
  } finally { clearAdminSession(); }
}
