// Ribbon 标签行右侧图标注入通道。
// 桌面端编辑器删除顶栏后，App.tsx 通过此 Context 把五个操作图标
// 传递给各 Editor，再透传给 RibbonTabs 的 右侧图标 prop 渲染到标签行右端。
// 移动端顶栏保留，不提供此 Context 值，各 Editor 收到 undefined 即不渲染。
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export const RibbonActionsContext = createContext<ReactNode>(undefined)

export const useRibbonActions = () => useContext(RibbonActionsContext)
