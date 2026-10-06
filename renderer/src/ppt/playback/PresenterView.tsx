import { useEffect, useState } from 'react'
import { 桥接 } from '../../ipc/bridge'

/**
 * 演讲者窗口只接收只读播放快照：当前页、下一页、备注、页码与计时。
 * 窗口内没有编辑控件，控制命令统一回传编辑窗口执行。
 */
export interface 演讲者快照 {
  页码: number
  总页数: number
  标题: string
  备注: string
  下一页标题: string | null
  暂停: boolean
  阶段: string
  已用毫秒: number
  运行中: boolean
}

export function 格式化时长(毫秒: number): string {
  const 总秒 = Math.max(0, Math.floor((Number.isFinite(毫秒) ? 毫秒 : 0) / 1000))
  const 分 = Math.floor(总秒 / 60)
  const 秒 = 总秒 % 60
  return `${String(分).padStart(2, '0')}:${String(秒).padStart(2, '0')}`
}

interface 视图属性 {
  快照: 演讲者快照 | null
  显示器名称?: string
  提示?: string
  动作: (动作: string) => void
}

export function 演讲者视图({ 快照, 显示器名称, 提示, 动作 }: 视图属性) {
  const [本地毫秒, set本地毫秒] = useState(快照?.已用毫秒 ?? 0)
  useEffect(() => { set本地毫秒(快照?.已用毫秒 ?? 0) }, [快照?.已用毫秒, 快照?.页码])
  useEffect(() => {
    if (!快照?.运行中 || 快照.暂停) return
    const 计时 = setInterval(() => set本地毫秒(值 => 值 + 1000), 1000)
    return () => clearInterval(计时)
  }, [快照?.运行中, 快照?.暂停, 快照?.页码])

  return (
    <section className="wps-presenter" role="region" aria-label="演讲者视图">
      <header className="wps-presenter__bar">
        <span className="wps-presenter__page">{快照 ? `${快照.页码} / ${快照.总页数}` : '等待放映状态'}</span>
        <span className="wps-presenter__timer" aria-label="放映计时">{格式化时长(本地毫秒)}</span>
        <span className="wps-presenter__screen">{显示器名称 ?? '未获取到显示器信息'}</span>
      </header>
      {提示 ? <p className="wps-presenter__hint" role="status">{提示}</p> : null}
      {快照 === null
        ? <p className="wps-presenter__empty">等待放映状态：请先在编辑窗口开始放映。</p>
        : <div className="wps-presenter__body">
            <div className="wps-presenter__current">
              <h2>{快照.标题 ?? '未命名页面'}</h2>
              <div className="wps-presenter__notes">
                <h3>演讲备注</h3>
                <p>{(快照.备注 ?? '').trim().length > 0 ? 快照.备注 : '本页没有备注'}</p>
              </div>
            </div>
            <div className="wps-presenter__next">
              <h3>下一页</h3>
              <p>{快照.下一页标题 ?? '已是最后一页'}</p>
            </div>
          </div>}
      <footer className="wps-presenter__controls">
        <button type="button" onClick={() => 动作('上一页')} disabled={!快照 || 快照.页码 <= 1}>上一页</button>
        <button type="button" onClick={() => 动作('下一页')} disabled={!快照 || 快照.下一页标题 === null}>下一页</button>
        <button type="button" onClick={() => 动作(快照?.暂停 ? '继续' : '暂停')} disabled={!快照}>{快照?.暂停 ? '继续计时' : '暂停计时'}</button>
        <button type="button" onClick={() => 动作('结束')} disabled={!快照}>结束放映</button>
      </footer>
    </section>
  )
}

interface 推送数据 { 快照: 演讲者快照 | null; 显示器名称?: string; 提示?: string }

/** 推送与初始状态统一为 { 快照, 显示器名称, 提示 }；容错处理只给快照的旧格式。 */
export function 归一化推送数据(值: unknown): 推送数据 {
  if (值 === null || typeof 值 !== 'object') return { 快照: null }
  const 记录 = 值 as Record<string, unknown>
  if ('快照' in 记录) {
    return {
      快照: (记录.快照 ?? null) as 演讲者快照 | null,
      ...(typeof 记录.显示器名称 === 'string' ? { 显示器名称: 记录.显示器名称 } : {}),
      ...(typeof 记录.提示 === 'string' ? { 提示: 记录.提示 } : {}),
    }
  }
  return { 快照: 值 as 演讲者快照 }
}

/** 演讲者窗口根组件：只读展示推送状态，不加载编辑器与其编辑能力。 */
export default function 演讲者窗口根() {
  const [数据, set数据] = useState<推送数据>({ 快照: null })
  const [错误, set错误] = useState<string | null>(null)
  useEffect(() => {
    let 活动 = true
    void 桥接.getPresenterViewState().then((结果) => {
      if (!活动) return
      if (!结果.成功) { set错误(结果.错误 ?? '无法读取放映状态'); return }
      set数据(归一化推送数据(结果.状态))
    }).catch((失败: unknown) => { if (活动) set错误(失败 instanceof Error ? 失败.message : '无法读取放映状态') })
    const 释放 = 桥接.onPresenterUpdate((片段) => {
      if (!活动) return
      set数据(归一化推送数据(片段))
    })
    return () => { 活动 = false; 释放() }
  }, [])
  return <>
    {错误 ? <p className="wps-presenter__error" role="alert">{错误}</p> : null}
    <演讲者视图 快照={数据.快照} 显示器名称={数据.显示器名称} 提示={数据.提示} 动作={(动作) => { void 桥接.sendPresenterControl(动作) }} />
  </>
}
