// 翻译设置持久化：通过 localStorage 保存 翻译服务地址、密钥 与 目标语言。
// 提供纯函数 读取翻译配置/保存翻译配置，供设置页写入、翻译面板读取。
import type { 翻译配置 } from './translate'

const 存储键 = 'seal.office.translate'

interface 存储结构 {
  地址: string
  密钥?: string
  目标语言?: string
}

/** 从 localStorage 读取翻译配置；仅未保存时返回空配置，损坏或读取失败由调用方报告。 */
export function 读取翻译配置(): 翻译配置 {
  const 原文 = localStorage.getItem(存储键)
  if (原文 === null) {
    return { 地址: '', 密钥: '', 目标语言: 'zh' }
  }
  let 数据: 存储结构
  try {
    数据 = JSON.parse(原文) as 存储结构
  } catch {
    throw new Error('翻译设置内容已损坏，请在设置中心恢复默认后重新配置')
  }
  if (!数据 || typeof 数据 !== 'object' || typeof 数据.地址 !== 'string' ||
    (数据.密钥 !== undefined && typeof 数据.密钥 !== 'string') ||
    (数据.目标语言 !== undefined && typeof 数据.目标语言 !== 'string')) {
    throw new Error('翻译设置格式无效，请在设置中心恢复默认后重新配置')
  }
  return {
    地址: 数据.地址,
    密钥: 数据.密钥 ?? '',
    目标语言: 数据.目标语言 ?? 'zh',
  }
}

/** 将翻译配置写入 localStorage；密钥字段可为空字符串表示未设置 */
export function 保存翻译配置(配置: 翻译配置): void {
  const 数据: 存储结构 = {
    地址: 配置.地址,
    密钥: 配置.密钥,
    目标语言: 配置.目标语言,
  }
  localStorage.setItem(存储键, JSON.stringify(数据))
}

/** 清除本机保存的翻译服务配置。 */
export function 清除翻译配置(): void {
  localStorage.removeItem(存储键)
}

/** 判断翻译服务是否已配置可用的服务地址 */
export function 已配置翻译服务(配置: 翻译配置): boolean {
  return typeof 配置.地址 === 'string' && 配置.地址.trim().length > 0
}
