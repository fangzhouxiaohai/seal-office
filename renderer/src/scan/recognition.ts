// 扫描识别：复用现有在线识别通道（cloudCall('ocrImage')，主进程 main/cloud/ocrImage.js），
// 上传前统一走 scanConsent 的单次授权确认，拒绝则不上传任何图片。
import type { ReactNode } from 'react'
import { cloudCall } from '../cloud/CloudProvider'
import { confirmScanUpload } from '../cloud/scanConsent'

export interface 识别结果 { 文字?: string; 错误?: string }

export function 字节转Base64(字节: Uint8Array): string {
  let 文本 = ''
  for (let 起 = 0; 起 < 字节.length; 起 += 0x8000) 文本 += String.fromCharCode(...字节.subarray(起, 起 + 0x8000))
  return btoa(文本)
}

export function 识别授权说明(数量: number): ReactNode {
  return `确认后将所选的 ${数量} 张图片发送给当前配置的 AI 服务识别文字，处理期间该服务可读取图片内容。识别结果可能有误，请对照原图核对。`
}

/** 账户、身份或服务配置类错误整批中止，避免对每张图片重复失败 */
const 整批中止 = (错误: unknown) => {
  const 值 = 错误 as { 需要登录?: boolean; code?: string; status?: number }
  return Boolean(值?.需要登录) || 值?.code === 'AI_IDENTITY_REQUIRED' || 值?.status === 401 || 值?.status === 403
}

export async function 识别图片文字(
  弹窗: unknown,
  页列表: Array<{ 图片: Uint8Array; 类型: string }>,
  选项: { 表格?: boolean; 进度?: (完成: number, 总数: number) => void } = {},
): Promise<识别结果[]> {
  if (!页列表.length) throw new Error('请先添加需要识别的图片')
  const 同意 = await confirmScanUpload(弹窗, 识别授权说明(页列表.length))
  if (!同意) throw Object.assign(new Error('已取消识别，图片未上传'), { name: 'ScanConsentDeclined' })
  const 结果: 识别结果[] = []
  选项.进度?.(0, 页列表.length)
  for (const 页 of 页列表) {
    try {
      const 返回 = await cloudCall<{ text: string }>('ocrImage', { data: 字节转Base64(页.图片), mime: 页.类型, consent: true, ...(选项.表格 ? { layout: 'table' } : {}) })
      结果.push({ 文字: 返回.text })
    } catch (错误) {
      if (整批中止(错误)) throw 错误
      结果.push({ 错误: 错误 instanceof Error ? 错误.message : '识别失败，请重试' })
    }
    选项.进度?.(结果.length, 页列表.length)
  }
  return 结果
}

export const 是取消授权 = (错误: unknown) => 错误 instanceof Error && 错误.name === 'ScanConsentDeclined'
