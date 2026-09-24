// 设置状态管理

import { useState, createContext, useContext, useEffect } from 'react'
import { 主题名, 应用主题 } from '../styles/themes'

export interface SettingsState {
  主题: 主题名
  切换主题: () => void
  语言: string
  设置语言: (语言: string) => void
}

const SettingsContext = createContext<SettingsState | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // 从 localStorage 读取保存的主题设置
  const [主题, set主题] = useState<主题名>(() => {
    try {
      return (localStorage.getItem('seal-theme') as 主题名) || '浅色'
    } catch {
      return '浅色'
    }
  })

  const [语言, set语言] = useState<string>('zh-CN')

  const 切换主题 = () => {
    set主题(prev => {
      const 新主题 = prev === '浅色' ? '深色' : '浅色'
      try {
        localStorage.setItem('seal-theme', 新主题)
      } catch {}
      应用主题(新主题)
      return 新主题
    })
  }

  const 设置语言 = (新语言: string) => {
    set语言(新语言)
    try {
      localStorage.setItem('seal-language', 新语言)
    } catch {}
  }

  // 初始应用主题
  useEffect(() => {
    应用主题(主题)
  }, [主题])

  return React.createElement(SettingsContext.Provider, {
    value: { 主题, 切换主题, 语言, 设置语言 }
  }, children)
}

export function useSettings() {
  const 状态 = useContext(SettingsContext)
  if (!状态) {
    throw new Error('useSettings 必须在 SettingsProvider 内使用')
  }
  return 状态
}
