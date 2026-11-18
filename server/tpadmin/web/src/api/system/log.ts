/**
 * 日志接口(操作日志/登录日志,存储于 MongoDB)。
 * Author: qiufeng
 */
import http from '@/utils/request';
import type { PageResult } from '@/types/api';

export interface OperationLog {
  id: string;
  user_id: number;
  username: string;
  method: string;
  path: string;
  permission: string;
  ip: string;
  user_agent: string;
  params: string;
  status_code: number;
  duration_ms: number;
  request_id: string;
  create_time: number;
}

export interface LoginLog {
  id: string;
  user_id: number;
  username: string;
  ip: string;
  location: string;
  user_agent: string;
  status: number;
  message: string;
  create_time: number;
}

export interface ThirdPartyLog {
  id: string;
  method: string;
  url: string;
  host: string;
  ok: boolean;
  status: number;
  duration_ms: number;
  error: string;
  response_size: number;
  create_time: number;
}

export const listOperationLogs = (params: Record<string, unknown>) =>
  http.get<PageResult<OperationLog>>('/adminapi/system/logs/operations', params);

export const listLoginLogs = (params: Record<string, unknown>) =>
  http.get<PageResult<LoginLog>>('/adminapi/system/logs/logins', params);

export const listThirdPartyLogs = (params: Record<string, unknown>) =>
  http.get<PageResult<ThirdPartyLog>>('/adminapi/system/logs/third-party', params);
