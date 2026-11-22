// 管理员令牌仅保存在会话级存储中，与现役后台保持一致，关闭标签页即失效
const TOKEN_KEY = 'seal-admin-token'

export const readToken = (): string => sessionStorage.getItem(TOKEN_KEY) || ''

export const saveToken = (token: string): void => {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export const clearToken = (): void => {
  sessionStorage.removeItem(TOKEN_KEY)
}

// 会话失效：清理令牌并跳转登录页（history 模式，部署在 /admin/ 下）
export function expireSession(): void {
  clearToken()
  if (!location.pathname.startsWith('/admin/login')) {
    location.assign('/admin/login')
  }
}
