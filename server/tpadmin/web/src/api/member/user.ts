/**
 * 会员用户接口(C 端会员,区别于管理员)。
 * Author: qiufeng
 */
import http from '@/utils/request';
import type { PageResult } from '@/types/api';

export interface MemberUser {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  mobile: string;
  email: string;
  gender: number;
  status: number;
  balance: number;
  points: number;
  register_ip: string;
  remark: string;
  last_login_time: number;
  create_time: number;
}

export interface MemberUserForm {
  id?: number;
  username: string;
  nickname: string;
  mobile: string;
  email: string;
  gender: number;
  status: number;
  balance: number;
  points: number;
  remark: string;
}

export const listMembers = (params: Record<string, unknown>) =>
  http.get<PageResult<MemberUser>>('/adminapi/member/users', params);

export const getMember = (id: number) => http.get<MemberUser>(`/adminapi/member/users/${id}`);

export const createMember = (data: MemberUserForm) => http.post<{ id: number }>('/adminapi/member/users', data);

export const updateMember = (id: number, data: MemberUserForm) => http.put(`/adminapi/member/users/${id}`, data);

export const deleteMember = (id: number) => http.delete(`/adminapi/member/users/${id}`);
