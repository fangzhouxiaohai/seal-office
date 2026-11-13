/**
 * 认证与用户相关类型(对应后端 auth 接口实际返回)。
 * Author: qiufeng
 */

/** 登录成功返回的 token 对 */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** 菜单节点(后端菜单树,type: catalog 目录 / menu 菜单 / button 按钮 / api 接口) */
export interface MenuNode {
  id: number;
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
  children?: MenuNode[];
}

/** 用户基础信息 */
export interface UserInfo {
  id: string | number;
  username: string;
  nickname: string;
  avatar: string;
  email: string;
  mobile: string;
  dept_id: number;
  is_super: number;
  last_login_time: number;
  last_login_ip: string;
}

/** 角色信息 */
export interface RoleInfo {
  id: string | number;
  name: string;
  code: string;
  data_scope: string;
}

/** 当前登录用户信息(/adminapi/auth/profile) */
export interface UserProfile {
  user: UserInfo;
  roles: RoleInfo[];
  permissions: string[];
  menus: MenuNode[];
}
