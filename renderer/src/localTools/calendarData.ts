export interface 日程项 { id: string; 标题: string; 日期: string; 开始: string; 结束: string; 备注: string }

export function 是有效日期(日期: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(日期)) return false
  const [年, 月, 日] = 日期.split('-').map(Number)
  const 结果 = new Date(Date.UTC(年, 月 - 1, 日))
  return 结果.getUTCFullYear() === 年 && 结果.getUTCMonth() === 月 - 1 && 结果.getUTCDate() === 日
}

function 是有效时间(时间: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(时间)) return false
  const [时, 分] = 时间.split(':').map(Number)
  return 时 >= 0 && 时 <= 23 && 分 >= 0 && 分 <= 59
}

export function 校验日程(值: unknown): 日程项 {
  if (!值 || typeof 值 !== 'object' || Array.isArray(值)) throw new Error('日程条目格式无效')
  const 项 = 值 as Record<string, unknown>
  if (typeof 项.id !== 'string' || !项.id || typeof 项.标题 !== 'string' || !项.标题.trim() || 项.标题.length > 200) throw new Error('日程标题或标识无效')
  if (typeof 项.日期 !== 'string' || !是有效日期(项.日期)) throw new Error('日程日期无效')
  if (typeof 项.开始 !== 'string' || typeof 项.结束 !== 'string' || !是有效时间(项.开始) || !是有效时间(项.结束) || 项.结束 <= 项.开始) throw new Error('日程时间范围无效')
  if (typeof 项.备注 !== 'string' || 项.备注.length > 5000) throw new Error('日程备注无效')
  return { id: 项.id, 标题: 项.标题, 日期: 项.日期, 开始: 项.开始, 结束: 项.结束, 备注: 项.备注 }
}

export function 解析日程(原文: string | null): 日程项[] {
  if (原文 === null) return []
  let 数据: unknown
  try { 数据 = JSON.parse(原文) }
  catch { throw new Error('本机日程数据格式损坏，无法读取') }
  if (!Array.isArray(数据) || 数据.length > 5000) throw new Error('本机日程列表格式无效')
  const 列表 = 数据.map(校验日程)
  if (new Set(列表.map((项) => 项.id)).size !== 列表.length) throw new Error('本机日程标识重复')
  return 列表
}

function 转义日历文本(文本: string): string {
  return 文本.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export function 生成日历文件(列表: 日程项[]): string {
  const 有效 = 列表.map(校验日程)
  const 时间戳 = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const 行 = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Seal Office//Local Calendar//ZH']
  for (const 项 of 有效) {
    const 日期 = 项.日期.replace(/-/g, '')
    行.push('BEGIN:VEVENT', `UID:${项.id.replace(/[^A-Za-z0-9_-]/g, '')}@seal-office.local`, `DTSTAMP:${时间戳}`, `DTSTART:${日期}T${项.开始.replace(':', '')}00`, `DTEND:${日期}T${项.结束.replace(':', '')}00`, `SUMMARY:${转义日历文本(项.标题)}`, `DESCRIPTION:${转义日历文本(项.备注)}`, 'END:VEVENT')
  }
  行.push('END:VCALENDAR')
  return `${行.join('\r\n')}\r\n`
}
