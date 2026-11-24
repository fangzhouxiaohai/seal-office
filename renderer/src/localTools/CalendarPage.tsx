import { useEffect, useMemo, useState } from 'react'
import { App as AntdApp, Button, Input, Modal } from 'antd'
import { 桥接 } from '../ipc/bridge'
import Icon from '../components/Icon'
import { holidaysOn } from './holidays'
import { 更新日程提醒, 播放提示音, 提醒状态, 提醒状态事件 } from './calendarReminders'
import { 日程存储键 as 存储键, 提示音, type Tone, 解析日程, 生成日历文件, 校验日程, type 日程项 } from './calendarData'
import { 下载本地内容 } from './download'
import './localTools.css'

const 补零 = (值: number) => String(值).padStart(2, '0')
const 今天 = () => { const 日期 = new Date(); return `${日期.getFullYear()}-${补零(日期.getMonth() + 1)}-${补零(日期.getDate())}` }
const 节日英文: Record<string, string> = { 元旦: 'New Year’s Day', 情人节: 'Valentine’s Day', 国际妇女节: 'International Women’s Day', 植树节: 'Arbor Day', 圣帕特里克节: 'St. Patrick’s Day', 世界地球日: 'Earth Day', 国际劳动节: 'International Workers’ Day', 青年节: 'Youth Day', 国际护士节: 'International Nurses Day', 儿童节: 'Children’s Day', 世界环境日: 'World Environment Day', 建党纪念日: 'Party Founding Anniversary', 美国独立日: 'Independence Day', 法国国庆日: 'Bastille Day', 建军节: 'Army Day', 教师节: 'Teachers’ Day', 国庆节: 'National Day', 联合国日: 'United Nations Day', 万圣夜: 'Halloween', 停战纪念日: 'Armistice Day', 平安夜: 'Christmas Eve', 圣诞节: 'Christmas Day', 节礼日: 'Boxing Day', 春节: 'Chinese New Year', 元宵节: 'Lantern Festival', 龙抬头: 'Dragon Head-raising Day', 端午节: 'Dragon Boat Festival', 七夕节: 'Qixi Festival', 中元节: 'Ghost Festival', 中秋节: 'Mid-Autumn Festival', 重阳节: 'Double Ninth Festival', 腊八节: 'Laba Festival', 除夕: 'Chinese New Year’s Eve', 清明节: 'Qingming Festival', 西方复活节: 'Easter', 母亲节: 'Mother’s Day', 父亲节: 'Father’s Day', 美国感恩节: 'Thanksgiving Day', 加拿大感恩节: 'Canadian Thanksgiving' }
const 地区英文: Record<string, string> = { 中国大陆: 'Mainland China', 多国: 'Multiple countries', 国际: 'International', 爱尔兰等地: 'Ireland and elsewhere', 美国: 'United States', 法国: 'France', '英国、加拿大等地': 'United Kingdom, Canada, and elsewhere', '美国、中国等地': 'United States, China, and elsewhere', 西方基督教传统: 'Western Christian tradition', 加拿大: 'Canada' }
const 月份文字 = (日期: Date,en: boolean) => new Intl.DateTimeFormat(en ? 'en-US' : 'zh-CN', { year: 'numeric', month: 'long' }).format(日期)
const 空表单 = (日期: string): 日程项 => ({ id: '', 标题: '', 日期, 开始: '09:00', 结束: '10:00', 备注: '', 提醒: 'bell' })

