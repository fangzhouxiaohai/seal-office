// 扫描图片来源：拍照（仅 Android / HarmonyOS 原生工作台）、相册或文件导入、截图粘贴（桌面）。
// 原生能力由移动工作台桥接注入（mobile/web/bridge.ts），渲染层不直接依赖移动端源码。

declare global {
  interface Window {
    /** 原生宿主拍照；拒绝相机权限时以 name = CameraDeniedError 拒绝 */
    sealCamera?: () => Promise<File[]>
    /** 原生宿主的系统文件选择器（鸿蒙 WebView 的文件输入不可靠，走宿主通道） */
    sealPickImages?: (multiple: boolean) => Promise<File[]>
  }
}

/** 单据批量识别上限，与需求“100 张以内”一致 */
export const 最大批量 = 100
const 图片扩展名 = /\.(?:jpe?g|png|webp|bmp|gif)$/i

export function 是图片文件(文件: File): boolean {
  return /^image\//i.test(文件.type) || 图片扩展名.test(文件.name)
}

export function 是相机拒绝(错误: unknown): boolean {
  return 错误 instanceof Error && 错误.name === 'CameraDeniedError'
}

export async function 拍照(): Promise<File[]> {
  if (typeof window.sealCamera !== 'function') throw new Error('当前安装包不提供拍照，请改用导入图片')
  return window.sealCamera()
}

/** 打开系统文件选择器选择图片；取消时返回空数组 */
export function 选择图片(多选 = true): Promise<File[]> {
  if (typeof window.sealPickImages === 'function') return window.sealPickImages(多选)
  return new Promise<File[]>((完成) => {
    const 输入 = document.createElement('input')
    输入.type = 'file'; 输入.accept = 'image/*'; 输入.multiple = 多选; 输入.hidden = true
    let 已结束 = false, 计时: ReturnType<typeof setTimeout> | undefined
    const 结束 = (文件: File[]) => { if (已结束) return; 已结束 = true; clearTimeout(计时); 输入.remove(); window.removeEventListener('focus', 聚焦); 完成(文件) }
    // 部分 WebView 不触发 cancel 事件：窗口重新获得焦点且仍无文件时视为取消。
    const 聚焦 = () => { 计时 = setTimeout(() => { if (!输入.files?.length) 结束([]) }, 1500) }
    输入.addEventListener('change', () => 结束(Array.from(输入.files ?? [])), { once: true })
    输入.addEventListener('cancel', () => 结束([]), { once: true })
    window.addEventListener('focus', 聚焦, { once: true })
    document.body.appendChild(输入); 输入.click()
  })
}

/** 从粘贴事件中取出图片（截图粘贴） */
export function 剪贴板图片(事件: ClipboardEvent): File[] {
  const 结果: File[] = []
  for (const 项 of Array.from(事件.clipboardData?.items ?? [])) {
    if (项.kind !== 'file' || !项.type.startsWith('image/')) continue
    const 文件 = 项.getAsFile()
    if (文件) 结果.push(new File([文件], 文件.name && 文件.name !== 'image.png' ? 文件.name : `截图-${Date.now()}.png`, { type: 文件.type }))
  }
  return 结果
}

/** 读取文件字节；旧版 WebView 的 Blob 可能没有 arrayBuffer，退回 FileReader */
export function 读取字节(文件: Blob): Promise<Uint8Array> {
  if (typeof (文件 as Blob & { arrayBuffer?: unknown }).arrayBuffer === 'function') return 文件.arrayBuffer().then(数据 => new Uint8Array(数据))
  return new Promise((完成, 失败) => {
    const 读取器 = new FileReader()
    读取器.onload = () => 完成(new Uint8Array(读取器.result as ArrayBuffer))
    读取器.onerror = () => 失败(new Error('图片读取失败，请重新选择'))
    读取器.readAsArrayBuffer(文件)
  })
}
