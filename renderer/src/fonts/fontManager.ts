import { 桥接, 注册海豹格式增强 } from '../ipc/bridge'
import type { 字体记录 } from './types'
import { 增强字体回退Html, 规整字体名称, 规范化字体键 } from './fallback'

export { 字体回退链, 字体回退Css, 增强字体回退Html, 规范化字体键 } from './fallback'

/**
 * 字体目录与文档字体嵌入。
 *
 * 桌面由主进程解析字体文件；移动端与网页共用同一套桥接，自定义字体存放在
 * 应用文档空间。专属格式保存时把实际使用字体的原始字节写入文档，打开时先
 * 注册嵌入字体再渲染，避免换设备后只剩字体名称、没有字形。
 */

const 最大嵌入字节 = 56 * 1024 * 1024
const 字节缓存上限 = 6
const 忽略字体 = new Set(['sans-serif', 'serif', 'monospace', 'system-ui', 'ui-sans-serif', 'ui-serif', 'cursive', 'fantasy', 'inherit', 'initial', 'unset', 'sealofficecjk'])

function 去重(列表: string[]): string[] {
  const 已见 = new Set<string>()
  return 列表.filter((项) => {
    const 键 = 项.toLowerCase()
    if (!项 || 已见.has(键)) return false
    已见.add(键)
    return true
  })
}

const 内置字体: 字体记录[] = [
  { 标识: 'builtin-sans', 名称: 'SealNotoSans', 家族: 'SealNotoSans', 英文名: 'Seal Noto Sans SC', 别名: ['Noto Sans SC', '思源黑体'], 样式: 'Regular', 字重: 400, 斜体: false, 格式: 'ttf', 大小: 0, 中文字形: true, 拉丁字形: true, 可嵌入: true, 来源: 'builtin', 文件名: 'NotoSansSC.ttf', 地址: './fonts/NotoSansSC.ttf' },
  { 标识: 'builtin-serif', 名称: 'SealNotoSerif', 家族: 'SealNotoSerif', 英文名: 'Seal Noto Serif CJK SC', 别名: ['Noto Serif CJK SC', '思源宋体'], 样式: 'Regular', 字重: 400, 斜体: false, 格式: 'otf', 大小: 0, 中文字形: true, 拉丁字形: true, 可嵌入: true, 来源: 'builtin', 文件名: 'NotoSerifCJKsc-Regular.otf', 地址: './fonts/NotoSerifCJKsc-Regular.otf' },
]

const 通用字体: 字体记录[] = [
  { 标识: 'compat-sans', 名称: 'sans-serif', 显示名: '系统无衬线', 家族: 'sans-serif', 别名: ['Arial', 'Helvetica', 'Roboto', 'Noto Sans', 'PingFang SC', 'Microsoft YaHei', 'HarmonyOS Sans SC', 'MiSans'], 样式: 'Regular', 字重: 400, 斜体: false, 格式: 'ttf', 大小: 0, 中文字形: true, 拉丁字形: true, 可嵌入: false, 来源: 'compat' },
  { 标识: 'compat-serif', 名称: 'serif', 显示名: '系统衬线', 家族: 'serif', 别名: ['Times New Roman', 'Noto Serif', 'Songti SC', 'SimSun', '宋体'], 样式: 'Regular', 字重: 400, 斜体: false, 格式: 'ttf', 大小: 0, 中文字形: true, 拉丁字形: true, 可嵌入: false, 来源: 'compat' },
  { 标识: 'compat-mono', 名称: 'monospace', 显示名: '系统等宽', 家族: 'monospace', 别名: ['Courier New', 'Consolas', 'Menlo'], 样式: 'Regular', 字重: 400, 斜体: false, 格式: 'ttf', 大小: 0, 中文字形: false, 拉丁字形: true, 可嵌入: false, 来源: 'compat' },
]

function 平台通用字体(): 字体记录[] {
  if (!平台 || ['win32', 'darwin', 'linux'].includes(平台)) return []
  return 通用字体
}

// ---------------- 目录状态 ----------------

