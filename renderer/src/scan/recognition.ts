// 扫描识别：复用现有在线识别通道（cloudCall('ocrImage')，主进程 main/cloud/ocrImage.js），
// 上传前统一走 scanConsent 的单次授权确认，拒绝则不上传任何图片。
import type { ReactNode } from 'react'
import { cloudCall } from '../cloud/CloudProvider'
import { confirmScanUpload } from '../cloud/scanConsent'
import type { PDF页来源 } from './pdfPageSource'
import { 读取字节 } from './scanInput'

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
  页列表: Array<{ 图片: Uint8Array; 类型: string; PDF?: PDF页来源 }>,
  选项: { 表格?: boolean; 进度?: (完成: number, 总数: number) => void } = {},
): Promise<识别结果[]> {
  if (!页列表.length) throw new Error('请先添加需要识别的图片')
  const 上传数 = 页列表.reduce((n,p) => n + (p.PDF?.文字 ? p.PDF.待识别图块.length : 1),0)
  if (上传数 && !await confirmScanUpload(弹窗, 识别授权说明(上传数))) throw Object.assign(new Error('已取消识别，图片未上传'), { name: 'ScanConsentDeclined' })
  const 结果: 识别结果[] = []
  选项.进度?.(0, 页列表.length)
  for (const 页 of 页列表) {
    try {
      const recognize = (bytes: Uint8Array, type: string) => cloudCall<{text:string}>('ocrImage', { data:字节转Base64(bytes),mime:type,consent:true,...(选项.表格 ? {layout:'table'} : {}) })
      if (页.PDF?.文字) {
        const lines = 页.PDF.文字.split('\n')
        const normalize = (line: string) => line.replace(/\s+/g,'')
        const sourceLines = new Set(lines.map(normalize))
        for (const crop of 页.PDF.待识别图块) {
          const ocr = await recognize(await 读取字节(crop),crop.type)
          for (const line of ocr.text.split('\n')) if (line.trim() && !sourceLines.has(normalize(line))) { lines.push(line); sourceLines.add(normalize(line)) }
        }
        结果.push({ 文字:lines.join('\n') })
      } else 结果.push({ 文字:(await recognize(页.图片,页.类型)).text })
    } catch (错误) {
      if (整批中止(错误)) throw 错误
      结果.push({ 错误: 错误 instanceof Error ? 错误.message : '识别失败，请重试' })
    }
    选项.进度?.(结果.length, 页列表.length)
  }
  return 结果
}

export const 是取消授权 = (错误: unknown) => 错误 instanceof Error && 错误.name === 'ScanConsentDeclined'
