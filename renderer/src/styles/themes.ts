// 主题配置

export interface 主题样式 {
  背景: string
  侧栏背景: string
  内容背景: string
  文字颜色: string
  次要文字: string
  弱化文字: string
  边框颜色: string
  主色: string
  悬停背景: string
  工具栏背景: string
  选中背景: string
  主色悬停: string
  主色浅底: string
}

export const 浅色主题: 主题样式 = {
  背景: '#F4F5FB',
  侧栏背景: '#FFFFFF',
  内容背景: '#FFFFFF',
  文字颜色: '#1B1D2B',
  次要文字: '#5A6075',
  弱化文字: '#6B7186',
  边框颜色: '#E7E8F2',
  主色: '#6A5CF5',
  悬停背景: '#F3F2FF',
  工具栏背景: '#FBFBFE',
  选中背景: '#ECEAFF',
  主色悬停: '#5848E8',
  主色浅底: '#EFEDFF',
}

export const 深色主题: 主题样式 = {
  背景: '#14151F',
  侧栏背景: '#1B1D29',
  内容背景: '#1F2130',
  文字颜色: '#ECEDF5',
  次要文字: '#A3A7BC',
  弱化文字: '#9095AC',
  边框颜色: '#30334A',
  主色: '#8D80FF',
  悬停背景: '#282B3D',
  工具栏背景: '#1F2130',
  选中背景: '#332F5E',
  主色悬停: '#A196FF',
  主色浅底: '#2C2950',
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
  root.style.setProperty('--brand-hover', 样式.主色悬停)
  root.style.setProperty('--brand-soft', 样式.主色浅底)
  root.style.setProperty('--bg-app', 样式.背景)
  root.style.setProperty('--bg-card', 样式.内容背景)
  root.style.setProperty('--bg-hover', 样式.悬停背景)
  root.style.setProperty('--border', 样式.边框颜色)
  root.style.setProperty('--border-subtle', 样式.边框颜色)
  root.style.setProperty('--text-1', 样式.文字颜色)
  root.style.setProperty('--text-2', 样式.次要文字)
  root.style.setProperty('--text-3', 样式.弱化文字)
}
