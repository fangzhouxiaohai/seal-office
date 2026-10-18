import { useState } from 'react'
import { 桥接 } from '../ipc/bridge'
export function useToolDocument<T>(key: string, initial: () => T, parse: (raw: string) => T) {
  const [state, setState] = useState<{ data: T | null; error: string | null }>(() => {
    try { const raw = localStorage.getItem(key); return { data: raw === null ? initial() : parse(raw), error: null } }
    catch (error) { return { data: null, error: error instanceof Error ? error.message : '本机数据读取失败' } }
  })
  const commit = (next: T): string | null => {
    try { const normalized = parse(JSON.stringify(next)); localStorage.setItem(key, JSON.stringify(normalized)); setState({ data: normalized, error: null }); return null }
    catch (error) { return error instanceof Error ? error.message : '本机保存失败，请导出备份' }
  }
  return { ...state, commit, raw: () => localStorage.getItem(key) ?? '' }
}
export async function exportToolFile(name: string, data: string, binary = false) {
  const target = await 桥接.showSaveDialog(name); if (!target) return false
  const result = await 桥接.saveToFile(target, data, binary ? '二进制' : '文本')
  if (!result.成功) throw new Error(result.错误 || '文件保存失败')
  if (document.documentElement.dataset.sealPlatform) { const exported = await 桥接.revealInFolder(target); if (!exported.成功) throw new Error(exported.错误 || '文件已在本机保存，系统导出未完成') }
  return true
}
