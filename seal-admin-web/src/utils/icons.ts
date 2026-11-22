import type { Component } from 'vue'
import {
  Brush,
  Clock,
  CopyDocument,
  Grid,
  Monitor,
  Odometer,
  Reading,
  User,
  UserFilled
} from '@element-plus/icons-vue'

// 后端菜单图标名到 Element Plus 图标的映射
const iconMap: Record<string, Component> = {
  dashboard: Odometer,
  usergroup: User,
  'view-module': Grid,
  book: Reading,
  palette: Brush,
  time: Clock,
  'file-copy': CopyDocument,
  'system-application': Monitor,
  'user-setting': UserFilled
}

export const menuIcon = (name?: string): Component => iconMap[name || ''] || Monitor
