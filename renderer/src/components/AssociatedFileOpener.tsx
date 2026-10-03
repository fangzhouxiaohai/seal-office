import { useEffect, useRef } from 'react'
import { App as AntdApp } from 'antd'
import { useAppStore } from '../store'
import { 桥接 } from '../ipc/bridge'
import { 通过路径打开文件 } from '../fileOpen'

/** 等工作区恢复结束后读取主进程缓存的系统关联文件，并放入全局底部标签。 */
export default function AssociatedFileOpener() {
  const { message, modal } = AntdApp.useApp()
  const { createDoc, refreshRecents, 启动恢复结束 } = useAppStore()
  const 最新处理 = useRef({ message, modal, createDoc, refreshRecents })
  最新处理.current = { message, modal, createDoc, refreshRecents }

  useEffect(() => {
    if (!启动恢复结束 || !桥接.关联文件可用) return
    let 有效 = true
    let 正在读取 = false
    let 需要再读 = false

    const 领取 = async () => {
      需要再读 = true
      if (正在读取) return
      正在读取 = true
      try {
        while (需要再读 && 有效) {
          需要再读 = false
          try {
            const 结果 = await 桥接.takePendingAssociatedFiles()
            if (!结果.成功 || !Array.isArray(结果.路径列表)) throw new Error(结果.错误 || '系统文件打开请求无效')
            for (const 路径 of 结果.路径列表) {
              if (!有效) break
              const 当前 = 最新处理.current
              const 已打开 = await 通过路径打开文件(路径, 当前.message, 当前.modal,
                (类型, 内容, 文件路径, 警告, 页面设置, 文件指纹) => 当前.createDoc(类型, 内容, { 路径: 文件路径, 警告, 页面设置, 文件指纹 }))
              if (已打开 && 有效) 当前.refreshRecents()
            }
          } catch (错误) {
            if (有效) 最新处理.current.modal.error({ title: '接收系统文件失败', content: 错误 instanceof Error ? 错误.message : '无法接收系统文件打开请求' })
          }
        }
      } finally {
        正在读取 = false
      }
    }

    const 停止订阅 = 桥接.onAssociatedFilesAvailable(() => { void 领取() })
    // 严格模式会先挂载再立即清理一次；延迟到本轮挂载稳定后领取，避免队列提前出列。
    const 初次领取 = window.setTimeout(() => { void 领取() }, 0)
    return () => {
      有效 = false
      window.clearTimeout(初次领取)
      停止订阅()
    }
  }, [启动恢复结束])

  return null
}
