// 屏幕捕获与录制的本机能力封装：所有失败都返回真实原因，不用假数据冒充成功。
// 依赖可注入，便于在不具备真实采集设备的测试环境中验证状态机与错误路径。

export interface 媒体设备接口 { getUserMedia(约束: unknown): Promise<MediaStream> }
export interface 录制器接口 {
  state?: string
  ondataavailable: ((事件: { data: Blob }) => void) | null
  onstop: (() => void) | null
  onerror?: ((事件: unknown) => void) | null
  start(毫秒?: number): void
  pause?(): void
  resume?(): void
  stop(): void
}
export interface 录制器构造接口 {
  new (流: MediaStream, 选项?: unknown): 录制器接口
  isTypeSupported?(类型: string): boolean
}
export interface 画布接口 {
  width: number
  height: number
  getContext(类型: '2d'): { drawImage(...参数: unknown[]): void } | null
  toDataURL(类型?: string): string
}
export interface 视频接口 { videoWidth: number; videoHeight: number }
export interface 捕获依赖 {
  媒体设备?: 媒体设备接口 | null
  录制器构造?: 录制器构造接口 | null
  画布工厂?: () => 画布接口
  视频工厂?: () => 视频接口
  现在?: () => number
}

export interface 裁剪区域 { x: number; y: number; 宽: number; 高: number }
export type 录制状态 = '未开始' | '录制中' | '已暂停' | '已停止'

const 候选媒体类型 = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

export function 解析捕获源标识(标识: unknown): { 类型: 'screen' | 'window'; 标识: string } {
  if (typeof 标识 !== 'string' || 标识.length === 0) throw new Error('捕获源为空：请先选择要捕获的屏幕或窗口')
  if (标识.startsWith('screen:')) return { 类型: 'screen', 标识 }
  if (标识.startsWith('window:')) return { 类型: 'window', 标识 }
  throw new Error('捕获源标识无效：只支持屏幕或窗口')
}

function 取媒体设备(依赖: 捕获依赖): 媒体设备接口 | null {
  if ('媒体设备' in 依赖) return 依赖.媒体设备 ?? null
  return typeof navigator !== 'undefined' && navigator.mediaDevices ? (navigator.mediaDevices as unknown as 媒体设备接口) : null
}

function 取录制器构造(依赖: 捕获依赖): 录制器构造接口 | null {
  if ('录制器构造' in 依赖) return 依赖.录制器构造 ?? null
  return typeof globalThis.MediaRecorder !== 'undefined' ? (globalThis.MediaRecorder as unknown as 录制器构造接口) : null
}

/** 桌面捕获使用 chromeMediaSource 约束；失败原因原样上抛，便于界面显示。 */
export async function 创建屏幕流(源标识: unknown, 依赖: 捕获依赖 = {}): Promise<MediaStream> {
  const { 标识 } = 解析捕获源标识(源标识)
  const 媒体设备 = 取媒体设备(依赖)
  if (!媒体设备) throw new Error('当前环境不支持屏幕捕获，请使用 Windows 桌面版')
  try {
    return await 媒体设备.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: 标识,
          maxWidth: 3840,
          maxHeight: 2160,
          maxFrameRate: 30,
        },
      },
    })
  } catch (错误) {
    throw new Error(`屏幕捕获失败：${错误 instanceof Error ? 错误.message : '系统未授权或该窗口已关闭'}`)
  }
}

export async function 创建麦克风流(依赖: 捕获依赖 = {}): Promise<MediaStream> {
  const 媒体设备 = 取媒体设备(依赖)
  if (!媒体设备) throw new Error('当前环境不支持麦克风采集')
  try {
    return await 媒体设备.getUserMedia({ audio: true, video: false })
  } catch (错误) {
    throw new Error(`麦克风不可用：${错误 instanceof Error ? 错误.message : '系统未授权或被其他程序占用'}`)
  }
}

