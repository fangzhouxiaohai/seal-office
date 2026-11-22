// ------------------------------------------------------------------ 会话与权限
export interface SessionUser {
  id: string
  username: string
  nickname: string
  avatar?: string
  email?: string
  mobile?: string
  is_super?: number
}

export interface SessionRole {
  id: string
  name: string
  code: string
  data_scope: string
}

export interface SessionMenu {
  id: number
  parent_id: number
  type: string
  title: string
  name: string
  path: string
  component: string
  icon: string
  permission: string
  sort: number
  visible: number
  status: number
}

export interface SessionProfile {
  user: SessionUser
  roles: SessionRole[]
  permissions: string[]
  menus: SessionMenu[]
}

// ------------------------------------------------------------------ 运行概览
export interface OverviewCounts {
  users: number
  used: number
  pending: number
}

export interface RuntimeInfo {
  diskFree: number
  memory: number
  uptime: number
  pendingUploads: number
}

export interface SmsInfo {
  sign: string
  template: string
  lastDay: number
}

export interface CloudUser {
  id: string
  phone: string
  enabled: boolean | number
  autosave: boolean | number
  created: number
  used: number
  lastAction: number
}

export interface Publication {
  id: string
  kind: string
  title: string
  description?: string
  cover?: string
  category?: string
  status: string
  created: number
}

export interface PublicationDetail {
  id: string
  title: string
  name: string
  text: string
  kind: string
}

export interface AuditRow {
  id?: string | number
  user_id: string
  action: string
  detail?: string
  time: number
}

export interface OverviewData {
  users?: CloudUser[]
  quota?: number
  publications?: Publication[]
  audit?: AuditRow[]
  overviewCounts?: OverviewCounts
  smsConfigured?: boolean
  runtime?: RuntimeInfo
  sms?: SmsInfo
}

// ------------------------------------------------------------------ 文档转换
export interface ConverterJob {
  startedAt: number
  inputFormat: string
  outputFormat: string
  inputBytes: number
  milliseconds: number
  status: string
  error?: string
}

export interface ConverterState {
  connected: boolean
  error?: string
  testing?: boolean
  config: {
    enabled: boolean
    concurrency: number
    endpoint: string
    tokenConfigured: boolean
    tokenFingerprint?: string
  }
  engine?: { ready: boolean; version?: string }
  statistics?: {
    active: number
    succeeded: number
    failed: number
    recent: ConverterJob[]
  }
  lastTest?: { passed: boolean; finishedAt: number }
}

// ------------------------------------------------------------------ 版本发布
export interface ReleaseAsset {
  id: string
  platform: string
  version: string
  filename: string
  sha256: string
  bytes: number
  url: string
}

export interface ReleaseItem {
  id: string
  platform: string
  version: string
  channel: string
  mandatory: boolean
  withdrawn: boolean
  minVersion?: string | null
  notes?: string
  publishedAt: number
  bytes?: number
  url?: string
  asset?: ReleaseAsset | null
}

export interface ReleaseStatistics {
  all: number
  published: number
  withdrawn: number
}

// ------------------------------------------------------------------ 访问控制
export interface AdminRow {
  id: string
  username: string
  enabled: boolean
  builtin?: boolean
  roleIds: string[]
  roleNames?: string[]
  created: number
}

export interface RoleRow {
  id: string
  name: string
  permissions: string[]
  created: number
}

export interface MenuRow {
  key: string
  title: string
  path: string
  visible: boolean
  enabled: boolean
  sort: number
  readPermission: string
}
