import type { 幻灯片, 演示对象 } from '../deck'
/** 锁定由自身和完整祖先链共同决定；解锁只能忽略目标自身。 */
export function 对象允许编辑(页: 幻灯片, id: string, 忽略自身锁定 = false): boolean {
  const 列表 = 页.对象列表 ?? [], 对象 = 列表.find(项 => 项.id === id)
  if (!对象 || (!忽略自身锁定 && 对象.锁定)) return false
  const 访问 = new Set([id])
  let 当前 = id
  while (true) {
    const 父 = 列表.find(项 => 项.子对象标识?.includes(当前))
    if (!父) return true
    if (父.锁定 || 访问.has(父.id)) return false
    访问.add(父.id); 当前 = 父.id
  }
}
export function 对象可以移动(页: 幻灯片, id: string): boolean {
  if (!对象允许编辑(页,id)) return false
  return (页.对象列表?.find(项 => 项.id === id)?.子对象标识 ?? []).every(子 => 对象可以移动(页,子))
}
export function 对象支持旋转(对象: 演示对象): boolean {
  return 对象.类型 !== '表格' && 对象.类型 !== '组合' && !对象.连接
}
export function 要求对象可编辑(页: 幻灯片, 标识: string[]): void {
  if (标识.some(id => !对象可以移动(页,id))) throw new Error('对象或其组合已锁定，请先解锁所属组合及成员')
}
