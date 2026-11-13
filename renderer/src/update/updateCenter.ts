// 版本更新中心：各端统一的检查入口、更新卡片状态与「立即更新」平台行为。
// 桌面经主进程（版本取 app.getVersion()，安装包由主进程下载校验）；Web 与移动端经云服务通道查询，版本取构建时注入的 __APP_VERSION__。
import { useSyncExternalStore } from 'react'
import { 桥接, type 更新平台, type 版本发布 } from '../ipc/bridge'
import { 初始下载状态, 应用下载进度, 应跳过自动检查, 更新下载界面, type 下载界面状态, type 下载进度 } from './downloadState'

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
    if (平台 === 'windows' || 平台 === 'windows-store' || 平台 === 'linux' || 平台 === 'macos') 响应 = await 桥接.update.check(通道)
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
  if (数据.hasUpdate) {
    if (typeof 数据.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(数据.version)) return { 类型: '失败', 错误: '更新服务返回的版本号无效，请稍后重试' }
    return { 类型: '有新版', 发布: { ...数据, hasUpdate: true, version: 数据.version } }
  }
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
let 下载状态: 下载界面状态 = 初始下载状态
let 下载代次 = 0
let 恢复请求: Promise<void> | null = null
let 已发起启动恢复 = false
let 正在取消 = false
let 下载发布: 有效发布 | null = null
export function 取下载发布(): 有效发布 | null { return 下载发布 }
export function 取下载状态(): 下载界面状态 { return 下载状态 }
export function 正在下载或待安装(): boolean { return 应跳过自动检查(下载状态) }
export function use下载状态(): 下载界面状态 { return useSyncExternalStore(回调 => { 订阅者.add(回调); return () => { 订阅者.delete(回调) } }, () => 下载状态, () => 初始下载状态) }
export function 改变下载界面(界面: 下载界面状态['界面']): void { 下载状态 = 更新下载界面(下载状态, 界面); 通知() }
export function 接收下载进度(进度: 下载进度): void {
  if (下载状态.进度?.阶段 === '已取消' && 下载状态.进度.任务标识 === 进度.任务标识 && 进度.阶段 !== '已取消') return
  if (下载状态.进度?.任务标识 && 下载状态.进度.任务标识 === 进度.任务标识 && ['失败', '已就绪', '安装中'].includes(下载状态.进度.阶段) && ['下载中', '校验中'].includes(进度.阶段)) return
  const 下个状态 = 应用下载进度(下载状态, 进度)
  if (下个状态 !== 下载状态) { 下载状态 = 下个状态; 下载代次++; 通知() }
}
export async function 恢复下载状态(): Promise<void> {
  if (!桥接.update.下载可用) return
  if (恢复请求) return 恢复请求
  const 代次 = 下载代次
  const 启动查询 = !已发起启动恢复
  已发起启动恢复 = true
  const 请求 = (async () => {
    let 结果
    try { 结果 = await 桥接.update.status() }
    catch (错误) { if (启动查询 && 代次 === 下载代次) 已发起启动恢复 = false; throw 错误 }
    if (!结果.成功 || !结果.数据) { if (启动查询 && 代次 === 下载代次) 已发起启动恢复 = false; throw new Error(结果.错误 || '无法读取下载状态，请重试') }
    if (代次 !== 下载代次) return
    接收下载进度(结果.数据)
    const 恢复代次 = 下载代次
    const { 平台 } = await 读取更新平台()
    if (恢复代次 !== 下载代次) return
    if (平台 === 'android' && 结果.数据.阶段 === '失败') 改变下载界面('前台')
    else if (['下载中', '校验中', '已就绪', '安装中'].includes(结果.数据.阶段)) 改变下载界面(平台 === 'android' && (结果.数据.强制 || 结果.数据.错误) ? '前台' : '后台')
    if (启动查询 && 结果.数据.阶段 === '已就绪' && 平台 !== 'android') await 安装已下载更新()
  })()
  恢复请求 = 请求
  try { await 请求 } finally { if (恢复请求 === 请求) 恢复请求 = null }
}
export async function 开始下载更新(发布: 有效发布, 界面: 下载界面状态['界面'] = '前台', 保留入口 = false): Promise<void> {
  if (正在下载或待安装()) throw new Error('已有更新任务正在进行')
  已发起启动恢复 = true
  下载发布 = 发布
  下载状态 = 更新下载界面(初始下载状态, 界面); if (!保留入口) 当前卡片 = null; 下载代次++; 通知()
  let 结果
  try { 结果 = await 桥接.update.download(发布) }
  catch (错误) { if (正在取消 || 下载状态.进度?.阶段 === '已取消') return; throw 错误 }
  if (正在取消 || 下载状态.进度?.阶段 === '已取消') return
  if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '下载更新失败，请重试')
  接收下载进度(结果.数据)
}
export async function 取消下载更新(): Promise<void> {
  if (正在取消) return
  正在取消 = true
  try {
    const 结果 = await 桥接.update.cancel()
    if (!结果.成功 || !结果.数据 || 结果.数据.阶段 !== '已取消') throw new Error(结果.错误 || '取消下载未完成，请重试')
    接收下载进度(结果.数据); 改变下载界面('隐藏')
  } finally { 正在取消 = false }
}
export async function 安装已下载更新(): Promise<void> {
  const 结果 = await 桥接.update.installReady()
  if (!结果.成功 || !结果.数据 || 结果.数据.阶段 !== '安装中') throw new Error(结果.错误 || '安装程序未启动，请重试')
  接收下载进度(结果.数据)
}

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
  下载状态 = 初始下载状态
  下载代次++
  恢复请求 = null
  已发起启动恢复 = false
  正在取消 = false
  下载发布 = null
  通知()
}