export default function CalendarPage() {
  const { message, modal } = AntdApp.useApp()
  const en = document.documentElement.lang === 'en-US'
  const 节日名 = (name: string) => en ? 节日英文[name] ?? name : name
  const 地区名 = (region: string) => en ? 地区英文[region] ?? region : region
  const [当前月, 设当前月] = useState(() => { const 现在 = new Date(); return new Date(现在.getFullYear(), 现在.getMonth(), 1) })
  const [选中日期, 设选中日期] = useState(今天)
  const [日程, 设日程] = useState<日程项[]>([])
  const [提醒方式, 设提醒方式] = useState(提醒状态)
  useEffect(() => {
    const refresh = () => 设提醒方式(提醒状态)
    window.addEventListener(提醒状态事件, refresh)
    return () => window.removeEventListener(提醒状态事件, refresh)
  }, [])
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

  const 保存日程 = (新列表: 日程项[], 申请通知 = false) => {
    try {
      localStorage.setItem(存储键, JSON.stringify(新列表))
      设日程(新列表)
      更新日程提醒(申请通知)
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
      const key = `${日期.getFullYear()}-${补零(日期.getMonth() + 1)}-${补零(日期.getDate())}`
      return { 日期: key, ...holidaysOn(key), 日: 日期.getDate(), 本月: 日期.getMonth() === 当前月.getMonth() }
    })
  }, [当前月])
  const 当天 = holidaysOn(选中日期)
  const 当日日程 = 日程.filter((项) => 项.日期 === 选中日期).sort((甲, 乙) => 甲.开始.localeCompare(乙.开始))
  const 日程计数 = useMemo(() => 日程.reduce<Record<string, number>>((结果, 项) => { 结果[项.日期] = (结果[项.日期] ?? 0) + 1; return 结果 }, {}), [日程])

  const 提交表单 = () => {
    if (!表单) return
    try {
      const 项 = 校验日程({ ...表单, id: 表单.id || `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })
      const 新列表 = 表单.id ? 日程.map((原项) => 原项.id === 表单.id ? 项 : 原项) : [...日程, 项]
      if (保存日程(新列表, Boolean(项.提醒))) { 设表单(null); 设选中日期(项.日期); message.success('日程已保存') }
    } catch (错误) {
      modal.error({ title: '日程内容无效', content: 错误 instanceof Error ? 错误.message : '请检查日期与时间' })
    }
  }

  const 删除日程 = (项: 日程项) => modal.confirm({ title: '删除日程', content: `确认删除「${项.标题}」？`, okText: '删除', okType: 'danger', cancelText: '取消', onOk: () => { if (保存日程(日程.filter((原项) => 原项.id !== 项.id))) message.success('日程已删除') } })
  const 清除损坏数据 = () => modal.confirm({ title: '清除损坏的日程数据', content: '此操作会删除本机保存的日程记录，无法撤销。', okText: '确认清除', okType: 'danger', cancelText: '取消', onOk: () => {
    try { localStorage.removeItem(存储键); 更新日程提醒(); 设读取错误(null); 设日程([]); message.success('已清除损坏数据') }
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
      <section className="calendar-card" aria-label={en ? 'Monthly calendar' : '月份日历'}><div className="calendar-card__nav"><Button type="text" aria-label={en ? 'Previous month' : '上个月'} title={en ? 'Previous month' : '上个月'} icon={<Icon name="arrow-left" />} onClick={() => 设当前月(月 => new Date(月.getFullYear(), 月.getMonth() - 1, 1))} /><strong>{月份文字(当前月,en)}</strong><Button type="text" aria-label={en ? 'Next month' : '下个月'} title={en ? 'Next month' : '下个月'} icon={<Icon name="arrow-left" className="calendar-next" />} onClick={() => 设当前月(月 => new Date(月.getFullYear(), 月.getMonth() + 1, 1))} /></div><div className="calendar-grid">{(en ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['周一', '周二', '周三', '周四', '周五', '周六', '周日']).map((项) => <span className="calendar-grid__weekday" key={项}>{项}</span>)}{日期格.map((项) => <button key={项.日期} type="button" className={`calendar-grid__day${项.本月 ? '' : ' calendar-grid__day--other'}${项.日期 === 选中日期 ? ' calendar-grid__day--selected' : ''}`} onClick={() => { 设选中日期(项.日期); if (!项.本月) 设当前月(new Date(`${项.日期}T00:00:00`)) }}><span className="calendar-date">{项.日}{项.status && <small data-status={项.status}>{en ? (项.status === '休' ? 'Off' : 'Work') : 项.status}</small>}</span>{项.list.length > 0 && <small className="calendar-festival" title={项.list.map(f => 节日名(f.name)).join(', ')}>{节日名(项.list[0].name)}</small>}{日程计数[项.日期] ? <small>{en ? `${日程计数[项.日期]} event${日程计数[项.日期] === 1 ? '' : 's'}` : `${日程计数[项.日期]} 项`}</small> : null}</button>)}</div></section>
      <section className="calendar-agenda"><h2>{选中日期} {en ? 'events' : '的日程'}</h2>{当天.list.map(f => <p className="calendar-observance" key={f.name}><strong>{节日名(f.name)}</strong> · {地区名(f.region)}</p>)}{当天.status && <p>{en ? (当天.status === '休' ? 'Mainland China holiday' : 'Mainland China working day') : (当天.status === '休' ? '中国大陆放假日' : '中国大陆调休上班日')}</p>}{当天.schedule ? <a onClick={e => { e.preventDefault(); void 桥接.openExternal(当天.schedule.sources[当天.schedule.sources.length - 1]) }} href={当天.schedule.sources[当天.schedule.sources.length - 1]}>{en ? 'View annual holiday schedule' : '查看年度放假安排'}</a> : <small>{Number(选中日期.slice(0, 4)) > 2027 ? (en ? 'Annual holiday schedule pending' : '年度放假安排待公布') : (en ? 'This year’s holiday schedule is not stored on this device' : '本机未收录该年度放假安排')}</small>}{当日日程.length === 0 ? <p className="local-page__muted">{en ? 'No events today.' : '当天没有日程。'}</p> : 当日日程.map((项) => <div className="calendar-event" key={项.id}><div><strong>{项.标题}</strong><span>{项.开始} {en ? 'to' : '至'} {项.结束}{项.提醒 && ` · ${提示音[项.提醒]}`}</span>{项.备注 ? <p>{项.备注}</p> : null}</div><div><Button size="small" onClick={() => 设表单(项)}>{en ? 'Edit' : '编辑'}</Button><Button size="small" danger onClick={() => 删除日程(项)}>{en ? 'Delete' : '删除'}</Button></div></div>)}</section>
    </div>}
    <Modal title={表单?.id ? '编辑日程' : '新增日程'} open={表单 !== null} onCancel={() => 设表单(null)} onOk={提交表单} okText="保存" cancelText="取消" destroyOnHidden>{表单 ? <div className="local-form"><label>标题<Input value={表单.标题} maxLength={200} onChange={(事件) => 设表单({ ...表单, 标题: 事件.target.value })} /></label><label>日期<input type="date" value={表单.日期} onChange={(事件) => 设表单({ ...表单, 日期: 事件.target.value })} /></label><div className="local-form__times"><label>开始<input type="time" value={表单.开始} onChange={(事件) => 设表单({ ...表单, 开始: 事件.target.value })} /></label><label>结束<input type="time" value={表单.结束} onChange={(事件) => 设表单({ ...表单, 结束: 事件.target.value })} /></label></div><label>到点提醒<select value={表单.提醒 ?? ''} onChange={e => 设表单({ ...表单, 提醒: (e.target.value || undefined) as Tone | undefined })}><option value="">关闭提醒</option>{Object.entries(提示音).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{表单.提醒 && <div className="calendar-sound"><Button size="small" onClick={() => void 播放提示音(表单.提醒!).catch(() => message.warning('当前设备无法播放提示音'))}>试听</Button><small role="status">{提醒方式}</small></div>}<label>备注<Input.TextArea value={表单.备注} maxLength={5000} rows={3} onChange={(事件) => 设表单({ ...表单, 备注: 事件.target.value })} /></label></div> : null}</Modal>
  </div>
}
