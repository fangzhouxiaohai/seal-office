/**
 * UUID 工具:UUID v4、短 ID。
 * Author: qiufeng
 */
import { v4 } from 'uuid';

/** 标准 UUID v4:'8f14e45f-...' */
export function uuid(): string {
  return v4();
}

/** 短 ID(去掉连字符的 UUID 前 N 位,适合临时 key) */
export function shortId(length = 12): string {
  return v4().replace(/-/g, '').slice(0, length);
}
