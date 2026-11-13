/**
 * 演示文章接口。
 * Author: qiufeng(代码生成器)
 */
import http from '@/utils/request';
import type { PageResult } from '@/types/api';

/** 列表行(仅含配置为"列表显示"的字段) */
export interface DemoArticleItem {
  id: number;
  title: string;
  author: string;
  category: string;
  summary: string;
  content: string;
  views: number;
  is_top: number;
  publish_time: number;
  status: number;
  create_time: number;
  update_time: number;
}

/** 新增/编辑表单 */
export interface DemoArticleForm {
  id?: number;
  title: string;
  author: string;
  category: string;
  summary: string;
  content: string;
  views: number;
  is_top: number;
  publish_time: number;
  status: number;
}

/** 分页查询演示文章列表 */
export const listDemoArticles = (params: Record<string, unknown>) =>
  http.get<PageResult<DemoArticleItem>>('/adminapi/demo-article', params);

/** 查询演示文章详情(完整字段,用于编辑回填) */
export const getDemoArticle = (id: number) => http.get<DemoArticleItem>(`/adminapi/demo-article/${id}`);

/** 新增演示文章 */
export const createDemoArticle = (data: DemoArticleForm) => http.post<{ id: number }>('/adminapi/demo-article', data);

/** 编辑演示文章 */
export const updateDemoArticle = (id: number, data: DemoArticleForm) => http.put(`/adminapi/demo-article/${id}`, data);

/** 删除演示文章 */
export const deleteDemoArticle = (id: number) => http.delete(`/adminapi/demo-article/${id}`);