export type 更新执行结果 = { 成功: true; 提示?: string } | { 成功: false; 错误: string }

/** 「立即更新」：Windows 下载校验后安装；商店版打开商店；Ubuntu 与 macOS 打开安装包下载；Web 刷新；移动端打开下载或市场地址。 */
export async function 执行更新(发布: 有效发布, 刷新页面: () => void = () => window.location.reload()): Promise<更新执行结果> {
  let 平台: 更新平台
  try { ({ 平台 } = await 读取更新平台()) }
  catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '无法读取版本信息' } }
  if (平台 === 'windows' || 平台 === 'windows-store' || 平台 === 'linux' || 平台 === 'macos') {
    const 结果 = await 桥接.update.install(发布)
    if (!结果.成功) return { 成功: false, 错误: 结果.错误 || '更新失败' }
    const 操作已完成 = 平台 === 'windows-store' ? 结果.数据?.已打开商店 === true
      : 平台 === 'linux' || 平台 === 'macos' ? 结果.数据?.已打开下载 === true : 结果.数据?.已启动安装 === true
    if (!操作已完成) return { 成功: false, 错误: '更新操作未返回有效结果，请重试' }
    const 下载提示 = 平台 === 'macos' ? '已打开 macOS 安装包下载地址，下载完成后请打开 DMG 并按提示安装' : '已打开 Ubuntu 安装包下载地址，下载完成后请按系统提示安装'
    return { 成功: true, 提示: 结果.数据?.已打开商店 ? '已打开微软商店，请在商店中完成更新' : 结果.数据?.已打开下载 ? 下载提示 : '安装包校验通过，正在启动安装程序，海豹办公即将退出' }
  }
  if (平台 === 'web') { 刷新页面(); return { 成功: true } }
  if (平台 === 'harmony') {
    const 结果 = await 桥接.update.openStore()
    if (!结果.成功) return { 成功: false, 错误: 结果.错误 || '无法打开应用市场更新' }
    if (!结果.数据?.已显示) return { 成功: false, 错误: '应用市场未显示更新弹窗，请稍后重试' }
    return { 成功: true, 提示: '已打开应用市场更新弹窗，请按系统提示完成更新' }
  }
  if (平台 === 'android') {
    if (!发布.url) return { 成功: false, 错误: '发布记录缺少下载地址，请稍后再试' }
    const 结果 = await 桥接.openExternal(发布.url)
    if (!结果.成功) return { 成功: false, 错误: 结果.错误 || '无法打开下载地址' }
    return { 成功: true, 提示: '已打开更新地址，请根据页面与系统提示完成安装' }
  }
  return { 成功: false, 错误: '当前运行方式不支持在线更新，请手动下载新版安装程序' }
}
