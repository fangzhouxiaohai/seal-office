// 云端自动保存状态的可订阅存储：编辑器功能区标签行右侧的状态徽标读取它，
// 自动保存逻辑（CloudAutosave）负责写入，避免把整条提示条塞进编辑区顶部。
import { useSyncExternalStore } from 'react'

export type 云端状态级别 = '正常' | '进行中' | '错误'

export interface 云端状态 {
  文档标识: string
  文本: string
  级别: 云端状态级别
  可重试: boolean
  /** 完整错误原因，用于鼠标悬浮提示；徽标本身只显示简短状态 */
  详情?: string
}

let 当前: 云端状态 | null = null
const 订阅者 = new Set<() => void>()
let 重试处理: (() => void) | null = null

export function 设置云端状态(值: 云端状态 | null): void {
  if (当前 === null && 值 === null) return
  if (当前 && 值 && 当前.文档标识 === 值.文档标识 && 当前.文本 === 值.文本 && 当前.级别 === 值.级别 && 当前.可重试 === 值.可重试) return
  当前 = 值
  for (const 通知 of 订阅者) 通知()
}

export function 读取云端状态(): 云端状态 | null {
  return 当前
}

/** 注册“点击徽标重试同步”的处理函数，只在有错误时启用 */
export function 注册云端重试(处理: (() => void) | null): void {
  重试处理 = 处理
}

export function 触发云端重试(): void {
  重试处理?.()
}

export function use云端状态(): 云端状态 | null {
  return useSyncExternalStore(
    (通知) => {
      订阅者.add(通知)
      return () => { 订阅者.delete(通知) }
    },
    () => 当前,
    () => null,
  )
}
