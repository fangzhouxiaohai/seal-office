/**
 * 认证接口。
 * Author: qiufeng
 */
import http from '@/utils/request';
import type { TokenPair, UserProfile } from '@/types/auth';

/** 登录参数:开启 TOTP 且已绑定的账号需带 code(六位动态码) */
export interface LoginParams {
  username: string;
  password: string;
  code?: string;
}

export function login(params: LoginParams): Promise<TokenPair> {
  // silent:totp_required 等业务错误由登录页自行处理提示
  return http.post<TokenPair>('/adminapi/auth/login', params, { silent: true });
}

export function logout(): Promise<unknown> {
  return http.post('/adminapi/auth/logout', {}, { silent: true });
}

export function getProfile(): Promise<UserProfile> {
  return http.get<UserProfile>('/adminapi/auth/profile');
}

// ---- 个人中心 ----

export const changePassword = (old_password: string, new_password: string) =>
  http.post('/adminapi/auth/password', { old_password, new_password });

export interface TotpStatus {
  global_enabled: boolean;
  bound: boolean;
}

export interface TotpSetup {
  secret: string;
  otpauth_uri: string;
  expires_in: number;
}

export const getTotpStatus = () => http.get<TotpStatus>('/adminapi/auth/totp/status');

export const totpSetup = () => http.post<TotpSetup>('/adminapi/auth/totp/setup');

export const totpConfirm = (code: string) => http.post('/adminapi/auth/totp/confirm', { code });

export const totpDisable = (code: string) => http.post('/adminapi/auth/totp/disable', { code });
