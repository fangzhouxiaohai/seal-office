/**
 * 系统配置接口。
 * Author: qiufeng
 */
import http from '@/utils/request';

export interface ResponseFormatConfig {
  field: string;
  value: 'json' | 'xml';
  options: string[];
}

export interface RateLimitConfig {
  per_second: number;
}

export interface TotpConfig {
  enabled: boolean;
  issuer: string;
}

export interface IpBlockRule {
  // 命中后拒绝/放行由整体 mode(黑/白名单)决定,规则本身只描述归属地/IP 匹配条件
  country?: string;
  province?: string;
  city?: string;
  ip?: string;
}

export interface IpBlockConfig {
  enabled: boolean;
  mode: 'blacklist' | 'whitelist';
  trust_proxy_headers: boolean;
  excluded_paths: string[];
  rules: IpBlockRule[];
}

export const getResponseFormat = () => http.get<ResponseFormatConfig>('/adminapi/system/config/api-response-format');
export const saveResponseFormat = (value: string) => http.post('/adminapi/system/config/api-response-format', { value });

export interface DatetimeFormatConfig {
  value: string;
  presets: string[];
}

export const getDatetimeFormat = () => http.get<DatetimeFormatConfig>('/adminapi/system/config/datetime-format');
export const saveDatetimeFormat = (value: string) => http.post('/adminapi/system/config/datetime-format', { value });

export const getRateLimit = () => http.get<RateLimitConfig>('/adminapi/system/config/security-rate-limit');
export const saveRateLimit = (per_second: number) => http.post('/adminapi/system/config/security-rate-limit', { per_second });

export const getTotpConfig = () => http.get<TotpConfig>('/adminapi/system/config/security-totp');
export const saveTotpConfig = (data: TotpConfig) => http.post('/adminapi/system/config/security-totp', data);

export interface ApiDocsAuthConfig {
  enabled: boolean;
  username: string;
  // 出于安全后端不回显密码明文,只告知是否已设置
  has_password: boolean;
}

export const getApiDocsAuth = () => http.get<ApiDocsAuthConfig>('/adminapi/system/config/api-docs-auth');
// password 留空表示沿用已有密码
export const saveApiDocsAuth = (data: { enabled: boolean; username: string; password: string }) =>
  http.post('/adminapi/system/config/api-docs-auth', data);

export const getIpBlockConfig = () => http.get<IpBlockConfig>('/adminapi/security/ip-block/config');
export const saveIpBlockConfig = (data: IpBlockConfig) => http.post('/adminapi/security/ip-block/config', data);

/** 归属地级联选项(国家 → 省 → 市,来自本地 IP 库) */
export interface RegionOption {
  label: string;
  value: string;
  children?: RegionOption[];
}

export const getIpRegions = () => http.get<RegionOption[]>('/adminapi/security/ip-block/regions');
