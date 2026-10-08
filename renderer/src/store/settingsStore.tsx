// 设置状态管理

import { useState, createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { App as AntdApp } from 'antd'
import { 主题名, 应用主题 } from '../styles/themes'

export interface SettingsState {
  主题: 主题名
  切换主题: () => void
  恢复默认主题: () => void
  语言: string
  设置语言: (语言: string) => void
  /** 每次启动检查默认程序：打开时启动即校验，不是默认程序就静默设为默认 */
  启动时检查默认程序: boolean
  设置启动时检查默认程序: (开启: boolean) => void
}

const SettingsContext = createContext<SettingsState | null>(null)
interface 设置错误 { 标题: string; 内容: string }
const 设置错误上下文 = createContext<{ 错误: 设置错误 | null; 清除错误: () => void } | null>(null)

/** 放在应用的 AntdApp 内，确保主题设置的错误弹窗沿用当前界面主题。 */
export function SettingsErrorFeedback() {
  const { modal } = AntdApp.useApp()
  const 状态 = useContext(设置错误上下文)
  const 错误 = 状态?.错误
  const 已显示错误 = useRef<设置错误 | null>(null)
  useEffect(() => {
    if (!错误 || !状态 || 已显示错误.current === 错误) return
    已显示错误.current = 错误
    modal.error({ title: 错误.标题, content: 错误.内容, okText: '确定' })
    状态.清除错误()
  }, [错误, modal, 状态])
  return null
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  // 从 localStorage 读取保存的主题设置
  const [初始主题] = useState<{ 值: 主题名; 错误: string | null }>(() => {
    try {
      return { 值: (localStorage.getItem('seal-theme') as 主题名) || '浅色', 错误: null }
    } catch (错误) {
      return { 值: '浅色', 错误: 错误 instanceof Error ? 错误.message : '无法读取本机主题记录' }
    }
  })
  const [主题, set主题] = useState<主题名>(初始主题.值)
  const [错误, set错误] = useState<设置错误 | null>(初始主题.错误
    ? { 标题: '读取主题设置失败', 内容: 初始主题.错误 } : null)

  const [语言, set语言] = useState<string>('zh-CN')

  // 默认打开：启动时检查文件关联，发现不是默认程序时提示用户确认
  const [启动时检查默认程序, set启动时检查默认程序] = useState<boolean>(() => {
    try { return localStorage.getItem('seal-default-app-auto') !== '关闭' }
    catch { return true }
  })

  const 切换主题 = () => {
    const 新主题 = 主题 === '浅色' ? '深色' : '浅色'
    try {
      localStorage.setItem('seal-theme', 新主题)
    } catch (错误) {
      set错误({ 标题: '保存主题设置失败', 内容: 错误 instanceof Error ? 错误.message : '无法写入本机主题记录' })
      return
    }
    set主题(新主题)
  }

  const 恢复默认主题 = () => set主题('浅色')

  const 设置语言 = (新语言: string) => {
    try {
      localStorage.setItem('seal-language', 新语言)
    } catch (原因) {
      set错误({ 标题: '保存语言设置失败', 内容: 原因 instanceof Error ? 原因.message : '无法写入本机语言设置' })
      return
    }
    set语言(新语言)
  }

  // 初始应用主题
  useEffect(() => {
    应用主题(主题)
  }, [主题])

  const 保存启动检查 = (开启: boolean) => {
    try {
      localStorage.setItem('seal-default-app-auto', 开启 ? '开启' : '关闭')
    } catch (原因) {
      set错误({ 标题: '保存默认程序设置失败', 内容: 原因 instanceof Error ? 原因.message : '无法写入本机设置' })
      return
    }
    set启动时检查默认程序(开启)
  }

  return (
    <设置错误上下文.Provider value={{ 错误, 清除错误: () => set错误(null) }}>
      <SettingsContext.Provider value={{ 主题, 切换主题, 恢复默认主题, 语言, 设置语言, 启动时检查默认程序, 设置启动时检查默认程序: 保存启动检查 }}>
        {children}
      </SettingsContext.Provider>
    </设置错误上下文.Provider>
  )
}

export function useSettings() {
  const 状态 = useContext(SettingsContext)
  if (!状态) {
    throw new Error('useSettings 必须在 SettingsProvider 内使用')
  }
  return 状态
}
