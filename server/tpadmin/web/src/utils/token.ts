/**
 * token 本地存储(localStorage)。
 * Author: qiufeng
 */
const ACCESS_KEY = 'tladmin:access_token';
const REFRESH_KEY = 'tladmin:refresh_token';

export function getToken(): string {
  return localStorage.getItem(ACCESS_KEY) ?? '';
}

export function getRefreshToken(): string {
  return localStorage.getItem(REFRESH_KEY) ?? '';
}

export function setToken(access: string, refresh?: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearToken(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}
