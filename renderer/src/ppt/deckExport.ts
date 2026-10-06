// 演示文稿导出：生成含全部幻灯片的 HTML 预览页。

import { type 演示文稿 } from './deck'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SlideObjects, 背景样式, 页脚条目列表, type 图片地址表 } from './render/SlideObjects'
import { 读取有效页脚, 读取页面尺寸 } from './model/themes'
import { 解析页面背景 } from './model/masters'

/** 转义 HTML 特殊字符，避免文本框内容破坏导出页结构 */
function 转义Html(文本: string): string {
  return 文本.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 导出为 HTML 预览页；无幻灯片时返回空字符串 */
export function 导出为Html预览(文稿: 演示文稿, 标题: string, 图片地址: 图片地址表 = {}): string {
  if (文稿.幻灯片列表.length === 0) {
    return ''
  }

  const 页列表 = 文稿.幻灯片列表
    .map((幻灯片, 索引) => {
      for (const 对象 of 幻灯片.对象列表 ?? []) { if (对象.类型 === '图片' && !图片地址[对象.资源标识 ?? '']) throw new Error('预览导出缺少图片资源，请等待图片加载完成') }
      const 尺寸 = 读取页面尺寸(文稿)
      const 页脚 = 读取有效页脚(文稿, 幻灯片, 索引)
      const 背景 = 解析页面背景(文稿, 幻灯片)
      const 框列表 = renderToStaticMarkup(createElement(SlideObjects, { 幻灯片, 图片地址, 页脚, 页序号: 索引, 页面尺寸: 尺寸 }))
      const 背景样式值 = 背景样式(背景, 图片地址, 幻灯片.背景色)
      const 页脚列表 = 页脚条目列表(页脚, 索引, 尺寸)
      const 背景Css = 背景样式值.backgroundImage
        ? `background-image:${背景样式值.backgroundImage};background-size:cover;background-position:center;`
        : `background:${背景样式值.backgroundColor ?? 幻灯片.背景色};`
      return (
        `<section style="position:relative;width:${尺寸.宽}px;height:${尺寸.高}px;margin:24px auto;` +
        `${背景Css}border:1px solid #E8EBF0;overflow:hidden">` +
        `<span style="position:absolute;left:12px;top:8px;color:#8A92A6;font-size:12px">第 ${索引 + 1} 张</span>` +
        框列表 +
        页脚列表.map((项) => `<div style="position:absolute;left:${项.x}px;top:${项.y}px;width:${项.width}px;color:#5A6472;font-size:12px;text-align:${项.对齐}">${转义Html(项.文本)}</div>`).join('') +
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
