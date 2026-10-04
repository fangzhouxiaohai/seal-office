import type { 幻灯片, 演示对象 } from '../deck'
import { 同步连接点 } from './elements'
import { 对象允许编辑, 对象可以移动, 对象支持旋转, 要求对象可编辑 } from './objectPermissions'
export { 对象可以移动 } from './objectPermissions'
export type 几何修改 = Partial<Pick<演示对象, 'x' | 'y' | 'width' | 'height' | '旋转' | '锁定' | '裁剪'>>
/** 按原生对象树顺序排列父节点和成员，解除组合时保留外部对象图层。 */
export function 读取对象树顺序(列表: 演示对象[]): 演示对象[] {
  const 成员 = new Set(列表.flatMap(项 => 项.子对象标识 ?? []))
  const 展开 = (对象: 演示对象): 演示对象[] => [对象, ...(对象.子对象标识 ?? []).flatMap(id => { const 子 = 列表.find(项 => 项.id === id); return 子 ? 展开(子) : [] })]
  return 列表.filter(项 => !成员.has(项.id)).flatMap(展开)
}
export function 修改对象(页: 幻灯片, 标识: string[], 修改: 几何修改): 幻灯片 {
  if (修改.旋转 !== undefined && (页.对象列表 ?? []).some(项 => 标识.includes(项.id) && !对象支持旋转(项))) throw new Error('选中的表格、组合或连接线暂不支持旋转')
  if (标识.length > 1 && !(Object.keys(修改).length === 1 && 修改.锁定 === false)) 要求对象可编辑(页,标识)
  for (const 键 of ['x','y','width','height','旋转'] as const) {
    const 值 = 修改[键]
    if (值 !== undefined && (!Number.isFinite(值) || (['width','height'].includes(键) && 值 <= 0))) throw new Error('对象位置或尺寸无效')
  }
  if (修改.裁剪 && (Object.values(修改.裁剪).some(值 => !Number.isFinite(值) || 值 < 0 || 值 >= 1) || 修改.裁剪.左 + 修改.裁剪.右 >= 1 || 修改.裁剪.上 + 修改.裁剪.下 >= 1)) throw new Error('图片裁剪范围无效')
  const 列表 = (页.对象列表 ?? []).map(项 => ({ ...项 }))
  let 有变化 = false
  const 修改单项 = (id: string, 值: 几何修改) => {
    const 下标 = 列表.findIndex(项 => 项.id === id), 原 = 列表[下标]
    const 仅解锁 = Object.keys(值).length === 1 && 值.锁定 === false
    if (!原 || !对象允许编辑(页,id,仅解锁)) return
    if (Object.entries(值).every(([键,值]) => 原[键 as keyof 演示对象] === 值)) return
    const 新 = { ...原, ...值 }
    if (原.类型 === '组合' && 原.子对象标识) {
      if (值.旋转 !== undefined && 值.旋转 !== 0) throw new Error('组合暂不支持旋转，请先取消组合')
      if (['x','y','width','height'].some(键 => 值[键 as keyof 几何修改] !== undefined) && !对象可以移动(页, 原.id)) throw new Error('组合含锁定成员，请先取消组合并解锁成员')
      const 横比 = 新.width / 原.width, 纵比 = 新.height / 原.height
      for (const 子id of 原.子对象标识) {
        const 子 = 列表.find(项 => 项.id === 子id)
        if (子) 修改单项(子id, { x: 新.x + (子.x - 原.x) * 横比, y: 新.y + (子.y - 原.y) * 纵比, width: 子.width * 横比, height: 子.height * 纵比 })
      }
    }
    列表[下标] = 新
    有变化 = true
  }
  标识.forEach(id => 修改单项(id, 修改))
  return 有变化 ? 同步连接点({ ...页, 对象列表: 列表 }) : 页
}
const 选中 = (页: 幻灯片, 标识: string[]) => { 要求对象可编辑(页,标识); return (页.对象列表 ?? []).filter(项 => 标识.includes(项.id)) }
export function 替换对象内容(页: 幻灯片, 对象: 演示对象): 幻灯片 {
  要求对象可编辑(页,[对象.id])
  return { ...页, 对象列表: 页.对象列表!.map(项 => 项.id === 对象.id ? 对象 : 项) }
}
export function 删除对象(页: 幻灯片, 标识: string[]): 幻灯片 {
  要求对象可编辑(页,标识)
  const 删除 = new Set(标识)
  const 展开 = (id: string) => { for (const 子 of 页.对象列表?.find(项 => 项.id === id)?.子对象标识 ?? []) { 删除.add(子); 展开(子) } }
  for (const id of 删除) 展开(id)
  for (const 项 of 页.对象列表 ?? []) if (项.连接 && (删除.has(项.连接.起点.对象) || 删除.has(项.连接.终点.对象))) 删除.add(项.id)
  要求对象可编辑(页,[...删除])
  return { ...页, 对象列表: 页.对象列表?.filter(项 => !删除.has(项.id)).map(项 => 项.子对象标识 ? { ...项, 子对象标识: 项.子对象标识.filter(id => !删除.has(id)) } : 项).filter(项 => 项.类型 !== '组合' || 项.子对象标识?.length) }
}
export function 对齐对象(页: 幻灯片, 标识: string[], 方向: '左'|'右'|'上'|'下'|'水平居中'|'垂直居中'): 幻灯片 {
  const 列表 = 选中(页, 标识)
  if (列表.length < 2) return 页
  const 左 = Math.min(...列表.map(项 => 项.x)), 右 = Math.max(...列表.map(项 => 项.x + 项.width)), 上 = Math.min(...列表.map(项 => 项.y)), 下 = Math.max(...列表.map(项 => 项.y + 项.height))
  return 列表.reduce((当前, 项) => 修改对象(当前, [项.id], 方向 === '左' ? { x: 左 } : 方向 === '右' ? { x: 右 - 项.width } : 方向 === '上' ? { y: 上 } : 方向 === '下' ? { y: 下 - 项.height } : 方向 === '水平居中' ? { x: (左 + 右 - 项.width) / 2 } : { y: (上 + 下 - 项.height) / 2 }), 页)
}
export function 分布对象(页: 幻灯片, 标识: string[], 方向: '水平'|'垂直'): 幻灯片 {
  const 坐标 = 方向 === '水平' ? 'x' : 'y', 尺寸 = 方向 === '水平' ? 'width' : 'height'
  const 列表 = 选中(页, 标识).sort((甲, 乙) => 甲[坐标] - 乙[坐标])
  if (列表.length < 3) return 页
  const 间隔 = (列表[列表.length - 1][坐标] + 列表[列表.length - 1][尺寸] - 列表[0][坐标] - 列表.reduce((总, 项) => 总 + 项[尺寸], 0)) / (列表.length - 1)
  let 位置 = 列表[0][坐标], 当前 = 页
  for (const 项 of 列表) { 当前 = 修改对象(当前, [项.id], { [坐标]: 位置 }); 位置 += 项[尺寸] + 间隔 }
  return 当前
}
export function 组合对象(页: 幻灯片, 标识: string[], id: string): 幻灯片 {
  const 列表 = 选中(页, 标识)
  if (列表.length < 2) throw new Error('请至少选择两个未锁定的图片对象')
  const 已分组 = new Set((页.对象列表 ?? []).flatMap(项 => 项.子对象标识 ?? []))
  if (列表.some(项 => 已分组.has(项.id))) throw new Error('请先取消已有组合')
  const x = Math.min(...列表.map(项 => 项.x)), y = Math.min(...列表.map(项 => 项.y))
  return { ...页, 对象列表: [...页.对象列表 ?? [], { id, 类型: '组合', x, y, width: Math.max(...列表.map(项 => 项.x + 项.width)) - x, height: Math.max(...列表.map(项 => 项.y + 项.height)) - y, 子对象标识: 列表.map(项 => 项.id) }] }
}
export function 解除组合(页: 幻灯片, 标识: string[]): 幻灯片 {
  要求对象可编辑(页,标识)
  const 列表 = 读取对象树顺序(页.对象列表 ?? [])
  const 取消 = new Set(列表.filter(项 => 标识.includes(项.id) && 项.类型 === '组合' && !项.锁定).map(项 => 项.id))
  const 保留成员 = (id: string): string[] => 取消.has(id) ? (列表.find(项 => 项.id === id)?.子对象标识 ?? []).flatMap(保留成员) : [id]
  return { ...页, 对象列表: 列表.filter(项 => !取消.has(项.id)).map(项 => 项.类型 === '组合' ? { ...项, 子对象标识: 项.子对象标识?.flatMap(保留成员) } : 项) }
}
export function 调整图层(页: 幻灯片, 标识: string[], 方向: '置顶'|'置底'|'上移'|'下移'): 幻灯片 {
  const 成员 = new Set((页.对象列表 ?? []).flatMap(项 => 项.子对象标识 ?? []))
  const 子对象 = (页.对象列表 ?? []).filter(项 => 成员.has(项.id))
  const 列表 = (页.对象列表 ?? []).filter(项 => !成员.has(项.id)), 集合 = new Set(选中(页, 标识).map(项 => 项.id))
  if (方向 === '置顶' || 方向 === '置底') return { ...页, 对象列表: [...(方向 === '置顶' ? [...列表.filter(项 => !集合.has(项.id)), ...列表.filter(项 => 集合.has(项.id))] : [...列表.filter(项 => 集合.has(项.id)), ...列表.filter(项 => !集合.has(项.id))]), ...子对象] }
  const 方向值 = 方向 === '上移' ? 1 : -1
  for (let i = 方向值 > 0 ? 列表.length - 2 : 1; i >= 0 && i < 列表.length; i -= 方向值) {
    const j = i + 方向值
    if (j >= 0 && j < 列表.length && 集合.has(列表[i].id) && !集合.has(列表[j].id)) [列表[i], 列表[j]] = [列表[j], 列表[i]]
  }
  return { ...页, 对象列表: [...列表, ...子对象] }
}
export function 吸附位置(x: number, y: number, 宽: number, 高: number, 缩放: number, 垂直: number[], 水平: number[]) {
  const 吸附 = (位置: number, 大小: number, 线: number[]) => {
    let 差 = 6 / 缩放, 结果 = 位置
    for (const 参考 of 线) for (const 偏移 of [0, 大小 / 2, 大小]) if (Math.abs(参考 - 位置 - 偏移) < 差) { 差 = Math.abs(参考 - 位置 - 偏移); 结果 = 参考 - 偏移 }
    return 结果
  }
  return { x: 吸附(x, 宽, 垂直), y: 吸附(y, 高, 水平) }
}
