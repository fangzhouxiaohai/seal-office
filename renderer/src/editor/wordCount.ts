// 字数统计：中文按字、连续西文按词统计，标点与空白不计入。
// 供编辑器状态栏实时展示，按文档中的可见文字计数。

export interface WordCountResult {
  /** 不含空白与标点的字符数 */
  字符数: number
  /** 中文按字、连续西文按词统计后的合计 */
  词数: number
  段落数: number
}

const 中日韩字符 = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/
const 西文字符 = /[A-Za-z0-9]/
const 有效字符 = /[\u4e00-\u9fff\u3400-\u4dbfA-Za-z0-9]/

export function countWords(文本: string): WordCountResult {
  if (文本.length === 0) {
    return { 字符数: 0, 词数: 0, 段落数: 0 }
  }

  let 字符数 = 0
  let 词数 = 0
  let 处于西文词中 = false

  for (const 单字 of 文本) {
    if (中日韩字符.test(单字)) {
      字符数 += 1
      词数 += 1
      处于西文词中 = false
      continue
    }
    if (西文字符.test(单字)) {
      字符数 += 1
      if (!处于西文词中) {
        词数 += 1
        处于西文词中 = true
      }
      continue
    }
    处于西文词中 = false
  }

  // 段落以含有效字符为准，纯标点或被空行分隔的空白段不计入
  const 段落数 = 文本.split(/\n+/).filter((段) => 有效字符.test(段)).length

  return { 字符数, 词数, 段落数 }
}
