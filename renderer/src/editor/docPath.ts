export interface 文档路径状态 {
  已保存路径: string | null
  已修改: boolean
}

export const 初始路径状态 = (): 文档路径状态 => ({ 已保存路径: null, 已修改: false })

export function 标记修改(状态: 文档路径状态): 文档路径状态 {
  const 路径 = 状态.已保存路径
  return { 已保存路径: 路径, 已修改: true }
}

export function 标记已保存(_状态: 文档路径状态, 路径: string): 文档路径状态 {
  return { 已保存路径: 路径, 已修改: false }
}

export function 需要另存(状态: 文档路径状态): boolean {
  return 状态.已保存路径 === null
}
