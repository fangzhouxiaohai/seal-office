import React from 'react'
import { 创建屏幕流, 等待画面就绪, 截取视频帧, 解析捕获源标识, type 捕获依赖, type 裁剪区域 } from '../model/capture'
import { 桥接 } from '../../ipc/bridge'
import type { 捕获源条目 } from '../../ipc/bridge'

interface Props {
  只读: boolean
  on插入图片: (图片: { 数据: string; 类型: string; 宽: number; 高: number }) => void
  依赖?: 捕获依赖
  on提示?: (标题: string, 内容: string) => void
}

const 类型名称 = (类型: string) => 类型 === 'screen' ? '屏幕' : '窗口'

const CapturePanel = ({ 只读, on插入图片, 依赖 = {}, on提示 }: Props) => {
  const [类型, set类型] = React.useState<Array<'screen' | 'window'>>(['screen', 'window'])
  const [源列表, set源列表] = React.useState<捕获源条目[]>([])
  const [选中, set选中] = React.useState('')
  const [错误, set错误] = React.useState('')
  const [预览区域, set预览区域] = React.useState<裁剪区域 | null>(null)
  const [区域, set区域] = React.useState<裁剪区域>({ x: 0, y: 0, 宽: 0, 高: 0 })
  const [画面尺寸, set画面尺寸] = React.useState({ 宽: 0, 高: 0 })
  const [忙碌, set忙碌] = React.useState(false)
  const 视频 = React.useRef<unknown>(null)
  const 流 = React.useRef<MediaStream | null>(null)

  const 释放流 = React.useCallback(() => {
    流.current?.getTracks?.().forEach(轨道 => 轨道.stop())
    流.current = null
    视频.current = null
  }, [])
  React.useEffect(() => () => 释放流(), [释放流])

  const 读取源 = async () => {
    set错误('')
    set忙碌(true)
    try {
      const 结果 = await 桥接.presentationCapture.sources(类型)
      if (!结果.成功) throw new Error(结果.错误 ?? '读取捕获源失败')
      set源列表(结果.源列表 ?? [])
      if (!结果.源列表?.length) set错误('没有找到可捕获的屏幕或窗口，请确认桌面会话可见后重试')
      if (选中 && !结果.源列表?.some(项 => 项.标识 === 选中)) set选中('')
    } catch (异常) {
      set源列表([]); set选中(''); set错误(异常 instanceof Error ? 异常.message : '读取捕获源失败')
    } finally { set忙碌(false) }
  }

  const 截取预览 = async () => {
    if (只读) return
    set错误('')
    set忙碌(true)
    try {
      解析捕获源标识(选中)
      释放流()
      const 新流 = await 创建屏幕流(选中, 依赖)
      流.current = 新流
      const 视频对象 = 依赖.视频工厂 ? 依赖.视频工厂() : (document.createElement('video') as unknown as { videoWidth: number; videoHeight: number })
      ;(视频对象 as { srcObject?: unknown }).srcObject = 新流
      try { await (视频对象 as { play?: () => Promise<void> }).play?.() } catch { /* 自动播放被拒绝时仍可截取已解码画面 */ }
      视频.current = 视频对象
      await 等待画面就绪(视频对象)
      const 宽 = Math.floor(Number((视频对象 as { videoWidth: number }).videoWidth))
      const 高 = Math.floor(Number((视频对象 as { videoHeight: number }).videoHeight))
      set画面尺寸({ 宽, 高 })
      set区域({ x: 0, y: 0, 宽, 高 })
      set预览区域({ x: 0, y: 0, 宽, 高 })
    } catch (异常) {
      const 消息 = 异常 instanceof Error ? 异常.message : '截取预览失败'
      set错误(消息)
      on提示?.('截取预览失败', 消息)
    } finally { set忙碌(false) }
  }

  const 确认插入 = async () => {
    if (只读) return
    set忙碌(true)
    try {
      const 图片 = await 截取视频帧(视频.current as HTMLVideoElement, 区域, 依赖)
      on插入图片(图片)
      set预览区域(null)
      set错误('')
     释放流()
    } catch (异常) {
      const 消息 = 异常 instanceof Error ? 异常.message : '截取失败'
      set错误(消息)
      on提示?.('截取失败', 消息)
    } finally { set忙碌(false) }
  }

  const 取消 = () => {
    set预览区域(null)
    set错误('')
    释放流()
  }

  return (
    <section className="wps-capture-panel" aria-label="截屏">
      <fieldset disabled={只读}>
        <legend>截屏</legend>
        <div className="wps-capture-panel__row">
          <label className="wps-capture-panel__check"><input type="checkbox" checked={类型.includes('screen')} onChange={事件 => set类型(当前 => 事件.target.checked ? [...new Set([...当前, 'screen'])] as Array<'screen' | 'window'> : 当前.filter(项 => 项 !== 'screen'))} />包含屏幕</label>
          <label className="wps-capture-panel__check"><input type="checkbox" checked={类型.includes('window')} onChange={事件 => set类型(当前 => 事件.target.checked ? [...new Set([...当前, 'window'])] as Array<'screen' | 'window'> : 当前.filter(项 => 项 !== 'window'))} />包含窗口</label>
        </div>
        <button type="button" onClick={() => void 读取源()} disabled={只读 || 忙碌 || 类型.length === 0}>刷新捕获源</button>
        {源列表.length > 0 && (
          <ul className="wps-capture-panel__sources">
            {源列表.map(源 => (
              <li key={源.标识}>
                <label>
                  <input type="radio" name="capture-source" checked={选中 === 源.标识} onChange={() => set选中(源.标识)} aria-label={`${类型名称(源.类型)}：${源.名称}`} />
                  <span>{类型名称(源.类型)}：{源.名称}</span>
                </label>
                {源.缩略图 ? <img src={源.缩略图} alt={`${源.名称}预览`} width={96} height={54} /> : <span className="wps-capture-panel__empty">无缩略图</span>}
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => void 截取预览()} disabled={只读 || 忙碌 || !选中}>截取预览</button>
        {预览区域 && (
          <div className="wps-capture-panel__preview">
            <p>画面尺寸 {画面尺寸.宽} × {画面尺寸.高} 像素，按区域裁剪后插入当前页。</p>
            <label>裁剪左<input type="number" min={0} max={Math.max(0, 画面尺寸.宽 - 1)} aria-label="裁剪左" value={区域.x} onChange={事件 => set区域(当前 => ({ ...当前, x: Number(事件.target.value) }))} /></label>
            <label>裁剪上<input type="number" min={0} max={Math.max(0, 画面尺寸.高 - 1)} aria-label="裁剪上" value={区域.y} onChange={事件 => set区域(当前 => ({ ...当前, y: Number(事件.target.value) }))} /></label>
            <label>裁剪宽度<input type="number" min={1} max={画面尺寸.宽} aria-label="裁剪宽度" value={区域.宽} onChange={事件 => set区域(当前 => ({ ...当前, 宽: Number(事件.target.value) }))} /></label>
            <label>裁剪高度<input type="number" min={1} max={画面尺寸.高} aria-label="裁剪高度" value={区域.高} onChange={事件 => set区域(当前 => ({ ...当前, 高: Number(事件.target.value) }))} /></label>
            <div className="wps-capture-panel__actions">
              <button type="button" onClick={() => void 确认插入()} disabled={忙碌}>确认插入</button>
              <button type="button" onClick={取消}>取消截屏</button>
            </div>
          </div>
        )}
        {错误 && <p className="wps-capture-panel__error" role="status">{错误}</p>}
      </fieldset>
    </section>
  )
}

export default CapturePanel
