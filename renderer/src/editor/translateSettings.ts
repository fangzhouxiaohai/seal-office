// 翻译设置持久化：非敏感字段（服务地址、目标语言）保存在本机普通设置，
// 服务密钥只经主进程系统安全存储读写，绝不以明文写入 localStorage 或日志。
// 旧版本曾把密钥明文写入本机设置：首次读取时迁移到安全存储，并在写入并读回校验成功后才清除明文。
import type { 翻译配置 } from './translate'
import { 桥接 } from '../ipc/bridge'

const 存储键 = 'seal.office.translate'
const 服务种类 = '翻译' as const

interface 存储结构 {
  地址: string
  目标语言?: string
  /** 仅存在于旧版本配置中；读取时会被迁移并清除 */
  密钥?: string
}

export interface 翻译设置 extends 翻译配置 {
  /** 密钥已存入系统安全存储；界面只显示该状态，不回显明文 */
  已配置密钥: boolean
}

function 解析普通设置(): 存储结构 {
  const 原文 = localStorage.getItem(存储键)
  if (原文 === null) return { 地址: '', 目标语言: 'zh' }
  let 数据: unknown
  try {
    数据 = JSON.parse(原文)
  } catch {
    throw new Error('翻译设置内容已损坏，请在设置中心恢复默认后重新配置')
  }
  if (!数据 || typeof 数据 !== 'object' || typeof (数据 as 存储结构).地址 !== 'string' ||
    ((数据 as 存储结构).密钥 !== undefined && typeof (数据 as 存储结构).密钥 !== 'string') ||
    ((数据 as 存储结构).目标语言 !== undefined && typeof (数据 as 存储结构).目标语言 !== 'string')) {
    throw new Error('翻译设置格式无效，请在设置中心恢复默认后重新配置')
  }
  return { 地址: (数据 as 存储结构).地址, 目标语言: (数据 as 存储结构).目标语言, 密钥: (数据 as 存储结构).密钥 }
}

function 写入普通设置(地址: string, 目标语言: string): void {
  localStorage.setItem(存储键, JSON.stringify({ 地址, 目标语言 }))
}

/** 旧明文密钥迁移：写入安全存储并读回校验成功后，才把明文从普通设置中移除。 */
async function 迁移旧明文密钥(数据: 存储结构): Promise<void> {
  const 密钥 = 数据.密钥 ?? ''
  if (密钥.length === 0) return
  const 结果 = await 桥接.presentationAi.migrateLegacyTranslate({ 地址: 数据.地址, 密钥, 目标语言: 数据.目标语言 ?? 'zh' })
  if (!结果.成功) throw new Error(`旧翻译密钥迁移失败，已保留本机配置：${结果.错误 ?? '系统安全存储不可用'}`)
  if (!结果.数据?.成功) throw new Error(`旧翻译密钥迁移失败，已保留本机配置：${结果.数据?.原因 ?? '安全存储写入后校验未通过'}`)
  // 迁移成功后只清除明文密钥，保留用户本机的地址与目标语言
  写入普通设置(数据.地址, 数据.目标语言 ?? 结果.数据.目标语言 ?? 'zh')
}

async function 读取安全服务(): Promise<{ 地址?: string; 目标语言?: string; 已配置密钥?: boolean } | null> {
  if (!桥接.presentationAi.可用) return null
  const 结果 = await 桥接.presentationAi.getService(服务种类)
  if (!结果.成功) throw new Error(结果.错误 ?? '无法读取系统安全存储中的翻译服务配置')
  return 结果.数据 ?? null
}

/** 读取翻译设置：地址与目标语言来自普通设置，密钥状态来自系统安全存储。 */
export async function 读取翻译配置(): Promise<翻译设置> {
  const 数据 = 解析普通设置()
  await 迁移旧明文密钥(数据)
  const 服务 = await 读取安全服务()
  return {
    地址: 数据.地址.trim().length > 0 ? 数据.地址 : (服务?.地址 ?? ''),
    密钥: '',
    目标语言: 数据.目标语言 ?? 服务?.目标语言 ?? 'zh',
    已配置密钥: Boolean(服务?.已配置密钥),
  }
}

/** 保存翻译设置：密钥只写系统安全存储；没有安全存储时明确报错，不回退明文。 */
export async function 保存翻译配置(配置: 翻译配置 & { 清除密钥?: boolean }): Promise<void> {
  const 目标语言 = 配置.目标语言 ?? 'zh'
  const 需要安全存储 = 配置.清除密钥 === true || (typeof 配置.密钥 === 'string' && 配置.密钥.length > 0)
  if (需要安全存储 && !桥接.presentationAi.可用) {
    throw new Error('当前环境不支持系统安全存储，无法安全保存翻译密钥；请使用 Windows 桌面版，或只填写服务地址')
  }
  if (需要安全存储) {
    const 结果 = await 桥接.presentationAi.saveService(服务种类, {
      地址: 配置.地址,
      目标语言,
      ...(配置.清除密钥 ? { 清除密钥: true } : { 密钥: 配置.密钥 }),
    })
    if (!结果.成功) throw new Error(结果.错误 ?? '无法写入系统安全存储')
  }
  写入普通设置(配置.地址, 目标语言)
}

/** 清除本机保存的翻译服务配置（普通设置与安全存储同时清除）。 */
export async function 清除翻译配置(): Promise<void> {
  try {
    if (桥接.presentationAi.可用) {
      const 结果 = await 桥接.presentationAi.clearService(服务种类)
      if (!结果.成功) throw new Error(结果.错误 ?? '无法清除系统安全存储中的翻译服务配置')
    }
  } finally {
    localStorage.removeItem(存储键)
  }
}

/** 判断翻译服务是否已配置可用的服务地址 */
export function 已配置翻译服务(配置: 翻译配置): boolean {
  return typeof 配置.地址 === 'string' && 配置.地址.trim().length > 0
}
