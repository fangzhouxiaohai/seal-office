import request from './request'
import type { SessionProfile } from '@/types'

// 管理员登录，成功返回 { token }
export function login(data: { username: string; password: string }) {
  return request.post<any, { token: string }>('/v1/admin/login', data)
}

export function logout() {
  return request.post<any, { loggedOut: boolean }>('/v1/admin/logout')
}

// 拉取会话资料：用户、角色、权限点与可见菜单
export function fetchSession() {
  return request.get<any, SessionProfile>('/v1/admin/session')
}
