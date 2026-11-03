// PDF 关键词查找。
//
// 设计依据：PdfPageCanvas 已从 pdf.js 取得每页的文字项（文本 + 位置 + 尺寸），
// 因此查找不需要重新解析 PDF，只需在这些文字项上做匹配，并把命中位置换算成
// 页面内的百分比坐标，供高亮层定位。这样查找与渲染共用同一份文字数据，
// 不会出现「搜到了却高亮错位」的问题。

/** 与 PdfViewer 中 页面文字项 保持一致 */
export interface 搜索文字项 {
  文本: string
  x: number
  y: number
  宽: number
  高: number
}

/** 页面原始尺寸，用于把绝对坐标换成百分比 */
export interface 页面尺寸 {
  宽: number
  高: number
}

/** 一次命中 */
export interface 查找命中 {
  页码: number
  /** 命中文本片段（保留原文大小写） */
  片段: string
  /** 在整页拼接文本中的起始偏移，用于排序与去重 */
  偏移: number
  /** 相对页面宽高的百分比矩形，直接给高亮层用 */
  左: number
  上: number
  宽: number
  高: number
}

/**
 * 把一页的文字项按行拼接成可搜索文本，并保留每段文字在拼接串中的位置映射。
 *
 * 为什么不能直接用 textContent 拼接：pdf.js 会把一行拆成多个文字项，
 * 中文还常被拆到相邻项里。必须保留偏移映射，命中后才能回推是哪些文字项、
 * 落在页面什么位置。
 */
export function 拼接页面文本(项列表: 搜索文字项[]): {
  文本: string
  映射: Array<{ 起始: number; 结束: number; 项: 搜索文字项 }>
} {
  let 文本 = ''
  const 映射: Array<{ 起始: number; 结束: number; 项: 搜索文字项 }> = []
  for (const 项 of 项列表) {
    if (!项.文本) continue
    const 起始 = 文本.length
    文本 += 项.文本
    映射.push({ 起始, 结束: 文本.length, 项 })
  }
  return { 文本, 映射 }
}

/** 把关键词按空白拆词，空串返回空数组 */
function 拆词(关键词: string): string[] {
  return 关键词.trim().split(/\s+/).filter(Boolean)
}

/**
 * 在一页里查找关键词。
 * 规则：多个词之间按「顺序出现」匹配（等价于模糊的短语匹配），
 * 大小写不敏感，命中跨越多个文字项时按覆盖的文字项合并成一个矩形。
 */
export function 查找单页(
  页码: number,
  项列表: 搜索文字项[],
  关键词: string,
  尺寸: 页面尺寸 | undefined,
): 查找命中[] {
  const 词 = 拆词(关键词)
  if (词.length === 0 || !尺寸 || 尺寸.宽 <= 0 || 尺寸.高 <= 0) return []
  const { 文本, 映射 } = 拼接页面文本(项列表)
  if (文本.length === 0) return []
  const 小写文本 = 文本.toLocaleLowerCase()
  const 小写词 = 词.map((项) => 项.toLocaleLowerCase())

  const 命中: 查找命中[] = []
  let 游标 = 0
  while (游标 < 小写文本.length) {
    // 逐个词往后找，记下第一个词的起点与最后一个词的终点。
    // 「片段」必须只覆盖匹配到的区间，否则高亮会把整行都圈进去。
    let 位置 = 游标
    let 起点 = -1
    let 尾部 = -1
    for (const 词项 of 小写词) {
      const 找到 = 小写文本.indexOf(词项, 位置)
      if (找到 === -1) { 尾部 = -1; break }
      if (起点 === -1) 起点 = 找到
      位置 = 找到 + 词项.length
      尾部 = 位置
    }
    if (尾部 === -1) break
    const 起始 = 起点
    const 覆盖项 = 映射.filter((段) => 段.结束 > 起始 && 段.起始 < 尾部).map((段) => 段.项)
    if (覆盖项.length > 0) {
      const 左 = Math.min(...覆盖项.map((项) => 项.x))
      const 上 = Math.min(...覆盖项.map((项) => 项.y))
      const 右 = Math.max(...覆盖项.map((项) => 项.x + 项.宽))
      const 下 = Math.max(...覆盖项.map((项) => 项.y + 项.高))
      命中.push({
        页码,
        片段: 文本.slice(起始, 尾部),
        偏移: 起始,
        左: 左 / 尺寸.宽 * 100,
        上: 上 / 尺寸.高 * 100,
        宽: Math.max(0.2, (右 - 左) / 尺寸.宽 * 100),
        高: Math.max(0.2, (下 - 上) / 尺寸.高 * 100),
      })
    }
    // 从命中结尾继续，避免同一处重复计数
    游标 = Math.max(尾部, 起始 + 1)
  }
  return 命中
}

/** 在整个文档里查找，结果按页码与偏移排序 */
export function 查找文档(
  各页: Array<{ 页码: number; 项列表: 搜索文字项[]; 尺寸?: 页面尺寸 }>,
  关键词: string,
): 查找命中[] {
  const 结果: 查找命中[] = []
  for (const 页 of 各页) 结果.push(...查找单页(页.页码, 页.项列表, 关键词, 页.尺寸))
  return 结果.sort((甲, 乙) => 甲.页码 - 乙.页码 || 甲.偏移 - 乙.偏移)
}

/** 循环取下一个命中下标；无命中返回 -1 */
export function 下一个命中下标(当前: number, 总数: number, 方向: '下一个' | '上一个'): number {
  if (总数 <= 0) return -1
  if (方向 === '下一个') return (当前 + 1 + 总数) % 总数
  return (当前 - 1 + 总数) % 总数
}
