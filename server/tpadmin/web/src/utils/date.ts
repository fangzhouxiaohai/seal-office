/**
 * 日期时间工具(基于 dayjs)。
 * Author: qiufeng
 */
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('zh-cn');

export type DateInput = string | number | Date | dayjs.Dayjs | null | undefined;

/**
 * 全局时间显示格式(dayjs 格式串),由后台「系统配置 → 时间格式」统一设置。
 * formatDate 不传 template 时默认用它,从而无论数据库存什么都按用户选定格式展示。
 */
let globalDateFormat = 'YYYY-MM-DD HH:mm:ss';

export function setGlobalDateFormat(template: string): void {
  if (template && template.trim()) globalDateFormat = template.trim();
}

export function getGlobalDateFormat(): string {
  return globalDateFormat;
}

/** 统一入参:秒级时间戳自动转毫秒 */
function toDayjs(value: DateInput): dayjs.Dayjs | null {
  if (value === null || value === undefined || value === '' || value === 0) return null;
  if (typeof value === 'number' && value < 1e12) value = value * 1000;
  const d = dayjs(value);
  return d.isValid() ? d : null;
}

/** 格式化:不传 template 时用全局格式;无效值返回占位符 */
export function formatDate(value: DateInput, template?: string, fallback = '-'): string {
  const d = toDayjs(value);
  return d ? d.format(template ?? globalDateFormat) : fallback;
}

/** 仅日期:'2026-06-12' */
export function formatDay(value: DateInput, fallback = '-'): string {
  return formatDate(value, 'YYYY-MM-DD', fallback);
}

/** 相对时间:'3 分钟前' */
export function fromNow(value: DateInput, fallback = '-'): string {
  const d = toDayjs(value);
  return d ? d.fromNow() : fallback;
}

/** 日期范围:dateRange(7) → 最近 7 天 ['2026-06-06 00:00:00', '2026-06-12 23:59:59'] */
export function dateRange(days: number): [string, string] {
  const end = dayjs().endOf('day');
  const start = end.subtract(days - 1, 'day').startOf('day');
  return [start.format('YYYY-MM-DD HH:mm:ss'), end.format('YYYY-MM-DD HH:mm:ss')];
}

/** 指定时区显示:formatInTimezone(ts, 'America/New_York') */
export function formatInTimezone(value: DateInput, tz: string, template = 'YYYY-MM-DD HH:mm:ss', fallback = '-'): string {
  const d = toDayjs(value);
  return d ? d.tz(tz).format(template) : fallback;
}

export { dayjs };