let 系统字体: 字体记录[] = []
let 自定义字体: 字体记录[] = []
let 嵌入字面: 字体记录[] = []
let 平台 = ''
type 初始化状态值 = '未开始' | '加载中' | '完成' | '失败'
let 初始化状态: 初始化状态值 = '未开始'
let 初始化错误 = ''
let 初始化任务: Promise<void> | null = null
let 版本 = 0
let 快照缓存: { 版本: number; 状态: 初始化状态值; 错误: string; 字体: 字体记录[] } = { 版本: -1, 状态: '未开始', 错误: '', 字体: [] }
const 订阅者 = new Set<() => void>()
const 注册任务 = new Map<string, Promise<boolean>>()
const 字体字节 = new Map<string, { 数据: string; 记录: 字体记录 }>()

function 通知(): void {
  版本 += 1
  for (const 回调 of 订阅者) 回调()
}
export function 订阅字体目录(回调: () => void): () => void {
  订阅者.add(回调)
  return () => { 订阅者.delete(回调) }
}
export function 读取字体目录快照(): { 版本: number; 状态: 初始化状态值; 错误: string; 字体: 字体记录[] } {
  if (快照缓存.版本 === 版本) return 快照缓存
  快照缓存 = {
    版本,
    状态: 初始化状态,
    错误: 初始化错误,
    字体: 去重记录([...自定义字体, ...嵌入字面, ...系统字体, ...(typeof document !== 'undefined' && document.documentElement.dataset.sealPlatform ? [...内置字体, ...平台通用字体()] : [])]),
  }
  return 快照缓存
}

function 去重记录(列表: 字体记录[]): 字体记录[] {
  const 已见 = new Set<string>()
  const 结果: 字体记录[] = []
  for (const 项 of 列表) {
    const 键 = `${项.来源}:${项.标识}`
    if (已见.has(键)) continue
    已见.add(键)
    结果.push(项)
  }
  return 结果.sort((左, 右) => {
    const 序: Record<string, number> = { embedded: 0, custom: 1, system: 2, builtin: 3, compat: 4 }
    const 差 = (序[左.来源] ?? 9) - (序[右.来源] ?? 9)
    if (差 !== 0) return 差
    if (左.中文字形 !== 右.中文字形) return 左.中文字形 ? -1 : 1
    return 左.名称.localeCompare(右.名称, 'zh-CN')
  })
}

function 记忆字节(key: string, 数据: string, 记录: 字体记录): void {
  if (字体字节.has(key)) 字体字节.delete(key)
  字体字节.set(key, { 数据, 记录 })
  while (字体字节.size > 字节缓存上限) {
    const 最早 = 字体字节.keys().next().value
    if (typeof 最早 !== 'string') break
    字体字节.delete(最早)
  }
}

function 字节转Base64(bytes: Uint8Array): string {
  let 二进制 = ''
  for (let 偏移 = 0; 偏移 < bytes.length; 偏移 += 0x8000) {
    二进制 += String.fromCharCode(...bytes.subarray(偏移, 偏移 + 0x8000))
  }
  return btoa(二进制)
}

function Base64转字节(数据: string): Uint8Array<ArrayBuffer> {
  const 二进制 = atob(数据)
  const 结果 = new Uint8Array(二进制.length)
  for (let 索引 = 0; 索引 < 二进制.length; 索引 += 1) 结果[索引] = 二进制.charCodeAt(索引)
  return 结果
}

async function 摘要(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle) return ''
  const 结果 = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(结果), (值) => 值.toString(16).padStart(2, '0')).join('')
}

async function 注册字体字节(记录: 字体记录, 字节: Uint8Array<ArrayBuffer>): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return false
  const 样式名 = /^(?:regular|normal|bold|italic|oblique|medium|light|thin|semibold|black|heavy|book|roman)$/i
  const 字体名 = [记录.家族, ...(记录.别名 ?? [])].map(规整字体名称).filter((项) => 项.length > 0 && 项.length <= 120 && !样式名.test(项) && !忽略字体.has(项.toLowerCase())).slice(0, 8)
  let 成功 = false
  for (const 名称 of 去重(字体名)) {
    try {
      const face = new FontFace(名称, 字节, {
        weight: String(记录.字重 || 400),
        style: 记录.斜体 ? 'italic' : 'normal',
      })
      await face.load()
      document.fonts.add(face)
      成功 = true
    } catch { /* 某个别名与浏览器保留字冲突时继续注册其它名称 */ }
  }
  return 成功
}

