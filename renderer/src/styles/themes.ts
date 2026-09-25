// 主题配置

export interface 主题样式 {
  背景: string
  侧栏背景: string
  内容背景: string
  文字颜色: string
  次要文字: string
  边框颜色: string
  主色: string
  悬停背景: string
  工具栏背景: string
  选中背景: string
}

export const 浅色主题: 主题样式 = {
  背景: '#F5F7FA',
  侧栏背景: '#FFFFFF',
  内容背景: '#FFFFFF',
  文字颜色: '#1A1D24',
  次要文字: '#5C6472',
  边框颜色: '#E8EBF0',
  主色: '#2B6CF6',
  悬停背景: '#F0F5FF',
  工具栏背景: '#FAFBFC',
  选中背景: '#E8F3FF',
}

export const 深色主题: 主题样式 = {
  背景: '#1A1D24',
  侧栏背景: '#252A33',
  内容背景: '#2D333F',
  文字颜色: '#E8EAED',
  次要文字: '#9AA0A6',
  边框颜色: '#3C4043',
  主色: '#4A90E2',
  悬停背景: '#353B47',
  工具栏背景: '#2D333F',
  选中背景: '#3B4A63',
}

export type 主题名 = '浅色' | '深色'

export const 主题映射: Record<主题名, 主题样式> = {
  '浅色': 浅色主题,
  '深色': 深色主题,
}

/**
 * 应用主题到全局样式
 */
export function 应用主题(主题: 主题名) {
  const 样式 = 主题映射[主题]
  if (!样式) return

  document.body.style.backgroundColor = 样式.背景
  document.body.style.color = 样式.文字颜色

  // 通过CSS变量应用到各个组件
  const root = document.documentElement
  root.setAttribute('data-theme', 主题 === '深色' ? 'dark' : 'light')
  root.style.setProperty('--seal-bg', 样式.背景)
  root.style.setProperty('--seal-sidebar-bg', 样式.侧栏背景)
  root.style.setProperty('--seal-content-bg', 样式.内容背景)
  root.style.setProperty('--seal-text', 样式.文字颜色)
  root.style.setProperty('--seal-text-secondary', 样式.次要文字)
  root.style.setProperty('--seal-border', 样式.边框颜色)
  root.style.setProperty('--seal-primary', 样式.主色)
  root.style.setProperty('--seal-hover', 样式.悬停背景)
  
  // 同时更新基础CSS变量，确保深浅模式全局生效
  root.style.setProperty('--brand', 样式.主色)
  root.style.setProperty('--brand-hover', 样式.主色 === '#2B6CF6' ? '#1e5ae0' : '#3A7BC8')
  root.style.setProperty('--brand-soft', 样式.主色 === '#2B6CF6' ? '#ebf1fe' : '#2A3A5A')
  root.style.setProperty('--bg-app', 样式.背景)
  root.style.setProperty('--bg-card', 样式.内容背景)
  root.style.setProperty('--bg-hover', 样式.悬停背景)
  root.style.setProperty('--border', 样式.边框颜色)
  root.style.setProperty('--border-subtle', 样式.边框颜色)
  root.style.setProperty('--text-1', 样式.文字颜色)
  root.style.setProperty('--text-2', 样式.次要文字)
  root.style.setProperty('--text-3', 样式.次要文字)
}
