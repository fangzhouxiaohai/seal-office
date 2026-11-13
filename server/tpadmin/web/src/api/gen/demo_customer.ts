/**
 * 演示客户接口。
 * Author: qiufeng(代码生成器)
 */
import http from '@/utils/request';
import type { PageResult } from '@/types/api';

/** 列表行(仅含配置为"列表显示"的字段) */
export interface DemoCustomerItem {
  id: number;
  name: string;
  contact: string;
  mobile: string;
  source: string;
  level: number;
  next_follow_time: number;
  status: number;
  remark: string;
  create_time: number;
  update_time: number;
}

/** 新增/编辑表单 */
export interface DemoCustomerForm {
  id?: number;
  name: string;
  contact: string;
  mobile: string;
  source: string;
  level: number;
  next_follow_time: number;
  status: number;
  remark: string;
}

/** 分页查询演示客户列表 */
export const listDemoCustomers = (params: Record<string, unknown>) =>
  http.get<PageResult<DemoCustomerItem>>('/adminapi/demo-customer', params);

/** 查询演示客户详情(完整字段,用于编辑回填) */
export const getDemoCustomer = (id: number) => http.get<DemoCustomerItem>(`/adminapi/demo-customer/${id}`);

/** 新增演示客户 */
export const createDemoCustomer = (data: DemoCustomerForm) => http.post<{ id: number }>('/adminapi/demo-customer', data);

/** 编辑演示客户 */
export const updateDemoCustomer = (id: number, data: DemoCustomerForm) => http.put(`/adminapi/demo-customer/${id}`, data);

/** 删除演示客户 */
export const deleteDemoCustomer = (id: number) => http.delete(`/adminapi/demo-customer/${id}`);