async function 获取字体内容(记录: 字体记录): Promise<string | null> {
  const 已缓存 = 字体字节.get(记录.标识)
  if (已缓存) return 已缓存.数据
  if (记录.来源 === 'builtin') {
    if (!记录.地址) return null
    try {
      const 响应 = await fetch(记录.地址, { cache: 'force-cache' })
      if (!响应.ok) return null
      const 字节 = new Uint8Array(await 响应.arrayBuffer())
      if (字节.length < 1000) return null
      const 数据 = 字节转Base64(字节)
      记忆字节(记录.标识, 数据, { ...记录, 大小: 字节.length })
      return 数据
    } catch { return null }
  }
  try {
    const 结果 = await 桥接.fonts.read(记录.标识)
    if (!结果.成功 || !结果.数据?.数据) return null
    记忆字节(记录.标识, 结果.数据.数据, { ...记录, 大小: Base64转字节(结果.数据.数据).length })
    return 结果.数据.数据
  } catch { return null }
}

async function 读取并注册(记录: 字体记录): Promise<boolean> {
  const 已缓存 = 字体字节.get(记录.标识)
  if (已缓存) return 注册字体字节(记录, Base64转字节(已缓存.数据))
  const 现有 = 注册任务.get(记录.标识)
  if (现有) return 现有
  const 任务 = (async () => {
    try {
      const 数据 = await 获取字体内容(记录)
      if (!数据) return false
      return await 注册字体字节(记录, Base64转字节(数据))
    } catch { return false } finally { 注册任务.delete(记录.标识) }
  })()
  注册任务.set(记录.标识, 任务)
  return 任务
}

/** 注册会被实际使用的自定义、文档嵌入与内置字体；系统字体由字体栈解析。 */
export async function 确保字体已注册(记录: 字体记录[]): Promise<void> {
  for (const 项 of 记录) {
    if (项.来源 !== 'system' && 项.来源 !== 'compat') await 读取并注册(项)
  }
}

export function 查找字体记录(名称: string): 字体记录[] {
  const 键 = 规范化字体键(名称)
  const 全部 = 读取字体目录快照().字体
  return 全部.filter((项) => {
    if (规范化字体键(项.家族) === 键 || 规范化字体键(项.名称) === 键) return true
    return (项.别名 ?? []).some((别名) => 规范化字体键(别名) === 键)
  }).sort((左, 右) => {
    const 序: Record<string, number> = { embedded: 0, custom: 1, builtin: 2, system: 3, compat: 4 }
    return (序[左.来源] ?? 9) - (序[右.来源] ?? 9)
  })
}

export async function 确保名称已注册(名称: string[]): Promise<void> {
  const 记录 = 去重(名称).flatMap((项) => 查找字体记录(项)).filter((项) => 项.来源 !== 'system' && 项.来源 !== 'compat')
  await 确保字体已注册(记录)
}

export async function 初始化字体目录(强制刷新 = false): Promise<void> {
  if (初始化状态 === '加载中' && 初始化任务) return 初始化任务
  if (初始化状态 === '完成' && !强制刷新) return
  初始化状态 = '加载中'
  初始化错误 = ''
  通知()
  初始化任务 = (async () => {
    if (桥接.fonts.可用) {
      try {
        const 结果 = await 桥接.fonts.list({ 刷新: 强制刷新 })
        if (结果.成功 && 结果.数据) {
          系统字体 = Array.isArray(结果.数据.系统) ? 结果.数据.系统.map((项) => ({ ...项, 来源: 'system' as const })) : []
          平台 = typeof 结果.数据.平台 === 'string' ? 结果.数据.平台 : ''
          自定义字体 = Array.isArray(结果.数据.自定义) ? 结果.数据.自定义.map((项) => ({ ...项, 来源: 'custom' as const })) : []
          初始化状态 = '完成'
        } else {
          初始化状态 = '完成'
          初始化错误 = 结果.错误 || '读取本机字体目录失败'
        }
      } catch (错误) {
        初始化状态 = '完成'
        初始化错误 = 错误 instanceof Error ? 错误.message : '读取本机字体目录失败'
      }
    } else {
      初始化状态 = '完成'
      if (!document.documentElement.dataset.sealPlatform) 初始化错误 = '当前环境不支持读取系统字体'
    }
    通知()
  })().finally(() => { 初始化任务 = null })
  return 初始化任务
}

