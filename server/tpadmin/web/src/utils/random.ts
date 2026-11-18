/**
 * 随机工具:随机数、随机字符串、图形验证码字符。
 * Author: qiufeng
 */

/** [min, max] 闭区间随机整数 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 随机字符串(默认字母+数字) */
export function randomString(length = 16, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
  let result = '';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) result += chars[bytes[i]! % chars.length];
  return result;
}

/** 数字验证码:randomCode(6) → '048613' */
export function randomCode(length = 6): string {
  return randomString(length, '0123456789');
}
