import { 创建工作表, 重算工作表, type Sheet } from '../sheet/model'
import { 生成地址 } from '../sheet/address'
import { 创建演示文稿, 创建幻灯片, 创建文本框, type 演示文稿 } from '../ppt/deck'

export type 创建文件 = { 种类: '创建文件'; 类型: 'word' | 'table' | 'ppt'; 名称: string; 内容: string }
export type 新文件候选 = { 类型: 创建文件['类型']; 名称: string; 内容: string | Sheet[] | 演示文稿 }

/** 只创建编辑区草稿。模型不得指定磁盘路径、脚本或原始 HTML。 */
export function 校验创建文件(输入: Record<string, unknown>): 创建文件 {
  if (!['word', 'table', 'ppt'].includes(String(输入.类型))) throw new Error('新文件类型必须是 word、table 或 ppt')
  const 类型 = 输入.类型 as 创建文件['类型']
  if (typeof 输入.名称 !== 'string' || !输入.名称.trim() || 输入.名称.length > 120 || /[\\/:*?"<>|\x00-\x1f]/.test(输入.名称) || /[. ]$/.test(输入.名称) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(输入.名称.trim())) throw new Error('新文件名称无效，请使用不含路径的文件名')
  if (typeof 输入.内容 !== 'string' || !输入.内容.trim() || 输入.内容.length > 200000) throw new Error('新文件内容为空或过长')
  const 扩展名 = { word: 'docx', table: 'xlsx', ppt: 'pptx' }[类型]
  const 名称 = 输入.名称.trim()
  if (/\.[a-z0-9]{2,5}$/i.test(名称) && !名称.toLowerCase().endsWith(`.${扩展名}`)) throw new Error('文件名扩展名与新文件类型不一致')
  return { 种类: '创建文件', 类型, 名称: 名称.toLowerCase().endsWith(`.${扩展名}`) ? 名称 : `${名称}.${扩展名}`, 内容: 输入.内容 }
}

function 文本(值: unknown, 字段: string): string {
  if (typeof 值 !== 'string' || 值.length > 12000) throw new Error(`${字段}必须是长度不超过12000的文本`)
  return 值
}

/** 与演示文字的字体、内边距及行高一致；不可读的长页退回模型拆页。 */
function 适应字号(内容: string, 宽: number, 高: number, 起始: number, 最小: number, 加粗 = false): number {
  const 测量 = document.createElement('div')
  Object.assign(测量.style, { position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden', pointerEvents: 'none', width: `${宽}px`, height: `${高}px`, boxSizing: 'border-box', padding: '4px 6px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'normal', lineHeight: '1.35', fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif', fontWeight: 加粗 ? '600' : '400' })
  测量.textContent = 内容
  document.body.appendChild(测量)
  try {
    for (let 字号 = 起始; 字号 >= 最小; 字号--) {
      测量.style.fontSize = `${字号}px`
      if (测量.clientHeight ? 测量.scrollHeight <= 测量.clientHeight : 内容.split('\n').reduce((行数, 行) => 行数 + Math.max(1, Math.ceil(Array.from(行).reduce((长, 字) => 长 + (/^[\x00-\x7f]$/.test(字) ? .65 : 1.1), 0) * 字号 / (宽 - 12))), 0) * 字号 * 1.35 <= 高 - 8) return 字号
    }
    throw new Error('幻灯片内容在可读字号下放不下，请拆成更多页并保留全部内容')
  } finally { 测量.remove() }
}

export function 构建新文件(指令: 创建文件): 新文件候选 {
  const 项 = 校验创建文件(指令)
  if (项.类型 === 'word') {
    const 根 = document.createElement('div')
    项.内容.split(/\r?\n/).forEach((行) => { const 段 = document.createElement('p'); 段.textContent = 行; 根.appendChild(段) })
    return { 类型: 项.类型, 名称: 项.名称, 内容: 根.innerHTML }
  }
  let 数据: unknown
  try { 数据 = JSON.parse(项.内容) } catch { throw new Error('表格或演示的新文件内容必须是有效 JSON 数组') }
  if (!Array.isArray(数据) || !数据.length) throw new Error('新文件内容必须包含工作表或幻灯片')
  if (项.类型 === 'table') {
    if (数据.length > 20) throw new Error('一次最多创建20张工作表')
    const 名称集合 = new Set<string>()
    let 总单元格 = 0
    const 表 = 数据.map((原) => {
      if (!原 || typeof 原 !== 'object' || typeof 原.名称 !== 'string' || !原.名称.trim() || 原.名称.length > 31 || /[\\/*?:\[\]]/.test(原.名称) || /^'|'$/.test(原.名称) || 名称集合.has(原.名称.toLowerCase())) throw new Error('工作表名称无效或重复')
      名称集合.add(原.名称.toLowerCase())
      if (!Array.isArray(原.行) || !原.行.length || 原.行.length > 1000 || 原.行.some((行: unknown) => !Array.isArray(行) || !行.length || 行.length > 100)) throw new Error('工作表行列内容无效（最多1000行、100列）')
      const 列数 = Math.max(...原.行.map((行: unknown[]) => 行.length))
      总单元格 += 原.行.length * 列数
      if (总单元格 > 20000) throw new Error('一次新建的总单元格不能超过20000个')
      const 工作表 = 创建工作表(原.名称, Math.max(100, 原.行.length), Math.max(26, 列数))
      原.行.forEach((行: unknown[], 行号: number) => 行.forEach((值, 列号) => {
        const 原始值 = 文本(值, '单元格内容')
        if (原始值) 工作表.单元格[生成地址(行号, 列号)] = { 原始值, 显示值: 原始值, 格式: 行号 === 0 ? { 加粗: true, 填充颜色: '#E8F0FF', 字体颜色: '#2357D9' } : {} }
      }))
      return 重算工作表(工作表)
    })
    return { 类型: 项.类型, 名称: 项.名称, 内容: 表 }
  }
  if (数据.length > 60) throw new Error('一次最多创建60张幻灯片')
  const 文稿 = 创建演示文稿(项.名称)
  文稿.幻灯片列表 = 数据.map((原) => {
    if (!原 || typeof 原 !== 'object' || !Array.isArray(原.要点) || 原.要点.length > 12) throw new Error('幻灯片内容必须包含标题和不超过12条要点')
    const 标题 = 文本(原.标题, '幻灯片标题')
    if (!标题.trim() || 标题.length > 120) throw new Error('幻灯片标题不能为空或超过120字')
    const 要点: string[] = 原.要点.map((值: unknown) => 文本(值, '幻灯片要点'))
    if (要点.join('').length > 1600) throw new Error('单页文字过多，请拆成多页')
    const 页 = 创建幻灯片('空白', 标题)
    const 正文 = 要点.map((点) => `• ${点}`).join('\n')
    页.背景色 = '#F2F6FF'
    页.文本框列表 = [
      { ...创建文本框(60, 38, 840, 90, 标题, 适应字号(标题, 840, 90, 34, 18, true)), 加粗: true, 颜色: '#2357D9' },
      创建文本框(70, 150, 820, 340, 正文, 适应字号(正文, 820, 340, 要点.length > 6 ? 20 : 26, 14)),
    ]
    return 页
  })
  return { 类型: 项.类型, 名称: 项.名称, 内容: 文稿 }
}
