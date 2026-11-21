import { useCallback, useEffect, useRef, useState } from 'react'

type 状态 = 'idle' | 'starting' | 'ready' | 'unavailable' | 'denied' | 'error'
type 静态相机 = { takePhoto(): Promise<Blob> }
interface 相机环境 {
  ImageCapture?: new (轨道: MediaStreamTrack) => 静态相机
}

function 相机错误(错误: unknown): { status: 状态; error: string } {
  const 名称 = 错误 instanceof Error || 错误 instanceof DOMException ? 错误.name : ''
  if (名称 === 'NotAllowedError' || 名称 === 'CameraDeniedError') return { status: 'denied', error: '未获得相机权限，可在系统设置中开启，或从相册导入。' }
  if (['SecurityError', 'NotFoundError', 'OverconstrainedError', 'NotSupportedError'].includes(名称)) return { status: 'unavailable', error: '当前环境无法使用实时取景，可打开系统相机或从相册导入。' }
  if (名称 === 'NotReadableError') return { status: 'error', error: '摄像头正被其他程序占用，请关闭后重试。' }
  return { status: 'error', error: '摄像头未能启动，请重试或使用系统相机。' }
}

function 预览原图(视频: HTMLVideoElement): Promise<Blob> {
  if (!视频.videoWidth || !视频.videoHeight) throw new Error('取景画面尚未就绪，请稍候拍摄。')
  const 画布 = document.createElement('canvas')
  画布.width = 视频.videoWidth
  画布.height = 视频.videoHeight
  const 画笔 = 画布.getContext('2d')
  if (!画笔) throw new Error('无法读取取景画面，请使用系统相机。')
  画笔.drawImage(视频, 0, 0)
  return new Promise((完成, 失败) => 画布.toBlob(图像 => 图像?.size ? 完成(图像) : 失败(new Error('未能生成照片，请重新拍摄。')), 'image/jpeg', 0.96))
}

export function useMobileViewfinder() {
  const [status, setStatus] = useState<状态>('idle')
  const [error, setError] = useState('')
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchEnabled, setTorchEnabled] = useState(false)
  const 节点 = useRef<HTMLVideoElement | null>(null)
  const 媒体 = useRef<MediaStream | null>(null)
  const 代次 = useRef(0)
  const 授权 = useRef<AbortController | null>(null)
  const 启动中 = useRef(false)
  const 拍摄中 = useRef(false)

  const 释放 = useCallback(() => {
    代次.current++
    授权.current?.abort()
    授权.current = null
    启动中.current = false
    拍摄中.current = false
    媒体.current?.getTracks().forEach(轨道 => 轨道.stop())
    媒体.current = null
    if (节点.current) 节点.current.srcObject = null
  }, [])
  const stop = useCallback(() => {
    释放()
    setStatus('idle')
    setError('')
    setTorchAvailable(false)
    setTorchEnabled(false)
  }, [释放])
  useEffect(() => {
    const 隐藏 = () => { if (document.visibilityState === 'hidden') stop() }
    document.addEventListener('visibilitychange', 隐藏)
    window.addEventListener('pagehide', stop)
    window.addEventListener('seal-camera-background', stop)
    return () => {
      document.removeEventListener('visibilitychange', 隐藏)
      window.removeEventListener('pagehide', stop)
      window.removeEventListener('seal-camera-background', stop)
      释放()
    }
  }, [stop, 释放])

  const videoRef = useCallback((视频: HTMLVideoElement | null) => {
    节点.current = 视频
    if (视频 && 媒体.current) 视频.srcObject = 媒体.current
  }, [])
  const start = useCallback(async () => {
    if (媒体.current) return true
    if (启动中.current) return false
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || window.isSecureContext === false) {
      setStatus('unavailable')
      setError('当前环境无法使用实时取景，可打开系统相机或从相册导入。')
      return false
    }
    启动中.current = true
    const 本次 = ++代次.current
    setStatus('starting')
    try {
      授权.current = new AbortController()
      await window.sealPrepareCamera?.(授权.current.signal)
      if (本次 !== 代次.current) return false
      const 流 = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
      })
      if (本次 !== 代次.current) { 流.getTracks().forEach(轨道 => 轨道.stop()); return false }
      媒体.current = 流
      const 轨道 = 流.getVideoTracks()[0]
      if (!轨道) throw new DOMException('未发现摄像头', 'NotFoundError')
      轨道.addEventListener('ended', () => { if (媒体.current === 流) stop() }, { once: true })
      const 视频 = 节点.current
      if (视频) {
        视频.muted = true
        视频.playsInline = true
        视频.srcObject = 流
        await 视频.play()
      }
      if (本次 !== 代次.current) return false
      const 能力 = 轨道.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
      setTorchAvailable(能力?.torch === true && typeof 轨道.applyConstraints === 'function')
      setTorchEnabled(false)
      setStatus('ready')
      return true
    } catch (异常) {
      if (本次 !== 代次.current) return false
      释放()
      const 反馈 = 相机错误(异常)
      setStatus(反馈.status)
      setError(反馈.error)
      return false
    } finally { if (本次 === 代次.current) 启动中.current = false }
  }, [stop, 释放])

  const capture = useCallback(async (): Promise<File> => {
    const 视频 = 节点.current, 轨道 = 媒体.current?.getVideoTracks()[0]
    if (!视频 || !轨道 || 轨道.readyState !== 'live') throw new Error('请先开启相机，再拍摄文档。')
    if (拍摄中.current) throw new Error('正在拍摄，请稍候。')
    拍摄中.current = true
    const 本次 = 代次.current
    try {
      const 原图 = (window as 相机环境).ImageCapture
      let 图像: Blob | undefined
      if (原图) {
        try { 图像 = await new 原图(轨道).takePhoto() }
        catch { /* 部分网页组件只支持视频轨道，改用摄像头实际预览分辨率。 */ }
      }
      if (本次 !== 代次.current) throw new Error('拍摄已取消。')
      if (!图像?.size) 图像 = await 预览原图(视频)
      if (本次 !== 代次.current) throw new Error('拍摄已取消。')
      const 后缀 = 图像.type === 'image/png' ? 'png' : 图像.type === 'image/webp' ? 'webp' : 'jpg'
      return new File([图像], '扫描照片-' + Date.now() + '.' + 后缀, { type: 图像.type || 'image/jpeg' })
    } finally { if (本次 === 代次.current) 拍摄中.current = false }
  }, [])
  const toggleTorch = useCallback(async () => {
    const 轨道 = 媒体.current?.getVideoTracks()[0]
    if (!轨道 || !torchAvailable) return false
    const 目标 = !torchEnabled
    try {
      await 轨道.applyConstraints({ advanced: [{ torch: 目标 } as MediaTrackConstraintSet] })
      if (媒体.current?.getVideoTracks()[0] !== 轨道) return false
      setTorchEnabled(目标)
      setError('')
      return true
    } catch {
      if (媒体.current?.getVideoTracks()[0] === 轨道) setError('补光灯未能切换，请检查是否正在被其他应用使用。')
      return false
    }
  }, [torchAvailable, torchEnabled])
  return { videoRef, status, error, torchAvailable, torchEnabled, start, stop, capture, toggleTorch }
}
