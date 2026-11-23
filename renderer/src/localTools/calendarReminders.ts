import { useEffect } from 'react'
import { App } from 'antd'
import { type Tone, type CalendarAlarm, 日程存储键, 解析日程 } from './calendarData'

const urls: Record<Tone, string> = {
  bell: new URL('../../../android-studio/app/src/main/res/raw/seal_bell.wav', import.meta.url).href,
  mallet: new URL('../../../android-studio/app/src/main/res/raw/seal_mallet.wav', import.meta.url).href,
  double: new URL('../../../android-studio/app/src/main/res/raw/seal_double.wav', import.meta.url).href,
}
export const 播放提示音 = (tone: Tone) => new Audio(urls[tone]).play()
const changed = 'seal-calendar-changed'
export const 更新日程提醒 = (ask = false) => window.dispatchEvent(new CustomEvent(changed, { detail: ask }))
export const 提醒状态事件 = 'seal-calendar-status'
export let 提醒状态 = '应用运行时提醒'
function status(value: string) {
  提醒状态 = value
  window.dispatchEvent(new Event(提醒状态事件))
}

function alarms() {
  return 解析日程(localStorage.getItem(日程存储键)).flatMap(event => event.提醒 ? [{
    id: event.id, title: event.标题, time: event.开始, at: new Date(event.日期 + 'T' + event.开始).getTime(), tone: event.提醒,
  }] : [])
}

export default function CalendarReminders() {
  const { notification } = App.useApp()
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>, alive = true, serial = Promise.resolve()
    const backend = window.electronAPI?.calendar
    const alert = (item: CalendarAlarm, native: boolean) => {
      window.dispatchEvent(new CustomEvent('seal-local-notification', { detail: { 标题: '日程提醒', 内容: item.time + ' · ' + item.title } }))
      notification.info({ message: item.title, description: item.time, key: item.id })
      if (!native && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(item.title, { body: item.time, tag: item.id, silent: true }) } catch { /* Some browsers require a service worker. */ }
      }
      void 播放提示音(item.tone).catch(() => status('当前设备限制自动播放，仅显示提醒'))
    }
    const stopNative = backend?.onDue?.(item => alert(item, true))
    const sync = async (ask: boolean) => {
      clearTimeout(timer)
      if (!alive) return
      const future = alarms().filter(it => it.at > Date.now()).sort((a,b) => a.at - b.at)
      if (backend) {
        const result = await backend.sync(future, ask && future.length > 0)
        if (alive) status(result)
        return
      }
      if (ask && typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission()
      status(typeof Notification !== 'undefined' && Notification.permission === 'granted' ? '页面打开时通过系统通知提醒' : '页面打开时显示日程提醒')
      if (!alive || !future.length) return
      const due = future[0]
      timer = setTimeout(() => {
        if (Date.now() >= due.at) {
          const saved = JSON.parse(localStorage.getItem('seal-calendar-delivered') ?? '{}') as Record<string,number>
          const pending = alarms().filter(it => it.at >= due.at && it.at <= Date.now() && saved[it.id] !== it.at)
          for (const item of pending) saved[item.id] = item.at
          localStorage.setItem('seal-calendar-delivered', JSON.stringify(Object.fromEntries(Object.entries(saved).filter(([,at]) => Date.now()-at < 86400000))))
          pending.forEach(item => alert(item, false))
        }
        refresh()
      }, Math.min(2147483647, Math.max(0, due.at-Date.now())))
    }
    const refresh = (e?: Event) => {
      if (e instanceof StorageEvent && e.key !== 日程存储键) return
      serial = serial.then(() => sync(e instanceof CustomEvent && e.detail === true)).catch(err => status('日程提醒暂不可用：' + (err as Error).message))
    }
    refresh()
    window.addEventListener(changed, refresh)
    window.addEventListener('storage', refresh)
    window.addEventListener('seal-camera-foreground', refresh)
    return () => { alive = false; clearTimeout(timer); stopNative?.(); window.removeEventListener(changed, refresh); window.removeEventListener('storage', refresh); window.removeEventListener('seal-camera-foreground', refresh) }
  }, [notification])
  return null
}
