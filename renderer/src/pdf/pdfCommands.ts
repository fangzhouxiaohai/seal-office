export type PDF命令 = 'extract' | 'merge' | 'delete' | 'rotate' | 'insertBlank' | 'insertPages'
export const PDF命令表: Record<PDF命令, string> = { extract: '提取页面', merge: '合并文件', delete: '删除页面', rotate: '旋转页面', insertBlank: '插入空白页', insertPages: '插入其他文件页面' }
export function 解析页码(文本: string): number[] {
  if (!文本.trim()) throw new Error('页码格式无效，请输入正整数或递增范围，例如 1,3-5。')
  const 结果: number[] = []
  文本.split(',').forEach((片段) => {
    const 值 = 片段.trim()
    const 匹配 = /^([1-9]\d*)(?:\s*-\s*([1-9]\d*))?$/.exec(值)
    if (!匹配) throw new Error('页码格式无效，请输入正整数或递增范围，例如 1,3-5。')
    const 起点 = Number(匹配[1]), 终点 = 匹配[2] ? Number(匹配[2]) : 起点
    if (!Number.isSafeInteger(起点) || !Number.isSafeInteger(终点) || 起点 > 终点) {
      throw new Error('页码格式无效，请输入正整数或递增范围，例如 1,3-5。')
    }
    if (终点 - 起点 > 10000) throw new Error('页码格式无效，单个范围不能超过一万页。')
    for (let 页码 = 起点; 页码 <= 终点; 页码 += 1) 结果.push(页码)
  })
  return [...new Set(结果)]
}
