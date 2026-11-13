/**
 * 演示订单接口。
 * Author: qiufeng(代码生成器)
 */
import http from '@/utils/request';
import type { PageResult } from '@/types/api';

/** 列表行(仅含配置为"列表显示"的字段) */
export interface DemoOrderItem {
  id: number;
  order_no: string;
  customer_name: string;
  goods_name: string;
  quantity: number;
  amount: number;
  is_paid: number;
  pay_time: number;
  remark: string;
  create_time: number;
  update_time: number;
}

/** 新增/编辑表单 */
export interface DemoOrderForm {
  id?: number;
  order_no: string;
  customer_name: string;
  goods_name: string;
  quantity: number;
  amount: number;
  is_paid: number;
  pay_time: number;
  remark: string;
}

/** 分页查询演示订单列表 */
export const listDemoOrders = (params: Record<string, unknown>) =>
  http.get<PageResult<DemoOrderItem>>('/adminapi/demo-order', params);

/** 查询演示订单详情(完整字段,用于编辑回填) */
export const getDemoOrder = (id: number) => http.get<DemoOrderItem>(`/adminapi/demo-order/${id}`);

/** 新增演示订单 */
export const createDemoOrder = (data: DemoOrderForm) => http.post<{ id: number }>('/adminapi/demo-order', data);

/** 编辑演示订单 */
export const updateDemoOrder = (id: number, data: DemoOrderForm) => http.put(`/adminapi/demo-order/${id}`, data);

/** 删除演示订单 */
export const deleteDemoOrder = (id: number) => http.delete(`/adminapi/demo-order/${id}`);
