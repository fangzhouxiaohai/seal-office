/**
 * 字符串工具:脱敏、截断、命名转换、空值显示。
 * Author: qiufeng
 */

/** 脱敏:保留前 keepStart 后 keepEnd 位,中间替换为 *。mask('13812345678', 3, 4) → '138****5678' */
export function mask(value: string, keepStart = 3, keepEnd = 4, char = '*'): string {
  if (!value) return '';
  if (value.length <= keepStart + keepEnd) return char.repeat(value.length);
  return value.slice(0, keepStart) + char.repeat(Math.min(value.length - keepStart - keepEnd, 6)) + value.slice(-keepEnd);
}

/** 截断并加省略号:truncate('hello world', 5) → 'hello…' */
export function truncate(value: string, length: number, suffix = '…'): string {
  if (!value || value.length <= length) return value ?? '';
  return value.slice(0, length) + suffix;
}

/** 下划线转小驼峰:'create_time' → 'createTime' */
export function camelCase(value: string): string {
  return value.replace(/[_-](\w)/g, (_, c: string) => c.toUpperCase());
}

/** 驼峰转下划线:'createTime' → 'create_time' */
export function snakeCase(value: string): string {
  return value.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/** 首字母大写 */
export function upperFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

/** 空值显示:null/undefined/'' → '-',其余原样转字符串 */
export function display(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}
