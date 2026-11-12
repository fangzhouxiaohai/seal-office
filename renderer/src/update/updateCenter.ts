// 版本更新中心：各端统一的检查入口、更新卡片状态与「立即更新」平台行为。
// 桌面经主进程（版本取 app.getVersion()，安装包由主进程下载校验）；Web 与移动端经云服务通道查询，版本取构建时注入的 __APP_VERSION__。
import { useSyncExternalStore } from 'react'
import { 桥接, type 更新平台, type 版本发布 } from '../ipc/bridge'

export type 有效发布 = 版本发布 & { hasUpdate: true; version: string }
export type 检查结果 =
  | { 类型: '有新版'; 发布: 有效发布 }
  | { 类型: '已最新'; 版本: string }
  | { 类型: '失败'; 错误: string; 状态码?: number }
  | { 类型: '商店版' }
  | { 类型: '不支持' }

/** 自动检查周期：运行期间每 4 小时一次，以进程内计时器为准 */
export const 自动检查间隔 = 4 * 60 * 60 * 1000
/** 启动后稍等再检查，避开启动高峰，也让严格模式的重复挂载只发一次请求 */
export const 启动检查延迟 = 1500
/** 手动检查最短间隔 */
export const 手动检查间隔 = 5000

let 平台信息: Promise<{ 平台: 更新平台; 版本: string }> | null = null

/** 判定当前端的更新平台与版本号 */
export function 读取更新平台(): Promise<{ 平台: 更新平台; 版本: string }> {
  if (平台信息) return 平台信息
  平台信息 = (async () => {
    if (桥接.update.可用) {
      const 信息 = await 桥接.update.info()
      if (!信息.成功 || !信息.版本 || !信息.平台) throw new Error(信息.错误 || '无法读取版本信息')
      return { 平台: 信息.平台, 版本: 信息.版本 }
    }
    // 移动宿主注入的 window.sealNative（见 mobile/web/native.ts）
    const 原生平台 = typeof window !== 'undefined' ? (window as Window & { sealNative?: { platform?: string } }).sealNative?.platform : undefined
    const 构建平台 = typeof __SEAL_PLATFORM__ === 'string' ? __SEAL_PLATFORM__ : 'desktop'
    const 平台: 更新平台 = 原生平台 === 'android' || 原生平台 === 'harmony' ? 原生平台
      : 构建平台 === 'android' || 构建平台 === 'harmony' ? 构建平台
      : 构建平台 === 'web' ? 'web' : 'unsupported'
    return { 平台, 版本: __APP_VERSION__ }
  })()
  平台信息.catch(() => { 平台信息 = null })
  return 平台信息
}

/** 向服务端查询一次，结果如实返回：有新版、已最新、失败、商店版或不支持 */
export async function 检查更新(通道: 'stable' | 'beta' = 'stable'): Promise<检查结果> {
  let 平台: 更新平台, 版本: string
  try { ({ 平台, 版本 } = await 读取更新平台()) }
  catch (错误) { return { 类型: '失败', 错误: 错误 instanceof Error ? 错误.message : '无法读取版本信息' } }
  if (平台 === 'unsupported') return { 类型: '不支持' }
  let 响应: { 成功: boolean; 数据?: 版本发布; 错误?: string; 状态码?: number; 不支持?: boolean }
  try {
    if (平台 === 'windows' || 平台 === 'windows-store') 响应 = await 桥接.update.check(通道)
    else {
      const 云端 = typeof window !== 'undefined' ? window.electronAPI?.cloud : undefined
      if (!云端) return { 类型: '不支持' }
      响应 = await 云端.invoke('updateLatest', { platform: 平台, version: 版本, channel: 通道 })
    }
  } catch (错误) {
    return { 类型: '失败', 错误: 错误 instanceof Error ? 错误.message : '检查更新失败' }
  }
  if (!响应.成功) return 响应.不支持 ? { 类型: '不支持' } : { 类型: '失败', 错误: 响应.错误 || '检查更新失败', ...(响应.状态码 !== undefined ? { 状态码: 响应.状态码 } : {}) }
  const 数据 = 响应.数据
  if (!数据 || typeof 数据.hasUpdate !== 'boolean') return { 类型: '失败', 错误: '更新服务返回内容无效' }
  if (数据.hasUpdate && typeof 数据.version === 'string') return { 类型: '有新版', 发布: { ...数据, hasUpdate: true, version: 数据.version } }
  // 商店版的实际更新由微软商店负责，后台未登记新版本时不能断言「已是最新」
  if (平台 === 'windows-store') return { 类型: '商店版' }
  return { 类型: '已最新', 版本 }
}

// ---------- 更新卡片状态（全局唯一，自动检查与手动检查共用） ----------
export interface 卡片状态 { 发布: 有效发布 }
let 当前卡片: 卡片状态 | null = null
const 稍后版本 = new Set<string>()
const 订阅者 = new Set<() => void>()
const 通知 = () => { for (const 回调 of 订阅者) 回调() }

/** 展示更新卡片；自动检查尊重本次运行内的「稍后」，手动检查与强制更新总是展示 */
export function 展示更新(发布: 有效发布, 来源: '自动' | '手动'): boolean {
  if (来源 === '自动' && !发布.mandatory && 稍后版本.has(发布.version)) return false
  当前卡片 = { 发布 }
  通知()
  return true
}

/** 非强制更新点「稍后」：本次运行内不再自动提醒该版本，下次启动重新检查 */
export function 稍后提醒(): void {
  if (!当前卡片 || 当前卡片.发布.mandatory) return
  稍后版本.add(当前卡片.发布.version)
  当前卡片 = null
  通知()
}

export function use更新卡片(): 卡片状态 | null {
  return useSyncExternalStore(回调 => { 订阅者.add(回调); return () => { 订阅者.delete(回调) } }, () => 当前卡片, () => null)
}

/** 仅供测试：清空运行期状态 */
export function 重置更新状态(): void {
  当前卡片 = null
  稍后版本.clear()
  平台信息 = null
  通知()
}

export type 更新执行结果 = { 成功: true; 提示?: string } | { 成功: false; 错误: string }

/** 「立即更新」：Windows 安装版下载校验后安装；商店版打开商店；Web 刷新；Android / HarmonyOS 打开下载或应用市场地址 */
export async function 执行更新(发布: 有效发布, 刷新页面: () => void = () => window.location.reload()): Promise<更新执行结果> {
  let 平台: 更新平台
  try { ({ 平台 } = await 读取更新平台()) }
  catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '无法读取版本信息' } }
  if (平台 === 'windows' || 平台 === 'windows-store') {
    const 结果 = await 桥接.update.install(发布)
    if (!结果.成功) return { 成功: false, 错误: 结果.错误 || '更新失败' }
    return { 成功: true, 提示: 结果.数据?.已打开商店 ? '已打开微软商店，请在商店中完成更新' : '安装包校验通过，正在启动安装程序，海豹办公即将退出' }
  }
  if (平台 === 'web') { 刷新页面(); return { 成功: true } }
  if (平台 === 'android' || 平台 === 'harmony') {
    if (!发布.url) return { 成功: false, 错误: '发布记录缺少下载地址，请稍后再试' }
    const 结果 = await 桥接.openExternal(发布.url)
    if (!结果.成功) return { 成功: false, 错误: 结果.错误 || '无法打开下载地址' }
    return { 成功: true, 提示: 平台 === 'harmony' ? '已打开应用市场，请在应用市场中完成更新' : '已打开下载地址，下载完成后请按系统提示安装' }
  }
  return { 成功: false, 错误: '当前运行方式不支持在线更新，请手动下载新版安装程序' }
}