export function 录制媒体类型(依赖: 捕获依赖 = {}): { 支持: boolean; 媒体类型?: string; 原因?: string } {
  const 构造 = 取录制器构造(依赖)
  if (!构造) return { 支持: false, 原因: '当前环境不支持屏幕录制，请使用 Windows 桌面版' }
  if (typeof 构造.isTypeSupported !== 'function') return { 支持: false, 原因: '当前环境无法检测 WebM 录制编码' }
  for (const 类型 of 候选媒体类型) {
    try { if (构造.isTypeSupported(类型)) return { 支持: true, 媒体类型: 类型 } } catch { /* 单个候选检测失败时继续尝试 */ }
  }
  return { 支持: false, 原因: '当前环境不支持 WebM 录制编码，无法开始录屏' }
}

export interface 录制结果 { 数据块: Blob; 媒体类型: string; 时长毫秒: number }

/** 屏幕流建立后画面尺寸尚未就绪时等待元数据；超过等待时间如实报错。 */
export async function 等待画面就绪(视频: 视频接口, 超时毫秒 = 5000): Promise<void> {
  if (Number(视频?.videoWidth ?? 0) > 0 && Number(视频?.videoHeight ?? 0) > 0) return
  const 可监听 = 视频 as unknown as { addEventListener?: (类型: string, 处理: () => void) => void; removeEventListener?: (类型: string, 处理: () => void) => void }
  if (typeof 可监听.addEventListener !== 'function') throw new Error('画面尚未就绪，请稍候再截取')
  await new Promise<void>((完成, 失败) => {
    let 已结束 = false
    const 结束 = (错误?: Error) => {
      if (已结束) return
      已结束 = true
      clearTimeout(计时)
      可监听.removeEventListener?.('loadedmetadata', 就绪)
      可监听.removeEventListener?.('error', 出错)
      if (错误) 失败(错误); else 完成()
    }
    const 就绪 = () => 结束()
    const 出错 = () => 结束(new Error('画面加载失败，请重新选择捕获源'))
    const 计时 = setTimeout(() => 结束(new Error('等待画面就绪超时，请重新选择捕获源')), 超时毫秒)
    可监听.addEventListener?.('loadedmetadata', 就绪)
    可监听.addEventListener?.('error', 出错)
  })
  if (Number(视频?.videoWidth ?? 0) <= 0 || Number(视频?.videoHeight ?? 0) <= 0) throw new Error('画面尚未就绪，请稍候再截取')
}

export const 允许识别图片类型 = ['image/png', 'image/jpeg', 'image/webp']
export const 识别图片最大字节 = 8 * 1024 * 1024

/** 读取一张本机图片为可发送的 base64；类型、空文件与大小都在这里拦截。 */
export async function 读取图片文件(文件: File): Promise<{ 数据: string; 类型: string }> {
  if (!文件 || typeof 文件.size !== 'number' || 文件.size <= 0) throw new Error('图片为空，请重新选择')
  if (!允许识别图片类型.includes(文件.type)) throw new Error('图片格式不支持：只接受 PNG、JPEG 或 WebP')
  if (文件.size > 识别图片最大字节) throw new Error(`图片超过大小限制：${文件.size} 字节`)
  const 地址 = await new Promise<string>((完成, 失败) => {
    const 读取器 = new FileReader()
    读取器.onload = () => typeof 读取器.result === 'string' ? 完成(读取器.result) : 失败(new Error('图片读取结果无效'))
    读取器.onerror = () => 失败(new Error('图片无法读取，请确认文件未损坏'))
    读取器.readAsDataURL(文件)
  })
  const 前缀 = `data:${文件.type};base64,`
  if (!地址.startsWith(前缀) || 地址.length <= 前缀.length) throw new Error('图片编码与所选格式不一致，请重新选择')
  return { 数据: 地址.slice(前缀.length), 类型: 文件.type }
}

