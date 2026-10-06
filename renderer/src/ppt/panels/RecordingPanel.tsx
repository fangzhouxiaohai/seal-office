import React from 'react'
import { App } from 'antd'
import { 创建屏幕流, 创建麦克风流, 创建录制会话, 录制媒体类型, 解析捕获源标识, 读取数据块, 缓冲转base64, 创建预览地址, 释放预览地址, type 捕获依赖 } from '../model/capture'
import { 桥接, type 捕获源条目 } from '../../ipc/bridge'

interface Props {
  只读: boolean
  依赖?: 捕获依赖
  on提示?: (标题: string, 内容: string) => void
}

const 时长文本 = (毫秒: number) => {
  const 总秒 = Math.max(0, Math.floor(毫秒 / 1000))
  return `${String(Math.floor(总秒 / 60)).padStart(2, '0')}:${String(总秒 % 60).padStart(2, '0')}`
}

const RecordingPanel = ({ 只读, 依赖 = {}, on提示 }: Props) => {
  const { message, modal } = App.useApp()
  const [类型, set类型] = React.useState<Array<'screen' | 'window'>>(['screen', 'window'])
  const [源列表, set源列表] = React.useState<捕获源条目[]>([])
  const [选中, set选中] = React.useState('')
  const [使用麦克风, set使用麦克风] = React.useState(false)
  const [支持, set支持] = React.useState<{ WebM?: boolean; 媒体类型?: string; MP4?: boolean; MP4原因?: string }>({})
  const [状态, set状态] = React.useState<'未开始' | '录制中' | '已暂停' | '已停止'>('未开始')
  const [错误, set错误] = React.useState('')
  const [预览, set预览] = React.useState<{ 地址: string; 数据块: Blob; 时长毫秒: number; 媒体类型: string } | null>(null)
  const [保存中, set保存中] = React.useState(false)
  const [已用毫秒, set已用毫秒] = React.useState(0)
  const 会话 = React.useRef<ReturnType<typeof 创建录制会话> | null>(null)
  const 视频流 = React.useRef<MediaStream | null>(null)
  const 音频流 = React.useRef<MediaStream | null>(null)
  const 开始时刻 = React.useRef(0)
  const 本机编码 = React.useMemo(() => 录制媒体类型(依赖), [依赖])

  React.useEffect(() => {
    void (async () => {
      const 结果 = await 桥接.presentationCapture.support()
      if (结果.成功) set支持({ WebM: 结果.WebM, 媒体类型: 结果.媒体类型, MP4: 结果.MP4, MP4原因: 结果.MP4原因 })
      else set支持({ WebM: false, MP4: false, MP4原因: 结果.错误 })
    })()
  }, [])

  const 释放设备 = React.useCallback(() => {
    视频流.current?.getTracks?.().forEach(轨道 => 轨道.stop())
    音频流.current?.getTracks?.().forEach(轨道 => 轨道.stop())
    视频流.current = null
    音频流.current = null
  }, [])
  React.useEffect(() => () => {
    释放设备()
    if (预览?.地址) 释放预览地址(预览.地址)
  }, [释放设备, 预览?.地址])

  React.useEffect(() => {
    if (状态 !== '录制中') return
    const 计时 = setInterval(() => set已用毫秒(Date.now() - 开始时刻.current), 1000)
    return () => clearInterval(计时)
  }, [状态])

  const 读取源 = async () => {
    set错误('')
    try {
      const 结果 = await 桥接.presentationCapture.sources(类型)
      if (!结果.成功) throw new Error(结果.错误 ?? '读取捕获源失败')
      set源列表(结果.源列表 ?? [])
      if (!结果.源列表?.length) set错误('没有找到可捕获的屏幕或窗口，请确认桌面会话可见后重试')
    } catch (异常) { set源列表([]); set选中(''); set错误(异常 instanceof Error ? 异常.message : '读取捕获源失败') }
  }

  const 开始录制 = async () => {
    set错误('')
    try {
      解析捕获源标识(选中)
      if (!本机编码.支持) throw new Error(本机编码.原因 ?? '当前环境不支持 WebM 录制编码')
      释放设备()
      if (预览?.地址) 释放预览地址(预览.地址)
      set预览(null); set已用毫秒(0)
      const 屏幕 = await 创建屏幕流(选中, 依赖)
      视频流.current = 屏幕
      if (使用麦克风) {
        try { 音频流.current = await 创建麦克风流(依赖) }
        catch (异常) { message.warning(异常 instanceof Error ? 异常.message : '麦克风不可用，已改为仅录制画面') }
      }
      会话.current = 创建录制会话({ 视频流: 屏幕, 音频流: 音频流.current, 依赖 })
      会话.current.开始()
      开始时刻.current = Date.now()
      set状态('录制中')
    } catch (异常) {
      const 消息 = 异常 instanceof Error ? 异常.message : '无法开始录制'
      set错误(消息)
      on提示?.('无法开始录制', 消息)
      释放设备()
    }
  }

  const 停止录制 = async () => {
    if (!会话.current) return
    try {
      const 结果 = await 会话.current.停止()
      const 地址 = 创建预览地址(结果.数据块)
      set预览({ 地址, 数据块: 结果.数据块, 时长毫秒: 结果.时长毫秒, 媒体类型: 结果.媒体类型 })
      set状态('已停止')
      set错误('')
    } catch (异常) {
      const 消息 = 异常 instanceof Error ? 异常.message : '停止录制失败'
      set错误(消息)
      set状态('已停止')
      on提示?.('停止录制失败', 消息)
    } finally {
      释放设备()
      会话.current = null
    }
  }

  const 保存录制 = async () => {
    if (!预览) return
    set保存中(true)
    try {
      const 数据 = 缓冲转base64(await 读取数据块(预览.数据块))
      const 结果 = await 桥接.presentationCapture.saveRecording(数据, 'webm', `演示录制-${new Date().toISOString().slice(0, 10)}`)
      if (!结果.成功) throw new Error(结果.错误 ?? '保存录制失败')
      if (结果.已取消) { set错误(''); message.info('已取消保存，录制片段仍保留，可再次保存'); return }
      set错误('')
      message.success(`已保存：${结果.路径}（${结果.字节数 ?? 0} 字节）`)
    } catch (异常) {
      const 消息 = 异常 instanceof Error ? 异常.message : '保存录制失败'
      set错误(`保存失败：${消息}。录制片段仍保留在当前面板，可再次保存。`)
      modal.error({ title: '保存录制失败', content: `${消息}。录制片段仍保留，可重试保存。` })
    } finally { set保存中(false) }
  }

  const 可开始 = !只读 && !!选中 && 本机编码.支持 && 状态 !== '录制中' && 状态 !== '已暂停'

  return (
    <section className="wps-recording-panel" aria-label="屏幕录制">
      <fieldset disabled={只读}>
        <legend>屏幕录制</legend>
        <p className="wps-recording-panel__support">
          本机录制能力：{本机编码.支持 ? `WebM（${本机编码.媒体类型}）` : (本机编码.原因 ?? '不可用')}
          {支持.WebM === false ? '；主进程报告 WebM 不可用' : ''}
        </p>
        <p className="wps-recording-panel__note">MP4 需要额外编码器与分发授权，本阶段不提供：{支持.MP4原因 ?? '未开放'}</p>
        <div className="wps-recording-panel__row">
          <label className="wps-recording-panel__check"><input type="checkbox" checked={类型.includes('screen')} onChange={事件 => set类型(当前 => 事件.target.checked ? [...new Set([...当前, 'screen'])] as Array<'screen' | 'window'> : 当前.filter(项 => 项 !== 'screen'))} />包含屏幕</label>
          <label className="wps-recording-panel__check"><input type="checkbox" checked={类型.includes('window')} onChange={事件 => set类型(当前 => 事件.target.checked ? [...new Set([...当前, 'window'])] as Array<'screen' | 'window'> : 当前.filter(项 => 项 !== 'window'))} />包含窗口</label>
          <label className="wps-recording-panel__check"><input type="checkbox" checked={使用麦克风} onChange={事件 => set使用麦克风(事件.target.checked)} />同时录制麦克风</label>
        </div>
        <button type="button" onClick={() => void 读取源()} disabled={只读 || 状态 === '录制中' || 状态 === '已暂停'}>刷新捕获源</button>
        {源列表.length > 0 && (
          <ul className="wps-recording-panel__sources">
            {源列表.map(源 => (
              <li key={源.标识}>
                <label>
                  <input type="radio" name="recording-source" checked={选中 === 源.标识} onChange={() => set选中(源.标识)} aria-label={`录制 ${源.名称}`} />
                  <span>{源.类型 === 'screen' ? '屏幕' : '窗口'}：{源.名称}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="wps-recording-panel__actions">
          {状态 === '录制中'
            ? <button type="button" onClick={() => { 会话.current?.暂停(); set状态('已暂停') }}>暂停录制</button>
            : 状态 === '已暂停'
              ? <button type="button" onClick={() => { 会话.current?.继续(); set状态('录制中') }}>继续录制</button>
              : <button type="button" onClick={() => void 开始录制()} disabled={!可开始}>开始录制</button>}
          <button type="button" onClick={() => void 停止录制()} disabled={状态 !== '录制中' && 状态 !== '已暂停'}>停止录制</button>
        </div>
        <p className="wps-recording-panel__status" role="status">状态：{状态}{状态 === '录制中' || 状态 === '已暂停' ? `　已录制 ${时长文本(已用毫秒)}` : ''}</p>
        {预览 && (
          <div className="wps-recording-panel__preview">
            {预览.地址
              ? React.createElement('video', { src: 预览.地址, controls: true, 'aria-label': '录制预览' })
              : <p className="wps-recording-panel__note">当前环境无法生成预览播放，但录制片段已保留，可以直接保存。</p>}
            <p>时长 {时长文本(预览.时长毫秒)}，媒体类型 {预览.媒体类型}。</p>
            <button type="button" onClick={() => void 保存录制()} disabled={保存中}>保存录制</button>
          </div>
        )}
        {错误 && <p className="wps-recording-panel__error" role="status">{错误}</p>}
      </fieldset>
    </section>
  )
}

export default RecordingPanel
