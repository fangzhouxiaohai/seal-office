/**
 * 部门接口。
 * Author: qiufeng
 */
import http from '@/utils/request';

export interface DeptNode {
  id: number;
  parent_id: number;
  name: string;
  leader: string;
  phone: string;
  email: string;
  sort: number;
  status: number;
  children?: DeptNode[];
}

export interface DeptForm {
  id?: number;
  parent_id: number;
  name: string;
  leader: string;
  phone: string;
  email: string;
  sort: number;
  status: number;
}

export const listDepts = () => http.get<DeptNode[]>('/adminapi/system/depts');

export const createDept = (data: DeptForm) => http.post<{ id: number }>('/adminapi/system/depts', data);

export const updateDept = (id: number, data: DeptForm) => http.put(`/adminapi/system/depts/${id}`, data);

export const deleteDept = (id: number) => http.delete(`/adminapi/system/depts/${id}`);
