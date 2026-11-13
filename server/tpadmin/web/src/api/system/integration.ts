/**
 * 第三方能力(插件)配置接口:支付/微信/短信/存储。
 * Author: qiufeng
 */
import http from '@/utils/request';

/** 配置字段定义 */
export interface IntegrationField {
  field: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'select' | 'checkbox' | 'switch' | 'number';
  options?: string[];
  secret: boolean;
}

/** 依赖包状态 */
export interface IntegrationPackage {
  key: string;
  name: string;
  title: string;
  class: string;
  installed: boolean;
}

/** 单个能力组(脱敏后的配置) */
export interface IntegrationGroup {
  group: string;
  schema: IntegrationField[];
  config: Record<string, unknown> | unknown[];
  packages: IntegrationPackage[];
}

export interface IntegrationIndex {
  list: IntegrationGroup[];
  services: Record<string, unknown>;
}

export const getIntegrations = () => http.get<IntegrationIndex>('/adminapi/integrations');

export const saveIntegration = (group: string, config: Record<string, unknown>) =>
  http.post<IntegrationGroup>('/adminapi/integrations/config', { group, config });
