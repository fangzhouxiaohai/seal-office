/**
 * 放映本机偏好：屏幕、指针与媒体音量属于当前机器与运行会话，
 * 不写入文稿模型，也不产生正文未保存标记；文稿内的放映范围与换片方式另存于演示文稿。
 */
export interface 放映偏好 {
  屏幕: string
  指针: '箭头' | '激光笔' | '隐藏'
  媒体音量: number
}

export const 默认放映偏好: 放映偏好 = { 屏幕: '主屏', 指针: '激光笔', 媒体音量: 80 }

const 存储键 = 'seal.ppt.放映偏好'

export function 校验放映偏好(输入: unknown): 放映偏好 {
  if (typeof 输入 !== 'object' || 输入 === null || Array.isArray(输入)) return 默认放映偏好
  const 值 = 输入 as Record<string, unknown>
  const 屏幕 = typeof 值.屏幕 === 'string' && 值.屏幕.length > 0 ? 值.屏幕 : 默认放映偏好.屏幕
  const 指针 = ['箭头', '激光笔', '隐藏'].includes(String(值.指针)) ? 值.指针 as 放映偏好['指针'] : 默认放映偏好.指针
  const 音量 = Number.isFinite(值.媒体音量) && (值.媒体音量 as number) >= 0 && (值.媒体音量 as number) <= 100
    ? Math.round(值.媒体音量 as number)
    : 默认放映偏好.媒体音量
  return { 屏幕, 指针, 媒体音量: 音量 }
}

export function 读取放映偏好(存储: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): 放映偏好 {
  if (!存储) return 默认放映偏好
  try {
    const 原文 = 存储.getItem(存储键)
    return 原文 ? 校验放映偏好(JSON.parse(原文)) : 默认放映偏好
  } catch {
    return 默认放映偏好
  }
}

export function 保存放映偏好(偏好: 放映偏好, 存储: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): void {
  if (!存储) return
  try { 存储.setItem(存储键, JSON.stringify(校验放映偏好(偏好))) } catch { /* 存储不可用时保持当前会话设置 */ }
}
