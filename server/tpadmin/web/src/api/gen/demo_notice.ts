/**
 * 演示公告接口。
 * Author: qiufeng(代码生成器)
 */
import http from '@/utils/request';
import type { PageResult } from '@/types/api';

/** 列表行(仅含配置为"列表显示"的字段) */
export interface DemoNoticeItem {
  id: number;
  title: string;
  content: string;
  is_top: number;
  start_time: number;
  end_time: number;
  status: number;
  create_time: number;
  update_time: number;
}

/** 新增/编辑表单 */
export interface DemoNoticeForm {
  id?: number;
  title: string;
  content: string;
  is_top: number;
  start_time: number;
  end_time: number;
  status: number;
}

/** 分页查询演示公告列表 */
export const listDemoNotices = (params: Record<string, unknown>) =>
  http.get<PageResult<DemoNoticeItem>>('/adminapi/demo-notice', params);

/** 查询演示公告详情(完整字段,用于编辑回填) */
export const getDemoNotice = (id: number) => http.get<DemoNoticeItem>(`/adminapi/demo-notice/${id}`);

/** 新增演示公告 */
export const createDemoNotice = (data: DemoNoticeForm) => http.post<{ id: number }>('/adminapi/demo-notice', data);

/** 编辑演示公告 */
export const updateDemoNotice = (id: number, data: DemoNoticeForm) => http.put(`/adminapi/demo-notice/${id}`, data);

/** 删除演示公告 */
export const deleteDemoNotice = (id: number) => http.delete(`/adminapi/demo-notice/${id}`);
