// 演示文稿导出：生成含全部幻灯片的 HTML 预览页。

import { type 演示文稿 } from './deck'

/** 转义 HTML 特殊字符，避免文本框内容破坏导出页结构 */
function 转义Html(文本: string): string {
  return 文本.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 导出为 HTML 预览页；无幻灯片时返回空字符串 */
export function 导出为Html预览(文稿: 演示文稿, 标题: string): string {
  if (文稿.幻灯片列表.length === 0) {
    return ''
  }

  const 页列表 = 文稿.幻灯片列表
    .map((幻灯片, 索引) => {
      const 框列表 = 幻灯片.文本框列表
        .map(
          (框) =>
            `<div style="position:absolute;left:${框.x}px;top:${框.y}px;width:${框.width}px;` +
            `height:${框.height}px;font-size:${框.字号}px;color:${框.颜色};` +
            `font-weight:${框.加粗 ? 600 : 400};font-style:${框.斜体 ? 'italic' : 'normal'};` +
            `text-decoration:${框.下划线 ? 'underline' : 'none'};` +
            `text-align:${框.对齐}">${转义Html(框.text)}</div>`
        )
        .join('')
      return (
        `<section style="position:relative;width:960px;height:540px;margin:24px auto;` +
        `background:${幻灯片.背景色};border:1px solid #E8EBF0;overflow:hidden">` +
        `<span style="position:absolute;left:12px;top:8px;color:#8A92A6;font-size:12px">第 ${索引 + 1} 张</span>` +
        框列表 +
        '</section>'
      )
    })
    .join('')

  return (
    '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
    `<title>${转义Html(标题)}</title>\n</head>\n<body style="margin:0;background:#F5F7FA;font-family:\'Microsoft YaHei\',sans-serif">\n` +
    页列表 +
    '\n</body>\n</html>\n'
  )
}

/** 依据文稿名生成导出文件名 */
export function 生成演示文件名(文稿名: string, 扩展名: string): string {
  const 基准 = 文稿名.trim().length > 0 ? 文稿名.replace(/\.[^.]+$/, '').trim() : '演示文稿'
  return `${基准.length > 0 ? 基准 : '演示文稿'}.${扩展名}`
}
