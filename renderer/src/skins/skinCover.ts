import type { 皮肤定义 } from '../styles/themes'

/** UTF-8 文本与 base64 互转（皮肤名称含中文）。 */
export const 文本转base64 = (文本: string) => {
  const 字节 = new TextEncoder().encode(文本)
  let 二进制 = ''
  for (let 下标 = 0; 下标 < 字节.length; 下标 += 0x8000) 二进制 += String.fromCharCode(...字节.subarray(下标, 下标 + 0x8000))
  return btoa(二进制)
}
export const base64转文本 = (数据: string) => new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(数据), 字符 => 字符.charCodeAt(0)))

/** 生成皮肤公开封面：浅色与深色两组色块的静态 SVG，不含脚本与外部引用。 */
export function 皮肤封面(皮肤: 皮肤定义): string {
  const 块 = (色: 皮肤定义['light'], 横: number) => `<g transform="translate(${横} 0)"><rect width="160" height="100" fill="${色.bg}"/><rect x="8" y="8" width="34" height="84" rx="6" fill="${色.sidebar}" stroke="${色.border}"/><rect x="50" y="8" width="102" height="84" rx="8" fill="${色.card}" stroke="${色.border}"/><rect x="60" y="20" width="70" height="8" rx="4" fill="${色.text}"/><rect x="60" y="36" width="50" height="6" rx="3" fill="${色.text2}"/><rect x="60" y="66" width="56" height="16" rx="8" fill="${色.brand}"/><circle cx="25" cy="22" r="6" fill="${色.brand}"/></g>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100" viewBox="0 0 320 100">${块(皮肤.light, 0)}${块(皮肤.dark, 160)}</svg>`
  return 'data:image/svg+xml;base64,' + 文本转base64(svg)
}