export async function 导入字体(): Promise<{ 导入: number; 重复: number; 失败: string[] }> {
  const 结果 = await 桥接.fonts.import()
  if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '导入字体失败')
  const { 导入, 重复, 失败 } = 结果.数据
  if (导入.length > 0) {
    自定义字体 = [...导入, ...自定义字体]
    await 确保字体已注册(导入)
    通知()
  }
  return { 导入: 导入.length, 重复: 重复.length, 失败: 失败.map((项) => `${项.文件}：${项.原因}`) }
}

export async function 移除字体(标识: string): Promise<string[]> {
  const 结果 = await 桥接.fonts.remove(标识)
  if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '移除字体失败')
  自定义字体 = 自定义字体.filter((项) => 项.标识 !== 标识)
  字体字节.delete(标识)
  通知()
  return 结果.数据.移除
}

export async function 打开字体目录(): Promise<string> {
  const 结果 = await 桥接.fonts.openFolder()
  if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '无法打开字体目录')
  return 结果.数据.路径
}

// ---------------- 文档字体收集与嵌入 ----------------

function 加入字体(集合: Set<string>, 值: unknown): void {
  if (typeof 值 !== 'string') return
  const 首选 = 值.split(',')[0]?.trim().replace(/^["']|["']$/g, '')
  if (!首选 || 首选.length > 120 || 忽略字体.has(首选.toLowerCase())) return
  if (/^(?:var|url|attr|calc|rgb|hsl)\(/i.test(首选)) return
  集合.add(首选)
}

function 从Html收集(html: string, 集合: Set<string>): void {
  const 样式 = /font-family\s*:\s*([^;"'}]+)/gi
  let 匹配: RegExpExecArray | null
  while ((匹配 = 样式.exec(html)) !== null) 加入字体(集合, 匹配[1])
  const face = /<font\b[^>]*\bface\s*=\s*["']([^"']+)["']/gi
  while ((匹配 = face.exec(html)) !== null) 加入字体(集合, 匹配[1])
}

function 遍历字体字段(值: unknown, 集合: Set<string>, 深度 = 0): void {
  if (值 === null || 值 === undefined || 深度 > 12) return
  if (Array.isArray(值)) {
    for (const 项 of 值) 遍历字体字段(项, 集合, 深度 + 1)
    return
  }
  if (typeof 值 !== 'object') return
  for (const [键, 项] of Object.entries(值 as Record<string, unknown>)) {
    if (键 === '字体资源' || 键 === '原包' || 键 === 'PDF数据' || 键 === '资源条目') continue
    if (键 === '字体' || 键 === '字体名' || 键 === 'fontFamily' || 键 === 'font-family') {
      if (typeof 项 === 'string') 加入字体(集合, 项)
      else if (项 && typeof 项 === 'object') {
        for (const 子 of Object.values(项 as Record<string, unknown>)) 加入字体(集合, 子)
      }
      continue
    }
    遍历字体字段(项, 集合, 深度 + 1)
  }
}

export function 收集文档字体(类型: string, 数据: unknown): string[] {
  const 集合 = new Set<string>()
  if (!数据 || typeof 数据 !== 'object') return []
  const 记录 = 数据 as Record<string, unknown>
  if (类型 === 'word') {
    if (typeof 记录.html === 'string') 从Html收集(记录.html, 集合)
    const 页面设置 = 记录.页面设置
    if (页面设置 && typeof 页面设置 === 'object') {
      for (const 值 of Object.values(页面设置 as Record<string, unknown>)) if (typeof 值 === 'string') 从Html收集(值, 集合)
    }
  }
  遍历字体字段(数据, 集合)
  return [...集合]
}

function 可嵌入资源大小(数据: string): number {
  const 填充 = 数据.endsWith('==') ? 2 : 数据.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(数据.length * 3 / 4) - 填充)
}

async function 构造字体资源(类型: string, 数据: unknown): Promise<{ 资源: Array<Record<string, unknown>>; 限制: Array<Record<string, string>>; 未找到: string[]; 总量: number }> {
  const 资源: Array<Record<string, unknown>> = []
  const 限制: Array<Record<string, string>> = []
  const 未找到: string[] = []
  const 已见 = new Set<string>()
  let 总量 = 0
  const 现有 = (数据 as { 字体资源?: unknown })?.字体资源
  if (Array.isArray(现有)) {
    for (const 项 of 现有) {
      if (!项 || typeof 项 !== 'object') continue
      const 记录 = 项 as Record<string, unknown>
      if (typeof 记录.标识 !== 'string' || typeof 记录.数据 !== 'string') continue
      if (已见.has(记录.标识)) continue
      const 大小 = 可嵌入资源大小(记录.数据)
      if (总量 + 大小 > 最大嵌入字节) continue
      资源.push(记录); 已见.add(记录.标识); 总量 += 大小
    }
  }
  for (const 名称 of 收集文档字体(类型, 数据)) {
    const 候选 = 查找字体记录(名称)
    const 记录 = 候选.find((项) => 项.可嵌入 && !已见.has(项.标识))
    if (!记录) {
      // 通用族由 CSS 自身跨平台解析，不需要嵌入字节，也不应写授权限制。
      if (候选.length === 0) 未找到.push(名称)
      else if (!候选.every((项) => 项.来源 === 'compat')) 限制.push({ 名称, 原因: '字体授权不允许写入文档' })
      continue
    }
    const 已有字节 = 字体字节.get(记录.标识)
    let 内容 = 已有字节?.数据
    if (!内容) {
      const 读取 = await 获取字体内容(记录)
      if (!读取) { 未找到.push(名称); continue }
      内容 = 读取
    }
    const 大小 = 可嵌入资源大小(内容)
    if (总量 + 大小 > 最大嵌入字节) {
      限制.push({ 名称, 原因: '文档字体总量超过 56 MiB，未嵌入该字体' })
      continue
    }
    资源.push({
      标识: 记录.标识,
      名称: 记录.名称,
      家族: 记录.家族,
      英文名: 记录.英文名 ?? '',
      别名: (记录.别名 ?? []).slice(0, 24),
      样式: 记录.样式,
      字重: 记录.字重,
      斜体: 记录.斜体,
      格式: 记录.格式,
      文件大小: 大小,
      数据: 内容,
      数据指纹: await 摘要(Base64转字节(内容)),
    })
    已见.add(记录.标识)
    总量 += 大小
  }
  return { 资源, 限制, 未找到, 总量 }
}

export async function 准备保存字体资源(类型: string, 数据: unknown): Promise<unknown> {
  if (!数据 || typeof 数据 !== 'object' || 类型 === 'pdf') return 数据
  // 字体目录尚未就绪时不要把“未找到”写进文档；测试和仅转换文件的宿主
  // 也不应因为空目录改变原有载荷结构。
  if (初始化状态 !== '完成') await 初始化字体目录()
  if (读取字体目录快照().字体.length === 0) return 数据
  const { 资源, 限制, 未找到 } = await 构造字体资源(类型, 数据)
  const 附加: Record<string, unknown> = {}
  if (资源.length > 0) { 附加.字体资源 = 资源; 附加.字体格式 = 1 }
  if (限制.length > 0) 附加.字体嵌入限制 = 限制
  if (未找到.length > 0) 附加.字体缺失 = [...new Set(未找到)]
  return { ...(数据 as Record<string, unknown>), ...附加 }
}

function 注册嵌入字体(数据: unknown): void {
  if (!数据 || typeof 数据 !== 'object') return
  const 资源 = (数据 as { 字体资源?: unknown }).字体资源
  if (!Array.isArray(资源)) return
  const 新增: 字体记录[] = []
  for (const 项 of 资源) {
    if (!项 || typeof 项 !== 'object') continue
    const 记录 = 项 as Record<string, unknown>
    if (typeof 记录.标识 !== 'string' || typeof 记录.数据 !== 'string' || typeof 记录.家族 !== 'string') continue
    if (嵌入字面.some((已有) => 已有.标识 === 记录.标识)) continue
    const 字节 = (() => { try { return Base64转字节(记录.数据) } catch { return null } })()
    if (!字节 || 字节.length === 0) continue
    const 字面: 字体记录 = {
      标识: 记录.标识,
      名称: String(记录.名称 || 记录.家族),
      家族: String(记录.家族),
      英文名: typeof 记录.英文名 === 'string' ? 记录.英文名 : undefined,
      别名: Array.isArray(记录.别名) ? 记录.别名.filter((别名): 别名 is string => typeof 别名 === 'string') : [],
      样式: String(记录.样式 || 'Regular'),
      字重: Number(记录.字重) || 400,
      斜体: Boolean(记录.斜体),
      格式: String(记录.格式 || 'ttf'),
      大小: 字节.length,
      中文字形: true,
      拉丁字形: true,
      可嵌入: true,
      来源: 'embedded',
    }
    记忆字节(字面.标识, 记录.数据, 字面)
    嵌入字面.push(字面)
    新增.push(字面)
  }
  if (新增.length > 0) {
    void 确保字体已注册(新增).then(通知)
    通知()
  }
}

/** 打开文档后注册嵌入字体，并诊断自定义字体是否缺失。缺失只提示，不阻断打开。 */
export async function 准备打开文档字体(类型: string, 数据: unknown): Promise<void> {
  if (初始化状态 !== '完成') await 初始化字体目录()
  if (数据 && typeof 数据 === 'object') {
    const 嵌入 = (数据 as { 字体资源?: unknown }).字体资源
    if (Array.isArray(嵌入) && 嵌入.length > 0) {
      注册嵌入字体(数据)
      // 等字体真正进入 document.fonts，首屏才不会先用替代字形排版。
      await 确保字体已注册(嵌入字面)
    }
  }
  const 名称 = 收集文档字体(类型, 数据)
  if (名称.length === 0) return
  await 确保名称已注册(名称)
  if (读取字体目录快照().字体.length === 0) return
  const 缺失 = 名称.filter((项) => 查找字体记录(项).length === 0)
  // 系统通用字体缺失由 CSS 通用回退处理，不逐次打断打开流程；真正容易
  // 改变公文版式的专用字体（GB2312、方正、华文、WPS 等）才提示导入。
  const 需要提示 = 缺失.filter((项) => /gb2312|gbk|方正|fz|华文|st[^a-z]?|wps|小标宋|仿宋|楷体_|书宋|大标宋|粗宋/i.test(项))
  if (需要提示.length > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('seal-font-missing', { detail: { 字体: 需要提示, 类型 } }))
  }
}

注册海豹格式增强({
  写入: 准备保存字体资源,
  读取: async (结果, 扩展) => {
    if (结果?.成功) {
      const 类型 = 扩展 === 'slxls' || 扩展 === 'sealsheet' ? 'table' : 扩展 === 'slppt' || 扩展 === 'sealshow' ? 'ppt' : 'word'
      await 准备打开文档字体(类型, 结果)
      if (类型 === 'word' && typeof 结果.html === 'string' && 读取字体目录快照().字体.length > 0) 结果.html = 增强字体回退Html(结果.html)
    }
    return 结果
  },
})

/** 测试与诊断：返回兼容回退链，不读取字体字节。 */
export const 字体内部 = { 收集文档字体, 构造字体资源 }
