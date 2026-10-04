import { useSyncExternalStore } from 'react'

const 活动视图 = new Set<symbol>()
const 监听器 = new Set<() => void>()
const 通知 = () => {
  document.body.classList.toggle('seal-presenting', 活动视图.size > 0)
  监听器.forEach((监听) => 监听())
}

/** 卸载时释放放映状态，助手会话与编辑内容不随放映销毁。 */
export function 标记放映开始() {
  const 标识 = Symbol()
  活动视图.add(标识)
  通知()
  return () => { 活动视图.delete(标识); 通知() }
}

export function 使用放映状态() {
  return useSyncExternalStore((监听) => { 监听器.add(监听); return () => { 监听器.delete(监听) } }, () => 活动视图.size > 0, () => false)
}
