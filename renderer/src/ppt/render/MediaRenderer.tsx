import React from 'react'
import type { 演示对象 } from '../deck'
import { 读取播放范围 } from '../model/mediaObjects'
import type { 图片地址表 } from './SlideObjects'

/** 编辑区显示封面或占位封面；放映时按播放参数播放真实媒体。 */
export function 媒体封面({ 对象, 图片地址 }: { 对象: 演示对象; 图片地址: 图片地址表 }) {
  const 地址 = 图片地址[对象.媒体?.封面资源标识 ?? '']
  if (地址) return <img alt="媒体封面" draggable={false} src={地址} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  return <div className="wps-media-poster" aria-label={`${对象.媒体?.种类 ?? '媒体'}封面`}>
    <span className="wps-media-poster__mark">{对象.媒体?.种类 === '音频' ? '音频' : '视频'}</span>
    <span className="wps-media-poster__hint">{对象.媒体?.自动播放 ? '进入页面自动播放' : '单击播放'}</span>
  </div>
}

const 播放样式: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'contain', display: 'block' }

/**
 * 放映中的媒体元素：范围、音量、循环与自动播放全部交给原生媒体元素，
 * 播放控制器在换页、暂停、结束与销毁时统一停止它们。
 */
export function MediaRenderer({ 对象, 图片地址, 放映 = false, 活动 = true, on失败 }: { 对象: 演示对象; 图片地址: 图片地址表; 放映?: boolean; 活动?: boolean; on失败?: (错误: unknown) => void }) {
  const 引用 = React.useRef<HTMLMediaElement>(null)
  const 地址 = 图片地址[对象.资源标识 ?? '']
  const 参数 = 对象.媒体
  const 范围 = React.useMemo(() => 读取播放范围(参数 ?? { 种类: '视频', 音量: 100, 循环: false, 自动播放: false }, Number.NaN), [参数])

  React.useEffect(() => {
    const 元素 = 引用.current
    if (!放映 || !活动 || !元素) return
    元素.volume = Math.min(1, Math.max(0, (参数?.音量 ?? 100) / 100))
    元素.loop = false
    const 定位 = () => {
      if (Number.isFinite(范围.开始秒) && Math.abs(元素.currentTime - 范围.开始秒) > 0.25) 元素.currentTime = 范围.开始秒
      if (范围.结束秒 !== null && 元素.currentTime >= 范围.结束秒) {
        if (参数?.循环) 元素.currentTime = 范围.开始秒
        else 元素.pause()
      }
    }
    const 载入 = () => {
      if (Number.isFinite(范围.开始秒) && 范围.开始秒 > 0) 元素.currentTime = 范围.开始秒
      if (参数?.自动播放 !== false) void 元素.play().catch((错误: unknown) => on失败?.(错误))
    }
    const 时间更新 = () => { if (范围.结束秒 !== null && 元素.currentTime >= 范围.结束秒) { if (参数?.循环) 元素.currentTime = 范围.开始秒; else 元素.pause() } }
    元素.addEventListener('loadedmetadata', 载入)
    元素.addEventListener('timeupdate', 时间更新)
    定位()
    return () => { 元素.removeEventListener('loadedmetadata', 载入); 元素.removeEventListener('timeupdate', 时间更新); 元素.pause() }
  }, [放映, 活动, 地址, 参数, 范围.开始秒, 范围.结束秒, on失败])

  if (!放映 || !地址) return <媒体封面 对象={对象} 图片地址={图片地址} />
  const 公共属性 = {
    ref: 引用 as React.RefObject<HTMLVideoElement & HTMLAudioElement>,
    src: 地址,
    controls: true,
    playsInline: true,
    'data-媒体标识': 对象.id,
    onError: () => on失败?.(new Error('媒体无法解码，请检查文件格式与编码')),
    style: 播放样式,
  }
  if (参数?.种类 === '音频') return <div className="wps-media-audio" style={{ width: '100%', height: '100%' }}><媒体封面 对象={对象} 图片地址={图片地址} /><audio {...公共属性} /></div>
  return <video {...公共属性} />
}
