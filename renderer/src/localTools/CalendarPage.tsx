import { useEffect, useMemo, useState } from 'react'
import { App as AntdApp, Button, Input, Modal } from 'antd'
import { 解析日程, 生成日历文件, 校验日程, type 日程项 } from './calendarData'
import { 下载本地内容 } from './download'
import './localTools.css'

const 存储键 = 'seal-local-calendar-v1'
const 补零 = (值: number) => String(值).padStart(2, '0')
const 今天 = () => { const 日期 = new Date(); return `${日期.getFullYear()}-${补零(日期.getMonth() + 1)}-${补零(日期.getDate())}` }
const 月份文字 = (日期: Date) => `${日期.getFullYear()} 年 ${日期.getMonth() + 1} 月`
const 空表单 = (日期: string): 日程项 => ({ id: '', 标题: '', 日期, 开始: '09:00', 结束: '10:00', 备注: '' })

export default function CalendarPage() {
  const { message, modal } = AntdApp.useApp()
  const [当前月, 设当前月] = useState(() => { const 现在 = new Date(); return new Date(现在.getFullYear(), 现在.getMonth(), 1) })
  const [选中日期, 设选中日期] = useState(今天)
  const [日程, 设日程] = useState<日程项[]>([])
  const [读取错误, 设读取错误] = useState<string | null>(null)
  const [表单, 设表单] = useState<日程项 | null>(null)

  useEffect(() => {
    try { 设日程(解析日程(localStorage.getItem(存储键))) }
    catch (错误) {
      const 原因 = 错误 instanceof Error ? 错误.message : '无法读取本机日程'
      设读取错误(原因)
      modal.error({ title: '读取本机日程失败', content: `${原因}。原数据已保留，可导出备份后手动清除。` })
    }
  }, [modal])

  const 保存日程 = (新列表: 日程项[]) => {
    try {
      localStorage.setItem(存储键, JSON.stringify(新列表))
      设日程(新列表)
      return true
    } catch (错误) {
      modal.error({ title: '保存日程失败', content: 错误 instanceof Error ? 错误.message : '本机存储不可写，请检查空间和权限' })
      return false
    }
  }

  const 日期格 = useMemo(() => {
    const 首日 = new Date(当前月.getFullYear(), 当前月.getMonth(), 1)
    const 前置 = (首日.getDay() + 6) % 7
    const 总天数 = new Date(当前月.getFullYear(), 当前月.getMonth() + 1, 0).getDate()
    return Array.from({ length: Math.ceil((前置 + 总天数) / 7) * 7 }, (_, 索引) => {
      const 日期 = new Date(当前月.getFullYear(), 当前月.getMonth(), 索引 - 前置 + 1)
      return { 日期: `${日期.getFullYear()}-${补零(日期.getMonth() + 1)}-${补零(日期.getDate())}`, 日: 日期.getDate(), 本月: 日期.getMonth() === 当前月.getMonth() }
    })
  }, [当前月])
  const 当日日程 = 日程.filter((项) => 项.日期 === 选中日期).sort((甲, 乙) => 甲.开始.localeCompare(乙.开始))
  const 日程计数 = useMemo(() => 日程.reduce<Record<string, number>>((结果, 项) => { 结果[项.日期] = (结果[项.日期] ?? 0) + 1; return 结果 }, {}), [日程])

  const 提交表单 = () => {
    if (!表单) return
    try {
      const 项 = 校验日程({ ...表单, id: 表单.id || `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })
      const 新列表 = 表单.id ? 日程.map((原项) => 原项.id === 表单.id ? 项 : 原项) : [...日程, 项]
      if (保存日程(新列表)) { 设表单(null); 设选中日期(项.日期); message.success('日程已保存') }
    } catch (错误) {
      modal.error({ title: '日程内容无效', content: 错误 instanceof Error ? 错误.message : '请检查日期与时间' })
    }
  }

  const 删除日程 = (项: 日程项) => modal.confirm({ title: '删除日程', content: `确认删除「${项.标题}」？`, okText: '删除', okType: 'danger', cancelText: '取消', onOk: () => { if (保存日程(日程.filter((原项) => 原项.id !== 项.id))) message.success('日程已删除') } })
  const 清除损坏数据 = () => modal.confirm({ title: '清除损坏的日程数据', content: '此操作会删除本机保存的日程记录，无法撤销。', okText: '确认清除', okType: 'danger', cancelText: '取消', onOk: () => {
    try { localStorage.removeItem(存储键); 设读取错误(null); 设日程([]); message.success('已清除损坏数据') }
    catch (错误) { modal.error({ title: '清除失败', content: 错误 instanceof Error ? 错误.message : '本机存储不可写' }) }
  } })

  const 导出原始数据 = () => {
    try {
      const 原文 = localStorage.getItem(存储键)
      if (原文 === null) throw new Error('本机没有可导出的日程数据')
      下载本地内容('海豹办公日程原始备份.json', 原文, 'application/json;charset=utf-8')
    } catch (错误) {
      modal.error({ title: '导出原始数据失败', content: 错误 instanceof Error ? 错误.message : '无法读取原始日程数据' })
    }
  }

  return <div className="local-page">
    <header className="local-page__header"><div><h1>本机日历</h1><p>日程仅保存在本机，可导出为日历文件。</p></div><div className="local-page__actions"><Button onClick={() => { try { 下载本地内容('海豹办公日程.ics', 生成日历文件(日程), 'text/calendar;charset=utf-8') } catch (错误) { modal.error({ title: '导出日历失败', content: 错误 instanceof Error ? 错误.message : '无法生成日历文件' }) } }} disabled={日程.length === 0 || 读取错误 !== null}>导出日历</Button><Button type="primary" onClick={() => 设表单(空表单(选中日期))} disabled={读取错误 !== null}>新增日程</Button></div></header>
    {读取错误 ? <div className="local-page__error"><strong>本机日程暂不可编辑</strong><p>{读取错误}</p><Button onClick={导出原始数据}>导出原始数据</Button><Button danger onClick={清除损坏数据}>清除损坏数据</Button></div> : <div className="calendar-layout">
      <section className="calendar-card" aria-label="月份日历"><div className="calendar-card__nav"><Button onClick={() => 设当前月(new Date(当前月.getFullYear(), 当前月.getMonth() - 1, 1))}>上个月</Button><strong>{月份文字(当前月)}</strong><Button onClick={() => 设当前月(new Date(当前月.getFullYear(), 当前月.getMonth() + 1, 1))}>下个月</Button></div><div className="calendar-grid">{['一', '二', '三', '四', '五', '六', '日'].map((项) => <span className="calendar-grid__weekday" key={项}>周{项}</span>)}{日期格.map((项) => <button key={项.日期} type="button" className={`calendar-grid__day${项.本月 ? '' : ' calendar-grid__day--other'}${项.日期 === 选中日期 ? ' calendar-grid__day--selected' : ''}`} onClick={() => { 设选中日期(项.日期); if (!项.本月) 设当前月(new Date(`${项.日期}T00:00:00`)) }}><span>{项.日}</span>{日程计数[项.日期] ? <small>{日程计数[项.日期]} 项</small> : null}</button>)}</div></section>
      <section className="calendar-agenda"><h2>{选中日期} 的日程</h2>{当日日程.length === 0 ? <p className="local-page__muted">当天没有日程。</p> : 当日日程.map((项) => <div className="calendar-event" key={项.id}><div><strong>{项.标题}</strong><span>{项.开始} 至 {项.结束}</span>{项.备注 ? <p>{项.备注}</p> : null}</div><div><Button size="small" onClick={() => 设表单(项)}>编辑</Button><Button size="small" danger onClick={() => 删除日程(项)}>删除</Button></div></div>)}</section>
    </div>}
    <Modal title={表单?.id ? '编辑日程' : '新增日程'} open={表单 !== null} onCancel={() => 设表单(null)} onOk={提交表单} okText="保存" cancelText="取消" destroyOnHidden>{表单 ? <div className="local-form"><label>标题<Input value={表单.标题} maxLength={200} onChange={(事件) => 设表单({ ...表单, 标题: 事件.target.value })} /></label><label>日期<input type="date" value={表单.日期} onChange={(事件) => 设表单({ ...表单, 日期: 事件.target.value })} /></label><div className="local-form__times"><label>开始<input type="time" value={表单.开始} onChange={(事件) => 设表单({ ...表单, 开始: 事件.target.value })} /></label><label>结束<input type="time" value={表单.结束} onChange={(事件) => 设表单({ ...表单, 结束: 事件.target.value })} /></label></div><label>备注<Input.TextArea value={表单.备注} maxLength={5000} rows={3} onChange={(事件) => 设表单({ ...表单, 备注: 事件.target.value })} /></label></div> : null}</Modal>
  </div>
}
