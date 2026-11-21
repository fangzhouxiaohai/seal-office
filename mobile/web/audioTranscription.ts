export interface 转写配置 { 地址: string; 模型: string; 密钥: string }
export interface 录音会话 { 停止(): void; 结果: Promise<File | null> }

export function 录制网页音频(信号: AbortSignal, 已开始: () => void): 录音会话 {
  let 录音: MediaRecorder | undefined
  const 停止 = () => { if (录音?.state === 'recording') 录音.stop() }
  const 结果 = (async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('此环境无法录音，可使用系统录音后选择音频文件。')
    let 流: MediaStream
    try { 流 = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }) }
    catch { throw new Error('未能打开麦克风，请检查系统权限或选择已有音频。') }
    try {
      if (信号.aborted) return null
      const 格式 = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(类型 => MediaRecorder.isTypeSupported?.(类型))
      录音 = new MediaRecorder(流, 格式 ? { mimeType: 格式 } : {})
      const 文件 = await new Promise<File | null>((完成, 失败) => {
        const 数据: Blob[] = []
        let 大小 = 0
        const 当前 = 录音!
        当前.ondataavailable = 事件 => {
          大小 += 事件.data.size
          if (大小 > 100 * 1024 * 1024) { 停止(); return }
          if (事件.data.size) 数据.push(事件.data)
        }
        当前.onerror = () => 失败(new Error('录音中断，请重新录制。'))
        当前.onstop = () => {
          if (信号.aborted) { 完成(null); return }
          if (大小 > 100 * 1024 * 1024) { 失败(new Error('录音超过 100 MiB，请分段录制。')); return }
          const 类型 = 当前.mimeType || 数据[0]?.type || 'audio/webm'
          const 后缀 = 类型.includes('mp4') ? 'm4a' : 类型.includes('ogg') ? 'ogg' : 'webm'
          if (!大小) { 失败(new Error('没有录到声音，请重新开始。')); return }
          完成(new File(数据, '录音-' + Date.now() + '.' + 后缀, { type: 类型 }))
        }
        信号.addEventListener('abort', 停止, { once: true })
        当前.start(1000)
        已开始()
      })
      return 文件
    } finally {
      信号.removeEventListener('abort', 停止)
      流.getTracks().forEach(轨道 => 轨道.stop())
      录音 = undefined
    }
  })()
  return { 停止, 结果 }
}

export function 转写地址(值: string): URL {
  let 地址: URL
  try { 地址 = new URL(值.trim()) } catch { throw new Error('请填写完整的 HTTPS 音频转写接口地址。') }
  if (地址.protocol !== 'https:' || 地址.username || 地址.password || 地址.hash) throw new Error('请使用无内嵌凭据的 HTTPS 转写地址。')
  return 地址
}

/** 用户确认后发送标准多部分表单；原生网络桥接需要能够直接传输的字节。 */
export async function 转写音频(文件: File, 配置: 转写配置, 信号: AbortSignal, 请求 = fetch): Promise<string> {
  const 地址 = 转写地址(配置.地址)
  if (!文件.size) throw new Error('音频为空，请重新选择或录制。')
  if (文件.size > 100 * 1024 * 1024) throw new Error('音频超过 100 MiB，请截取需要转写的片段。')
  if (!配置.模型.trim()) throw new Error('请填写服务提供的音频转写模型名称。')
  const 表单 = new FormData()
  表单.append('file', 文件, 文件.name)
  表单.append('model', 配置.模型.trim())
  表单.append('response_format', 'json')
  const 编码 = new Request(地址, { method: 'POST', body: 表单 })
  const 标头 = new Headers(编码.headers)
  if (配置.密钥.trim()) 标头.set('Authorization', 'Bearer ' + 配置.密钥.trim())
  let 响应: Response
  try { 响应 = await 请求(地址.href, { method: 'POST', headers: 标头, body: await 编码.arrayBuffer(), signal: 信号, redirect: 'error', credentials: 'omit' }) }
  catch (异常) { if (信号.aborted) throw 异常; throw new Error('无法连接转写服务，请检查网络、接口地址和跨域设置。') }
  if (!响应.ok) throw new Error('转写服务返回 ' + 响应.status + '，请检查接口、模型、凭据和服务可用性。')
  let 数据: unknown
  try { 数据 = await 响应.json() } catch { throw new Error('转写服务未返回有效的 JSON 结果。') }
  const 文字 = (数据 as { text?: unknown } | null)?.text
  if (typeof 文字 !== 'string' || !文字.trim()) throw new Error('转写服务未返回有效文字，请确认音频内有人声。')
  return 文字.trim()
}
