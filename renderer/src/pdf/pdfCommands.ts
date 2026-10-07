export type PDF命令 = 'extract' | 'merge' | 'delete' | 'rotate' | 'insertBlank' | 'insertPages'
export const PDF命令表: Record<PDF命令, string> = { extract: '提取页面', merge: '合并文件', delete: '删除页面', rotate: '旋转页面', insertBlank: '插入空白页', insertPages: '插入其他文件页面' }
export function 解析页码(文本: string): number[] {
  const 结果: number[] = []
  文本.split(',').forEach((片段) => {
    const 值 = 片段.trim()
    if (!值) return
    if (值.includes('-')) {
      const [起点, 终点] = 值.split('-').map(Number)
      if (Number.isInteger(起点) && Number.isInteger(终点) && 起点 <= 终点) for (let 页码 = 起点; 页码 <= 终点; 页码 += 1) 结果.push(页码)
    } else if (Number.isInteger(Number(值))) 结果.push(Number(值))
  })
  return [...new Set(结果)]
}
