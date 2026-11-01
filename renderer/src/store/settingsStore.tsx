// 设置状态管理

import { useState, createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { App as AntdApp } from 'antd'
import { 主题名, 应用主题, 内置皮肤列表, 默认皮肤, 默认皮肤标识, type 皮肤定义 } from '../styles/themes'
import { 校验皮肤 } from '../../../main/skins/skinFormat'

export type 界面语言 = 'zh-CN' | 'en-US'

export interface SettingsState {
  主题: 主题名
  切换主题: () => void
  恢复默认主题: () => void
  语言: 界面语言
  设置语言: (语言: 界面语言) => void
  /** 当前皮肤（预览期间仍为已保存的皮肤） */
  皮肤: 皮肤定义
  /** 本机导入或从皮肤市场安装的皮肤，不含内置皮肤 */
  已安装皮肤: 皮肤定义[]
  设置皮肤: (标识: string) => void
  /** 安装后立即应用；同标识的皮肤会被新版本替换 */
  安装皮肤: (皮肤: 皮肤定义) => void
  卸载皮肤: (标识: string) => void
  /** 临时套用皮肤查看效果，传 null 恢复当前皮肤，不写入设置 */
  预览皮肤: (皮肤: 皮肤定义 | null) => void
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

  const [初始语言] = useState<{ 值: 界面语言; 错误: string | null }>(() => {
    try {
      const 已保存 = localStorage.getItem('seal-language')
      return { 值: 已保存 === 'en-US' ? 'en-US' : 'zh-CN', 错误: null }
    } catch (原因) {
      return { 值: 'zh-CN', 错误: 原因 instanceof Error ? 原因.message : '无法读取本机语言设置' }
    }
  })
  const [语言, set语言] = useState<界面语言>(初始语言.值)
  useEffect(() => {
    if (初始语言.错误) set错误({ 标题: '读取语言设置失败', 内容: 初始语言.错误 })
  }, [初始语言.错误])

  const [初始皮肤] = useState<{ 已安装: 皮肤定义[]; 标识: string; 错误: string | null }>(() => {
    let 已安装: 皮肤定义[] = [], 错误: string | null = null, 标识 = 默认皮肤标识
    try {
      const 原始 = localStorage.getItem('seal-skins-installed')
      if (原始) {
        const 列表 = JSON.parse(原始)
        if (!Array.isArray(列表)) throw new Error('记录格式不是皮肤列表')
        for (const 项 of 列表) {
          try { 已安装.push(校验皮肤(项) as 皮肤定义) }
          catch (原因) { 错误 = `已跳过无效皮肤“${项?.name || 项?.id || '未命名'}”：${原因 instanceof Error ? 原因.message : '格式错误'}` }
        }
      }
      标识 = localStorage.getItem('seal-skin') || 默认皮肤标识
    } catch (原因) {
      已安装 = []
      错误 = 原因 instanceof Error ? 原因.message : '无法读取本机皮肤记录'
    }
    return { 已安装, 标识, 错误 }
  })
  const [已安装皮肤, set已安装皮肤] = useState<皮肤定义[]>(初始皮肤.已安装)
  const [皮肤标识, set皮肤标识] = useState(初始皮肤.标识)
  const [预览, set预览] = useState<皮肤定义 | null>(null)
  useEffect(() => {
    if (初始皮肤.错误) set错误({ 标题: '已安装皮肤读取失败', 内容: `${初始皮肤.错误}。已改用可用的皮肤，可在皮肤市场重新导入。` })
  }, [初始皮肤.错误])
  const 皮肤 = [...内置皮肤列表, ...已安装皮肤].find(项 => 项.id === 皮肤标识) ?? 默认皮肤

  const 保存皮肤记录 = (列表: 皮肤定义[], 标识: string) => {
    try {
      localStorage.setItem('seal-skins-installed', JSON.stringify(列表))
      localStorage.setItem('seal-skin', 标识)
    } catch (原因) {
      set错误({ 标题: '保存皮肤失败', 内容: 原因 instanceof Error ? `本机存储空间不足或不可写：${原因.message}` : '无法写入本机皮肤记录' })
      return false
    }
    set已安装皮肤(列表); set皮肤标识(标识); set预览(null)
    return true
  }
  const 设置皮肤 = (标识: string) => {
    if (![...内置皮肤列表, ...已安装皮肤].some(项 => 项.id === 标识)) {
      set错误({ 标题: '应用皮肤失败', 内容: '没有找到这套皮肤，请重新安装后再应用' })
      return
    }
    保存皮肤记录(已安装皮肤, 标识)
  }
  const 安装皮肤 = (新皮肤: 皮肤定义) => {
    if (内置皮肤列表.some(项 => 项.id === 新皮肤.id)) {
      set错误({ 标题: '安装皮肤失败', 内容: `皮肤标识 ${新皮肤.id} 与内置皮肤重复，请修改 id 后再导入` })
      return
    }
    保存皮肤记录([...已安装皮肤.filter(项 => 项.id !== 新皮肤.id), 新皮肤], 新皮肤.id)
  }
  const 卸载皮肤 = (标识: string) => 保存皮肤记录(已安装皮肤.filter(项 => 项.id !== 标识), 皮肤标识 === 标识 ? 默认皮肤标识 : 皮肤标识)

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

  const 恢复默认主题 = () => { set主题('浅色'); set皮肤标识(默认皮肤标识); set预览(null) }

  const 设置语言 = (新语言: 界面语言) => {
    try {
      localStorage.setItem('seal-language', 新语言)
    } catch (原因) {
      set错误({ 标题: '保存语言设置失败', 内容: 原因 instanceof Error ? 原因.message : '无法写入本机语言设置' })
      return
    }
    set语言(新语言)
  }

  useEffect(() => {
    document.documentElement.lang = 语言
  }, [语言])

  // 初始应用主题
  useEffect(() => {
    应用主题(主题, 预览 ?? 皮肤)
  }, [主题, 皮肤, 预览])

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
      <SettingsContext.Provider value={{ 主题, 切换主题, 恢复默认主题, 语言, 设置语言, 皮肤, 已安装皮肤, 设置皮肤, 安装皮肤, 卸载皮肤, 预览皮肤: set预览, 启动时检查默认程序, 设置启动时检查默认程序: 保存启动检查 }}>
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
