/** 在任何文稿修改前读取并实际探测媒体可解码性；无法解码的文件不得进入文稿。 */
const 单项上限 = 50 * 1024 * 1024
const 音频类型 = ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/aac']
const 视频类型 = ['video/mp4', 'video/webm', 'video/x-msvideo']

export type 媒体种类 = '音频' | '视频'

/** 浏览器与外部软件共用的容器白名单；不在表内的扩展名不进入可用格式列表。 */
export function 媒体类型可用(类型: string, 种类: 媒体种类): boolean {
  return (种类 === '音频' ? 音频类型 : 视频类型).includes(类型)
}

export function 读取媒体类型(文件: File): { 类型: string; 种类: 媒体种类 } {
  const 类型 = (文件.type || '').toLowerCase()
  if (类型.startsWith('video/')) return { 类型, 种类: '视频' }
  if (类型.startsWith('audio/')) return { 类型, 种类: '音频' }
  throw new Error(`文件 ${文件.name} 不是音频或视频；请选择受支持的媒体文件`)
}

/** 用真实媒体元素探测解码能力，只放行本机确实能播放的编码。 */
export function 探测媒体可解码(文件: File, 种类: 媒体种类, 超时毫秒 = 10000): Promise<number> {
  return new Promise((完成, 拒绝) => {
    const 地址 = URL.createObjectURL(文件)
    const 元素 = document.createElement(种类 === '视频' ? 'video' : 'audio')
    let 已结束 = false
    const 结束 = (错误?: string, 时长?: number) => {
      if (已结束) return
      已结束 = true
      clearTimeout(计时)
      元素.removeAttribute('src')
      URL.revokeObjectURL(地址)
      if (错误) 拒绝(new Error(`媒体 ${文件.name} ${错误}`))
      else 完成(时长 ?? 0)
    }
    const 计时 = setTimeout(() => 结束('解码超时，请确认文件未损坏'), 超时毫秒)
    元素.preload = 'metadata'
    元素.onloadedmetadata = () => 结束(undefined, Number.isFinite(元素.duration) ? 元素.duration * 1000 : 0)
    元素.onerror = () => 结束('无法在本机解码，请改用受支持的编码')
    元素.src = 地址
  })
}

export async function 读取媒体文件(文件: File, 探测: (文件: File, 种类: 媒体种类) => Promise<number> = 探测媒体可解码): Promise<{ 数据: string; 类型: string; 种类: 媒体种类; 时长毫秒: number }> {
  if (!文件.size) throw new Error(`媒体 ${文件.name} 为空文件`)
  if (文件.size > 单项上限) throw new Error(`媒体 ${文件.name} 超过 ${单项上限 / 1024 / 1024} MB 限制`)
  const { 类型, 种类 } = 读取媒体类型(文件)
  if (!媒体类型可用(类型, 种类)) throw new Error(`媒体格式不受支持：${类型 || 文件.name}；请改用 WAV、MP3、M4A、OGG、MP4 或 WebM`)
  const 时长毫秒 = await 探测(文件, 种类)
  const 数据 = await new Promise<string>((完成, 失败) => {
    const 读取器 = new FileReader()
    读取器.onload = () => typeof 读取器.result === 'string' ? 完成(读取器.result.slice(读取器.result.indexOf(',') + 1)) : 失败(new Error('媒体读取结果无效'))
    读取器.onerror = () => 失败(new Error(`媒体 ${文件.name} 无法读取`))
    读取器.readAsDataURL(文件)
  })
  return { 数据, 类型, 种类, 时长毫秒 }
}
