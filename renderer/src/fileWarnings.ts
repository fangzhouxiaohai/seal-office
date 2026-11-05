/** 可安全直接打开、但保存时仍需提示的导入警告。 */
export const 可直开保存风险警告 = new Set(['域代码未完整导入，已保留可读取的缓存结果'])

export function 需要转换确认(警告: readonly string[]): boolean {
  return 警告.some((项) => !可直开保存风险警告.has(项))
}

export function 处于受保护查看(来源路径: string | undefined, 当前路径: string | null | undefined, 警告: readonly string[] | undefined): boolean {
  if (!来源路径 || !当前路径 || !警告?.length || !需要转换确认(警告)) return false
  return 来源路径.replace(/\\/g, '/').toLowerCase() === 当前路径.replace(/\\/g, '/').toLowerCase()
}
