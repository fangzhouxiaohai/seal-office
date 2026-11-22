import axios from 'axios'
import { ElMessage } from 'element-plus'
import { clearToken, expireSession, readToken } from '@/utils/session'

// 后端契约：成功返回裸 JSON；失败返回 HTTP 状态码 + { error: '中文文案' }
const service = axios.create({
  baseURL: '/api',
  timeout: 30000
})

service.interceptors.request.use(
  (config) => {
    const token = readToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

service.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error?.response?.status
    const url: string = error?.config?.url || ''
    const msg = error?.response?.data?.error || error?.response?.data?.message || '网络异常，请稍后重试'
    if (status === 401) {
      // 登录接口本身的 401 是账号密码错误，只提示不跳转
      if (!url.includes('/v1/admin/login')) {
        clearToken()
        ElMessage.warning(msg || '登录已失效，请重新登录')
        expireSession()
      } else {
        ElMessage.error(msg)
      }
    } else {
      ElMessage.error(msg)
    }
    // 标记错误已被拦截器提示，页面内不再重复弹错
    error.__handled = true
    return Promise.reject(error)
  }
)

export default service
