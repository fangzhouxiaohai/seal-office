import schedules from './holidaySchedule.json'

type Observance = { name: string; region: string }
const mainland = '中国大陆'
const fixed: Record<string, [string, string]> = {
  '01-01': ['元旦', '多国'], '02-14': ['情人节', '多国'], '03-08': ['国际妇女节', '国际'],
  '03-12': ['植树节', mainland], '03-17': ['圣帕特里克节', '爱尔兰等地'], '04-22': ['世界地球日', '国际'],
  '05-01': ['国际劳动节', '多国'], '05-04': ['青年节', mainland], '05-12': ['国际护士节', '国际'],
  '06-01': ['儿童节', '中国大陆等地'], '06-05': ['世界环境日', '国际'], '07-01': ['建党纪念日', mainland],
  '07-04': ['美国独立日', '美国'], '07-14': ['法国国庆日', '法国'], '08-01': ['建军节', mainland],
  '09-10': ['教师节', mainland], '10-01': ['国庆节', mainland], '10-24': ['联合国日', '国际'],
  '10-31': ['万圣夜', '多国'], '11-11': ['停战纪念日', '法国等地'], '12-24': ['平安夜', '多国'],
  '12-25': ['圣诞节', '多国'], '12-26': ['节礼日', '英国、加拿大等地'],
}
const lunarNames: Record<string, string> = { '1/1': '春节', '1/15': '元宵节', '2/2': '龙抬头', '5/5': '端午节', '7/7': '七夕节', '7/15': '中元节', '8/15': '中秋节', '9/9': '重阳节', '12/8': '腊八节' }
const chineseCalendar = new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' })
// 北京时间太阳黄经 15°，lunar-javascript 1.7.7 节气表，逐年记录 1900 到 2100 年的四月日号。
const qingming = '556655665566555655565556555655565556555655565555555555555555555555555555555545554555455545554555455545554555445544554455445544554455445544554445444544454445444544454445444544444444444444444444444444445'
const annual: Record<string, { sources: string[]; days: Record<string, string> }> = schedules
export const annualSchedule = (year: string) => annual[year]

function easterDay(year: number) {
  // Gregorian computus (Meeus/Jones/Butcher).
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - c % 4) % 7
  const n = h + l - 7 * Math.floor((a + 11 * h + 22 * l) / 451) + 114
  return [Math.floor(n / 31), (n % 31) + 1]
}

export function holidaysOn(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const noon = Date.UTC(year, month - 1, day, 4)
  const weekday = new Date(noon).getUTCDay(), week = Math.ceil(day / 7)
  const list: Observance[] = []
  const add = (name: string, region = mainland) => list.push({ name, region })
  const solar = fixed[date.slice(5)]
  if (solar) add(...solar)
  const lunar = lunarNames[chineseCalendar.format(noon)]
  if (lunar) add(lunar)
  if (month <= 2 && chineseCalendar.format(noon + 86400000) === '1/1') add('除夕')
  if (month === 4 && day === Number(qingming[year - 1900])) add('清明节')
  const [em, ed] = easterDay(year)
  if (em === month && ed === day) add('西方复活节', '西方基督教传统')
  if (weekday === 0 && month === 5 && week === 2) add('母亲节', '美国、中国等地')
  if (weekday === 0 && month === 6 && week === 3) add('父亲节', '美国、中国等地')
  if (weekday === 4 && month === 11 && week === 4) add('美国感恩节', '美国')
  if (weekday === 1 && month === 10 && week === 2) add('加拿大感恩节', '加拿大')
  const schedule = annualSchedule(date.slice(0, 4))
  return { list, status: schedule?.days[date], schedule }
}
