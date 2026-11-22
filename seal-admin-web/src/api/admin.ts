import request from './request'
import { expireSession, readToken } from '@/utils/session'
import type {
  AdminRow,
  ConverterState,
  MenuRow,
  OverviewData,
  PublicationDetail,
  ReleaseAsset,
  ReleaseItem,
  ReleaseStatistics,
  RoleRow
} from '@/types'

// ------------------------------------------------------------------ 运行概览（按权限裁剪返回段落）
export function fetchOverview() {
  return request.get<any, OverviewData>('/v1/admin/overview')
}

// ------------------------------------------------------------------ 公开内容审核
export function fetchPublication(id: string) {
  return request.get<any, PublicationDetail>(`/v1/admin/publications/${encodeURIComponent(id)}`)
}

export function reviewPublication(id: string, status: 'approved' | 'rejected' | 'withdrawn') {
  return request.patch<any, { status: string }>(`/v1/admin/publications/${encodeURIComponent(id)}`, { status })
}

// 公开原文件为二进制流，走 fetch 下载并触发浏览器保存
export async function downloadPublication(id: string, filename: string): Promise<void> {
  const response = await fetch(`/api/v1/admin/publications/${encodeURIComponent(id)}/download`, {
    headers: { Authorization: 'Bearer ' + readToken() }
  })
  if (response.status === 401) {
    expireSession()
    throw new Error('管理员登录已过期，请重新登录')
  }
  if (!response.ok) {
    let msg = '公开原文件下载失败'
    try {
      const result = await response.json()
      msg = result.error || msg
    } catch {
      // 保留默认提示
    }
    throw new Error(msg)
  }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// ------------------------------------------------------------------ 文档转换
export function fetchConverter() {
  return request.get<any, ConverterState>('/v1/admin/converter')
}

export function saveConverter(data: { enabled: boolean; concurrency: number }) {
  return request.patch<any, ConverterState>('/v1/admin/converter', data)
}

export function resetConverterToken() {
  return request.post<any, { token: string }>('/v1/admin/converter/token')
}

export function testConverter() {
  return request.post<any, { passed: boolean }>('/v1/admin/converter/test')
}

// ------------------------------------------------------------------ 版本管理
export function fetchReleases() {
  return request.get<any, { items: ReleaseItem[]; statistics: ReleaseStatistics }>('/v1/admin/releases')
}

export function batchRelease(data: {
  version: string
  channel: string
  mandatory: boolean
  minVersion: string | null
  notes: string
  platforms: { platform: string; assetId?: string; url?: string }[]
}) {
  return request.post<any, any>('/v1/admin/releases/batch', data)
}

export function updateRelease(id: string, data: { mandatory?: boolean; withdrawn?: boolean }) {
  return request.patch<any, any>(`/v1/admin/releases/${encodeURIComponent(id)}`, data)
}

export function deleteRelease(id: string) {
  return request.delete<any, any>(`/v1/admin/releases/${encodeURIComponent(id)}`)
}

export function deleteReleaseVersion(data: { version: string; channel: string }) {
  return request.post<any, { deleted: number }>('/v1/admin/releases/delete-version', data)
}

// ------------------------------------------------------------------ 访问控制（管理员 / 角色 / 菜单）
export type AccessScope = 'admins' | 'roles' | 'menus'

export function listAccess(scope: 'admins'): Promise<{ items: AdminRow[] }>
export function listAccess(scope: 'roles'): Promise<{ items: RoleRow[] }>
export function listAccess(scope: 'menus'): Promise<{ items: MenuRow[] }>
export function listAccess(scope: AccessScope) {
  return request.get<any, any>(`/v1/admin/access/${scope}`)
}

export function createAccess(scope: AccessScope, data: Record<string, unknown>) {
  return request.post<any, { item: any }>(`/v1/admin/access/${scope}`, data)
}

export function updateAccess(scope: AccessScope, id: string, data: Record<string, unknown>) {
  return request.patch<any, { item: any }>(`/v1/admin/access/${scope}/${encodeURIComponent(id)}`, data)
}

export function deleteAccess(scope: AccessScope, id: string) {
  return request.delete<any, { deleted: boolean }>(`/v1/admin/access/${scope}/${encodeURIComponent(id)}`)
}

export function menuCandidates() {
  return request.get<any, { items: MenuRow[] }>('/v1/admin/access/menu-candidates')
}

// ------------------------------------------------------------------ 安装包上传（octet-stream，带进度与取消）
export function uploadReleaseAsset(
  platform: string,
  version: string,
  file: File,
  progress: (value: number) => void,
  signal: AbortSignal
): Promise<{ item: ReleaseAsset }> {
  const owner = readToken()
  return new Promise((resolve, reject) => {
    if (!owner) {
      reject(new Error('请先登录管理后台'))
      return
    }
    if (signal.aborted) {
      reject(new Error('安装包上传已取消'))
      return
    }
    const request2 = new XMLHttpRequest()
    const abort = () => request2.abort()
    request2.open(
      'POST',
      '/api/v1/admin/release-assets?' + new URLSearchParams({ platform, version, filename: file.name })
    )
    request2.setRequestHeader('Authorization', 'Bearer ' + owner)
    request2.setRequestHeader('Content-Type', 'application/octet-stream')
    request2.timeout = 30 * 60 * 1000
    request2.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
    }
    request2.onload = () => {
      if (request2.status === 401) {
        expireSession()
        reject(new Error('管理员登录已过期，请重新登录'))
        return
      }
      let result: any
      try {
        result = JSON.parse(request2.responseText)
      } catch {
        reject(new Error(request2.status === 413 ? '安装包超过允许大小，请检查服务器配置' : '上传服务返回内容无效'))
        return
      }
      if (request2.status < 200 || request2.status >= 300) {
        const error = new Error(result.error || '安装包上传失败') as any
        error.__handled = true
        reject(error)
        return
      }
      if (owner !== readToken()) {
        reject(new Error('管理员会话已变更，请重新进入版本管理'))
        return
      }
      resolve(result)
    }
    request2.onerror = () => reject(new Error('安装包上传连接中断，请检查网络后重试'))
    request2.ontimeout = () => reject(new Error('安装包上传超时，请检查网络后重新上传'))
    request2.onabort = () => reject(new Error('安装包上传已取消'))
    request2.onloadend = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    request2.send(file)
  })
}
