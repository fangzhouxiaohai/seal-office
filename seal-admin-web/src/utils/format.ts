// 通用格式化工具：时间、容量、手机号脱敏
export const stamp = (value: unknown): string =>
  value ? new Date(Number(value)).toLocaleString('zh-CN', { hour12: false }) : '—'

// 服务端返回的空间占用单位为字节，概览与用户列表统一按 MB 展示
export const sizeMB = (value: number): string => (value / 1000000).toFixed(2)

// 安装包等文件大小按 KiB / MiB 展示
export const fileSize = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`

export const maskPhone = (value: unknown): string =>
  String(value ?? '').replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
