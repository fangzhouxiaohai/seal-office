/**
 * 岗位接口。
 * Author: qiufeng
 */
import http from '@/utils/request';
import type { PageResult } from '@/types/api';

export interface PostItem {
  id: number;
  name: string;
  code: string;
  sort: number;
  status: number;
  remark: string;
  create_time: number;
}

export interface PostForm {
  id?: number;
  name: string;
  code: string;
  sort: number;
  status: number;
  remark: string;
}

export const listPosts = (params: Record<string, unknown>) =>
  http.get<PageResult<PostItem>>('/adminapi/system/posts', params);

export const listAllPosts = () => http.get<{ id: number; name: string; code: string }[]>('/adminapi/system/posts/all');

export const createPost = (data: PostForm) => http.post<{ id: number }>('/adminapi/system/posts', data);

export const updatePost = (id: number, data: PostForm) => http.put(`/adminapi/system/posts/${id}`, data);

export const deletePost = (id: number) => http.delete(`/adminapi/system/posts/${id}`);
