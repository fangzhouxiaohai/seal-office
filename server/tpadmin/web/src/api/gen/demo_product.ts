/**
 * 演示商品接口。
 * Author: qiufeng(代码生成器)
 */
import http from '@/utils/request';
import type { PageResult } from '@/types/api';

/** 列表行(仅含配置为"列表显示"的字段) */
export interface DemoProductItem {
  id: number;
  name: string;
  price: number;
  stock: number;
  status: number;
  remark: string;
  create_time: number;
  update_time: number;
}

/** 新增/编辑表单 */
export interface DemoProductForm {
  id?: number;
  name: string;
  price: number;
  stock: number;
  status: number;
  remark: string;
}

/** 分页查询演示商品列表 */
export const listDemoProducts = (params: Record<string, unknown>) =>
  http.get<PageResult<DemoProductItem>>('/adminapi/demo-product', params);

/** 查询演示商品详情(完整字段,用于编辑回填) */
export const getDemoProduct = (id: number) => http.get<DemoProductItem>(`/adminapi/demo-product/${id}`);

/** 新增演示商品 */
export const createDemoProduct = (data: DemoProductForm) => http.post<{ id: number }>('/adminapi/demo-product', data);

/** 编辑演示商品 */
export const updateDemoProduct = (id: number, data: DemoProductForm) => http.put(`/adminapi/demo-product/${id}`, data);

/** 删除演示商品 */
export const deleteDemoProduct = (id: number) => http.delete(`/adminapi/demo-product/${id}`);
