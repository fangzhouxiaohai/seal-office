/**
 * 统一请求实例。
 *
 * - 自动携带 access token;401 时自动用 refresh token 续期并重放原请求(并发请求共享一次刷新)
 * - 业务错误统一弹出 message;403 提示无权限;刷新失败清空登录态跳登录页
 * - 支持 GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS、JSON/FormData/文件上传、blob 下载
 * Author: qiufeng
 */
import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { MessagePlugin } from 'tdesign-vue-next';
import type { ApiResult } from '@/types/api';
import { getToken, getRefreshToken, setToken, clearToken } from '@/utils/token';

/** 请求附加选项 */
export interface RequestOptions extends AxiosRequestConfig {
  /** 业务失败时是否静默(不弹 message),默认 false */
  silent?: boolean;
}

const instance: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 30000,
});

instance.interceptors.request.use((config) => {
  const token = getToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** 刷新中的共享 Promise,保证并发 401 只触发一次刷新 */
let refreshing: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const { data } = await axios.post<ApiResult<{ access_token: string; refresh_token: string; expires_in: number }>>(
      '/adminapi/auth/refresh',
      { refresh_token: refresh },
    );
    if (data.code === 0) {
      setToken(data.data.access_token, data.data.refresh_token);
      return true;
    }
  } catch {
    /* 刷新失败走下方统一登出 */
  }
  return false;
}

function gotoLogin(): void {
  clearToken();
  if (!location.pathname.startsWith('/login')) {
    location.href = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 核心请求:返回业务 data,业务码非 0 时 reject ApiResult。
 * 429(限流)时查询类请求等一秒自动重试一次:限流按自然秒计数,下一秒窗口就清零了;
 * 写操作不自动重试,避免重复提交。
 */
export async function request<T = unknown>(options: RequestOptions, attempt = 0): Promise<T> {
  const { silent, ...config } = options;
  try {
    const response = await instance.request(config);
    // blob / 文本等原始响应直接返回
    if (config.responseType && config.responseType !== 'json') {
      return response.data as T;
    }
    const result = response.data as ApiResult<T>;
    if (result.code === 0) {
      return result.data;
    }
    if (!silent) MessagePlugin.error(result.message || '请求失败');
    return Promise.reject(result);
  } catch (err) {
    const error = err as AxiosError<ApiResult>;
    const status = error.response?.status;
    const body = error.response?.data;

    // 401:尝试刷新 token 后重放原请求(刷新接口自身除外)
    if (status === 401 && !String(config.url).includes('/auth/refresh') && !String(config.url).includes('/auth/login')) {
      refreshing = refreshing ?? refreshToken().finally(() => { refreshing = null; });
      if (await refreshing) {
        return request<T>(options);
      }
      gotoLogin();
      return Promise.reject(body ?? error);
    }

    const method = String(config.method ?? 'get').toLowerCase();
    if (status === 429 && attempt === 0 && (method === 'get' || method === 'head')) {
      // 加一点随机延迟,避免同一批请求在同一秒里又一起撞上
      await sleep(1000 + Math.random() * 300);
      return request<T>(options, attempt + 1);
    }

    if (!silent) {
      if (status === 403) {
        MessagePlugin.warning(body?.message || '没有操作权限');
      } else if (body?.message) {
        MessagePlugin.error(body.message);
      } else {
        MessagePlugin.error('网络异常,请稍后重试');
      }
    }
    return Promise.reject(body ?? error);
  }
}

export const http = {
  get: <T = unknown>(url: string, params?: Record<string, unknown>, options?: RequestOptions) =>
    request<T>({ url, method: 'GET', params, ...options }),
  post: <T = unknown>(url: string, data?: unknown, options?: RequestOptions) =>
    request<T>({ url, method: 'POST', data, ...options }),
  put: <T = unknown>(url: string, data?: unknown, options?: RequestOptions) =>
    request<T>({ url, method: 'PUT', data, ...options }),
  patch: <T = unknown>(url: string, data?: unknown, options?: RequestOptions) =>
    request<T>({ url, method: 'PATCH', data, ...options }),
  delete: <T = unknown>(url: string, params?: Record<string, unknown>, options?: RequestOptions) =>
    request<T>({ url, method: 'DELETE', params, ...options }),
  head: (url: string, options?: RequestOptions) => request({ url, method: 'HEAD', ...options }),
  options: (url: string, options?: RequestOptions) => request({ url, method: 'OPTIONS', ...options }),

  /** 上传:FormData 直接 POST(本地磁盘兜底上传等场景) */
  upload: <T = unknown>(url: string, form: FormData, options?: RequestOptions) =>
    request<T>({ url, method: 'POST', data: form, ...options }),

  /** 下载:返回 Blob,自行配合 file.ts 的 downloadBlob 保存 */
  download: (url: string, params?: Record<string, unknown>, options?: RequestOptions) =>
    request<Blob>({ url, method: 'GET', params, responseType: 'blob', ...options }),
};

export default http;
