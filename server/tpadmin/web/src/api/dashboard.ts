/**
 * 仪表盘接口:返回内容按当前账号权限裁剪,没有权限的块不出现。
 * Author: qiufeng
 */
import http from '@/utils/request';

export interface DashboardStat {
  key: string;
  label: string;
  value: number;
  hint: string;
}

export interface DashboardTrendPoint {
  date: string;
  count: number;
}

export interface DashboardLogin {
  username: string;
  ip: string;
  location: string;
  status: number;
  create_time: number;
}

export interface DashboardOverview {
  stats: DashboardStat[];
  /** 需要操作日志查看权限 */
  operation_trend?: DashboardTrendPoint[];
  /** 需要登录日志查看权限 */
  recent_logins?: DashboardLogin[];
}

export const getDashboardOverview = () => http.get<DashboardOverview>('/adminapi/dashboard/overview');
