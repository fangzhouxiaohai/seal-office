/**
 * 管理员接口。
 * Author: qiufeng
 */
import http from '@/utils/request';
import type { PageResult } from '@/types/api';

export interface AdminUserItem {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  email: string;
  mobile: string;
  dept_id: number;
  dept_name: string;
  is_super: number;
  status: number;
  last_login_time: number;
  last_login_ip: string;
  remark: string;
  create_time: number;
  roles: { id: number; name: string }[];
}

export interface AdminUserDetail {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  email: string;
  mobile: string;
  dept_id: number;
  is_super: number;
  status: number;
  remark: string;
  role_ids: number[];
  post_ids: number[];
}

export interface AdminUserForm {
  id?: number;
  username?: string;
  password?: string;
  nickname: string;
  email: string;
  mobile: string;
  /** 未选部门时为空,提交时转成 0 */
  dept_id?: number;
  status: number;
  remark: string;
  role_ids: number[];
  post_ids: number[];
}

export const listUsers = (params: Record<string, unknown>) =>
  http.get<PageResult<AdminUserItem>>('/adminapi/system/users', params);

export const getUser = (id: number) => http.get<AdminUserDetail>(`/adminapi/system/users/${id}`);

export const createUser = (data: AdminUserForm) => http.post<{ id: number }>('/adminapi/system/users', data);

export const updateUser = (id: number, data: AdminUserForm) => http.put(`/adminapi/system/users/${id}`, data);

export const deleteUser = (id: number) => http.delete(`/adminapi/system/users/${id}`);

export const resetUserPassword = (id: number, password: string) =>
  http.post(`/adminapi/system/users/${id}/reset-password`, { password });

export const resetUserTotp = (id: number) => http.post(`/adminapi/system/users/${id}/reset-totp`);
