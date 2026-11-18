/**
 * 菜单接口。
 * Author: qiufeng
 */
import http from '@/utils/request';
import type { MenuNode } from '@/types/auth';

export interface MenuForm {
  id?: number;
  parent_id: number;
  type: 'catalog' | 'menu' | 'button' | 'api';
  title: string;
  name: string;
  path: string;
  component: string;
  icon: string;
  permission: string;
  sort: number;
  visible: number;
  status: number;
}

export const listMenus = () => http.get<MenuNode[]>('/adminapi/system/menus');

export const createMenu = (data: MenuForm) => http.post<{ id: number }>('/adminapi/system/menus', data);

export const updateMenu = (id: number, data: MenuForm) => http.put(`/adminapi/system/menus/${id}`, data);

export const deleteMenu = (id: number) => http.delete(`/adminapi/system/menus/${id}`);
