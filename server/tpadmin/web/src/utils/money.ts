/**
 * 金额工具:元分转换、格式化(与后端 MoneyHelper 口径一致,分为整数)。
 * Author: qiufeng
 */

/** 元转分:yuanToFen('12.34') → 1234,四舍五入到分 */
export function yuanToFen(yuan: number | string): number {
  return Math.round(Number(yuan) * 100);
}

/** 分转元:fenToYuan(1234) → '12.34' */
export function fenToYuan(fen: number, decimals = 2): string {
  return (fen / 100).toFixed(decimals);
}

/** 格式化金额(千分位):formatMoney(1234567, {fromFen:true}) → '¥12,345.67' */
export function formatMoney(
  value: number | string,
  options: { fromFen?: boolean; symbol?: string; decimals?: number } = {},
): string {
  const { fromFen = false, symbol = '¥', decimals = 2 } = options;
  let num = Number(value);
  if (Number.isNaN(num)) return `${symbol}0.00`;
  if (fromFen) num = num / 100;
  const parts = num.toFixed(decimals).split('.');
  parts[0] = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return symbol + parts.join('.');
}
