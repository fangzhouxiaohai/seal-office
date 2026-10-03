import { useEffect, useState } from 'react'
import { App as AntdApp } from 'antd'
import { 桥接 } from '../ipc/bridge'

export type 提醒目录 = 'desktop' | 'document' | 'download'
export const 提醒目录名称: Record<提醒目录, string> = { desktop: '桌面', document: '文档', download: '下载' }
export const 本机通知事件名 = 'seal-local-notification'
export interface 本机通知 { 标题: string; 内容: string }
const 设置键 = 'seal-new-file-alert-folder'

export function 读取提醒目录(): 提醒目录 | null {
  const 已保存 = localStorage.getItem(设置键)
  if (已保存 === null) return null
  if (已保存 === 'desktop' || 已保存 === 'document' || 已保存 === 'download') return 已保存
  throw new Error('新文件提醒的本机设置已损坏，请在设置中心重新选择目录')
}

export function 保存提醒目录(目录: 提醒目录 | null): void {
  if (目录 === null) localStorage.removeItem(设置键)
  else localStorage.setItem(设置键, 目录)
  window.dispatchEvent(new Event('seal-new-file-setting-changed'))
}

export function 找出新文件(上次路径: ReadonlySet<string>, 本次文件: Array<{ 路径: string; 名称: string }>) {
  return 本次文件.filter((文件) => !上次路径.has(文件.路径))
}

/** 程序运行期间轮询一个指定的本机目录；首次读取只建立基线。 */
export default function NewFileNotifier() {
  const { modal } = AntdApp.useApp()
  const [目录, 设目录] = useState<提醒目录 | null>(null)

  useEffect(() => {
    const 同步设置 = () => {
      try { 设目录(读取提醒目录()) }
      catch (错误) { modal.error({ title: '读取新文件提醒设置失败', content: 错误 instanceof Error ? 错误.message : '本机设置无法读取' }) }
    }
    同步设置()
    window.addEventListener('seal-new-file-setting-changed', 同步设置)
    return () => window.removeEventListener('seal-new-file-setting-changed', 同步设置)
  }, [modal])

  useEffect(() => {
    if (!目录 || !桥接.可用) return
    let 有效 = true
    let 上次路径: Set<string> | null = null
    let 正在检查 = false
    let 已提示读取错误 = false
    const 检查 = async () => {
      if (正在检查) return
      正在检查 = true
      try {
        const 结果 = await 桥接.listKnownFolder(目录)
        if (!结果.成功 || !结果.文件) throw new Error(结果.错误 || '本机目录读取失败')
        if (!有效) return
        const 新文件 = 上次路径 ? 找出新文件(上次路径, 结果.文件) : []
        上次路径 = new Set(结果.文件.map((文件) => 文件.路径))
        已提示读取错误 = false
        if (新文件.length > 0) {
          const 通知: 本机通知 = {
            标题: `${提醒目录名称[目录]}有新文件`,
            内容: `发现 ${新文件.length} 个新办公文件：${新文件.slice(0, 5).map((文件) => 文件.名称).join('、')}${新文件.length > 5 ? '等' : ''}。可从首页对应目录打开。`,
          }
          window.dispatchEvent(new CustomEvent<本机通知>(本机通知事件名, { detail: 通知 }))
          modal.info({ title: 通知.标题, content: 通知.内容, okText: '知道了' })
        }
      } catch (错误) {
        if (有效 && !已提示读取错误) {
          已提示读取错误 = true
          modal.error({ title: '新文件提醒暂不可用', content: 错误 instanceof Error ? 错误.message : '无法读取本机目录', okText: '确定' })
        }
      } finally {
        正在检查 = false
      }
    }
    void 检查()
    const 定时器 = window.setInterval(() => { void 检查() }, 10000)
    return () => { 有效 = false; window.clearInterval(定时器) }
  }, [目录, modal])

  return null
}
