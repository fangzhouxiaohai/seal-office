/**
 * 角色接口。
 * Author: qiufeng
 */
import http from '@/utils/request';
import type { PageResult } from '@/types/api';

export interface RoleItem {
  id: number;
  name: string;
  code: string;
  data_scope: string;
  sort: number;
  status: number;
  remark: string;
  create_time: number;
}

export interface RoleDetail extends RoleItem {
  menu_ids: number[];
  dept_ids: number[];
}

export interface RoleForm {
  id?: number;
  name: string;
  code: string;
  data_scope: string;
  sort: number;
  status: number;
  remark: string;
  menu_ids: number[];
  dept_ids: number[];
}

/** 数据范围选项(与后端 RoleService::validScope 取值一致) */
export const DATA_SCOPES = [
  { label: '全部数据', value: 'all' },
  { label: '本部门及以下', value: 'dept_tree' },
  { label: '本部门', value: 'dept' },
  { label: '仅本人', value: 'self' },
  { label: '自定义部门', value: 'custom' },
];

export const listRoles = (params: Record<string, unknown>) =>
  http.get<PageResult<RoleItem>>('/adminapi/system/roles', params);

export const getRole = (id: number) => http.get<RoleDetail>(`/adminapi/system/roles/${id}`);

export const listAllRoles = () => http.get<{ id: number; name: string; code: string }[]>('/adminapi/system/roles/all');

export const createRole = (data: RoleForm) => http.post<{ id: number }>('/adminapi/system/roles', data);

export const updateRole = (id: number, data: RoleForm) => http.put(`/adminapi/system/roles/${id}`, data);

export const deleteRole = (id: number) => http.delete(`/adminapi/system/roles/${id}`);