/** 分批转换，避免一次性展开超长字节数组导致调用栈溢出。 */
export function 缓冲转base64(缓冲: ArrayBuffer): string {
  const 字节 = new Uint8Array(缓冲)
  if (字节.length === 0) throw new Error('录制片段为空，无法保存')
  let 二进制 = ''
  const 块大小 = 0x8000
  for (let 位置 = 0; 位置 < 字节.length; 位置 += 块大小) {
    二进制 += String.fromCharCode(...字节.subarray(位置, Math.min(位置 + 块大小, 字节.length)))
  }
  return btoa(二进制)
}

/** 预览地址只在环境支持时生成；不支持时保留片段本身，不把预览失败当成录制失败。 */
export function 创建预览地址(数据块: Blob): string {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return ''
  try { return URL.createObjectURL(数据块) } catch { return '' }
}

export function 释放预览地址(地址: string) {
  if (!地址 || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  try { URL.revokeObjectURL(地址) } catch { /* 地址已释放 */ }
}

export function 读取数据块(数据块: Blob): Promise<ArrayBuffer> {  if (typeof 数据块.arrayBuffer === 'function') return 数据块.arrayBuffer()
  return new Promise<ArrayBuffer>((完成, 失败) => {
    const 读取器 = new FileReader()
    读取器.onload = () => 读取器.result instanceof ArrayBuffer ? 完成(读取器.result) : 失败(new Error('录制片段读取失败'))
    读取器.onerror = () => 失败(new Error('录制片段读取失败'))
    读取器.readAsArrayBuffer(数据块)
  })
}

/** 截取当前视频帧并按区域裁剪；区域自动约束在画面范围内，越界不放大结果。 */

export function 创建录制会话(选项: { 视频流: MediaStream; 音频流?: MediaStream | null; 依赖?: 捕获依赖 }) {
  const 依赖 = 选项.依赖 ?? {}
  const 构造 = 取录制器构造(依赖)
  if (!构造) throw new Error('当前环境不支持屏幕录制，请使用 Windows 桌面版')
  const 编码 = 录制媒体类型(依赖)
  if (!编码.支持 || !编码.媒体类型) throw new Error(编码.原因 ?? '当前环境不支持 WebM 录制编码')
  const 现在 = 依赖.现在 ?? (() => Date.now())
  const 轨道 = [...(选项.视频流 as unknown as { getVideoTracks?(): MediaStreamTrack[] }).getVideoTracks?.() ?? [], ...(选项.音频流 ? (选项.音频流 as unknown as { getAudioTracks?(): MediaStreamTrack[] }).getAudioTracks?.() ?? [] : [])]
  let 合成流: MediaStream = 选项.视频流
  if (选项.音频流 && 轨道.length > 0 && typeof globalThis.MediaStream === 'function') {
    try { 合成流 = new MediaStream(轨道) } catch { 合成流 = 选项.视频流 }
  }
  const 数据块列表: Blob[] = []
  let 状态: 录制状态 = '未开始'
  let 开始时间 = 0
  let 录制器: 录制器接口 | null = null
  let 停止等待: { 完成: (值: 录制结果) => void; 失败: (错误: Error) => void } | null = null

  const 组装结果 = (): 录制结果 => {
    if (数据块列表.length === 0 || 数据块列表.every(块 => 块.size === 0)) throw new Error('没有捕获到任何视频数据，请确认所选屏幕或窗口仍在显示')
    return { 数据块: new Blob(数据块列表, { type: 编码.媒体类型 }), 媒体类型: 编码.媒体类型!, 时长毫秒: Math.max(0, 现在() - 开始时间) }
  }

  return {
    状态: () => 状态,
    开始() {
      if (状态 !== '未开始') throw new Error('录制已经开始，请勿重复开始')
      录制器 = new 构造(合成流, { mimeType: 编码.媒体类型 })
      录制器.ondataavailable = (事件) => { if (事件?.data) 数据块列表.push(事件.data) }
      录制器.onerror = (事件) => {
        const 消息 = (事件 as { error?: { message?: string } })?.error?.message
        停止等待?.失败(new Error(`录制过程中发生错误：${消息 ?? '采集设备已中断'}`))
        停止等待 = null
      }
      录制器.onstop = () => {
        if (!停止等待) return
        const 等待 = 停止等待
        停止等待 = null
        try { 等待.完成(组装结果()) } catch (错误) { 等待.失败(错误 instanceof Error ? 错误 : new Error('录制结果无效')) }
      }
      状态 = '录制中'
      开始时间 = 现在()
      录制器.start(1000)
    },
    暂停() {
      if (状态 !== '录制中' || !录制器) throw new Error('只有正在录制时才能暂停')
      录制器.pause?.()
      状态 = '已暂停'
    },
    继续() {
      if (状态 !== '已暂停' || !录制器) throw new Error('只有暂停状态才能继续录制')
      录制器.resume?.()
      状态 = '录制中'
    },
    停止(): Promise<录制结果> {
      if (状态 === '未开始') return Promise.reject(new Error('录制尚未开始'))
      if (状态 === '已停止') return Promise.reject(new Error('录制已经停止'))
      if (!录制器) return Promise.reject(new Error('录制尚未开始'))
      return new Promise<录制结果>((完成, 失败) => {
        停止等待 = { 完成, 失败 }
        try { 录制器!.stop(); 状态 = '已停止' }
        catch (错误) { 停止等待 = null; 失败(new Error(`停止录制失败：${错误 instanceof Error ? 错误.message : '采集设备已中断'}`)) }
      })
    },
  }
}

/** 截取当前视频帧并按区域裁剪；区域自动约束在画面范围内，越界不放大结果。 */export async function 截取视频帧(视频: HTMLVideoElement, 区域: 裁剪区域, 依赖: 捕获依赖 = {}) {
  const 宽 = Math.floor(Number(视频?.videoWidth ?? 0))
  const 高 = Math.floor(Number(视频?.videoHeight ?? 0))
  if (!Number.isFinite(宽) || !Number.isFinite(高) || 宽 <= 0 || 高 <= 0) throw new Error('画面尚未就绪，请稍候再截取')
  if (!区域 || ![区域.x, 区域.y, 区域.宽, 区域.高].every(值 => Number.isFinite(Number(值))) || Number(区域.宽) <= 0 || Number(区域.高) <= 0) {
    throw new Error('裁剪区域无效：宽和高必须大于 0')
  }
  const x = Math.min(Math.max(0, Math.floor(Number(区域.x))), 宽 - 1)
  const y = Math.min(Math.max(0, Math.floor(Number(区域.y))), 高 - 1)
  const 裁剪宽 = Math.max(1, Math.min(Math.floor(Number(区域.宽)), 宽 - x))
  const 裁剪高 = Math.max(1, Math.min(Math.floor(Number(区域.高)), 高 - y))
  const 画布 = (依赖.画布工厂 ?? (() => document.createElement('canvas') as unknown as 画布接口))()
  画布.width = 裁剪宽
  画布.height = 裁剪高
  const 上下文 = 画布.getContext('2d')
  if (!上下文) throw new Error('当前环境不支持画面截取')
  上下文.drawImage(视频, x, y, 裁剪宽, 裁剪高, 0, 0, 裁剪宽, 裁剪高)
  const 地址 = 画布.toDataURL('image/png')
  const 前缀 = 'data:image/png;base64,'
  if (typeof 地址 !== 'string' || !地址.startsWith(前缀) || 地址.length <= 前缀.length) throw new Error('画面截取失败：无法生成图片数据')
  return { 数据: 地址.slice(前缀.length), 类型: 'image/png', 宽: 裁剪宽, 高: 裁剪高 }
}
