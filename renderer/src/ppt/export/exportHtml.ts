// 导出文档生成：编辑区、图片、PDF、扫描件与讲义共用同一套幻灯片渲染。
// 每个导出页是一个固定尺寸的 <section>，主进程按该尺寸逐页栅格化或打印。
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { 演示文稿, 幻灯片 } from '../deck'
import { SlideObjects, type 图片地址表 } from '../render/SlideObjects'
import { 默认导出选项, 规划导出页, type 导出选项 } from '../model/exportPlan'
import { 默认页面尺寸, type 页面尺寸 } from '../model/pageSize'

/** 转义 HTML 特殊字符，避免文本内容破坏导出结构 */
function 转义(文本: string): string {
  return 文本.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function 幻灯片内容(页: 幻灯片, 图片地址: 图片地址表): string {
  for (const 对象 of 页.对象列表 ?? []) {
    if (对象.类型 === '图片' && !图片地址[对象.资源标识 ?? '']) throw new Error('导出缺少图片资源，请等待图片加载完成')
  }
  return renderToStaticMarkup(createElement(SlideObjects, { 幻灯片: 页, 图片地址 }))
}

/** 单张幻灯片绝对定位块；缩放用于讲义与备注排版 */
function 幻灯片块(页: 幻灯片, 序号: number, 图片地址: 图片地址表, 尺寸: 页面尺寸, 排版: { 缩放?: number; 左?: number; 上?: number } = {}): string {
  const 缩放 = 排版.缩放 ?? 1
  const 左 = 排版.左 ?? 0
  const 上 = 排版.上 ?? 0
  return (
    `<div class="seal-export-slide" data-页序号="${序号}" style="position:absolute;left:${左}px;top:${上}px;` +
    `width:${尺寸.宽}px;height:${尺寸.高}px;background:${页.背景色};overflow:hidden;` +
    `transform:scale(${缩放});transform-origin:top left">${幻灯片内容(页, 图片地址)}</div>`
  )
}

function 备注块(页: 幻灯片, 尺寸: 页面尺寸, 缩放: number): string {
  const 备注 = (页.备注 ?? '').trim()
  const 备注高 = Math.max(48, 尺寸.高 - Math.round(尺寸.高 * 缩放) - 16)
  return (
    `<div class="seal-export-notes" style="position:absolute;left:0;top:${Math.round(尺寸.高 * 缩放) + 8}px;` +
    `width:${尺寸.宽}px;height:${备注高}px;box-sizing:border-box;padding:8px 12px;border-top:1px solid #C9CFDA;` +
    `font-family:'Microsoft YaHei','PingFang SC',Arial,sans-serif;font-size:14px;line-height:1.5;color:#1A1D24;white-space:pre-wrap;overflow:hidden">` +
    `备注：${转义(备注.length > 0 ? 备注 : '（本页无备注）')}</div>`
  )
}

/** 讲义排版：每页张数与网格位置，2 张为两行，3 张为三行，6 张为两列三行 */
function 讲义网格(张数: number): { 列数: number; 行数: number } {
  if (张数 === 2) return { 列数: 1, 行数: 2 }
  if (张数 === 3) return { 列数: 1, 行数: 3 }
  if (张数 === 6) return { 列数: 2, 行数: 3 }
  return { 列数: 1, 行数: 1 }
}

function 页面集合(文稿: 演示文稿, 选项: 导出选项, 图片地址: 图片地址表, 尺寸: 页面尺寸): string {
  const 导出页 = 规划导出页(文稿, 选项)
  const 扫描样式 = 选项.格式 === '扫描件PDF' ? 'filter:grayscale(1) contrast(1.06) brightness(1.02);' : ''
  const 讲义张数 = 选项.格式 === 'PDF' && 选项.讲义每页张数 > 1 ? 选项.讲义每页张数 : 0

  if (讲义张数 > 0) {
    const { 列数, 行数 } = 讲义网格(讲义张数)
    const 单元宽 = Math.floor(尺寸.宽 / 列数)
    const 单元高 = Math.floor(尺寸.高 / 行数)
    const 缩放 = Math.min(单元宽 / 尺寸.宽, 单元高 / 尺寸.高) * 0.94
    const 页面列表: string[] = []
    for (let 起点 = 0; 起点 < 导出页.length; 起点 += 讲义张数) {
      const 本页 = 导出页.slice(起点, 起点 + 讲义张数)
      const 内容 = 本页.map((项, i) => {
        const 列 = i % 列数
        const 行 = Math.floor(i / 列数)
        const 内宽 = 尺寸.宽 * 缩放
        const 内高 = 尺寸.高 * 缩放
        return 幻灯片块(项.页, 项.序号, 图片地址, 尺寸, {
          缩放,
          左: Math.round(列 * 单元宽 + (单元宽 - 内宽) / 2),
          上: Math.round(行 * 单元高 + (单元高 - 内高) / 2),
        })
      }).join('')
      页面列表.push(
        `<section class="seal-export-page" data-讲义张数="${讲义张数}" style="position:relative;` +
        `width:${尺寸.宽}px;height:${尺寸.高}px;overflow:hidden;background:#FFFFFF;${扫描样式}">${内容}</section>`
      )
    }
    return 页面列表.join('')
  }

  return 导出页.map(项 => {
    const 备注 = 选项.输出备注 ? 备注块(项.页, 尺寸, 0.7) : ''
    const 正文 = 幻灯片块(项.页, 项.序号, 图片地址, 尺寸, 选项.输出备注 ? { 缩放: 0.7 } : {})
    return (
      `<section class="seal-export-page" data-页序号="${项.序号}" style="position:relative;` +
      `width:${尺寸.宽}px;height:${尺寸.高}px;overflow:hidden;background:#FFFFFF;${扫描样式}">${正文}${备注}</section>`
    )
  }).join('')
}

function 组装文档(标题: string, 内容: string, 尺寸: 页面尺寸): string {
  return (
    '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
    `<title>${转义(标题)}</title>\n` +
    `<style>@page { size: ${尺寸.宽}px ${尺寸.高}px; margin: 0; }\n` +
    `html,body{margin:0;padding:0;background:#FFFFFF;}\n` +
    `.seal-export-page{page-break-after:always;break-after:page;}\n` +
    `.seal-export-page:last-child{page-break-after:auto;break-after:auto;}\n` +
    '</style>\n</head>\n<body>\n' +
    内容 +
    '\n</body>\n</html>\n'
  )
}

/** 生成导出文档；每个导出页一个固定尺寸区块，供栅格化与打印共用 */
export function 生成导出Html(文稿: 演示文稿, 选项: 导出选项, 图片地址: 图片地址表 = {}, 尺寸: 页面尺寸 = 默认页面尺寸, 标题?: string): string {
  if (文稿.幻灯片列表.length === 0) return ''
  return 组装文档(标题 ?? 文稿.name, 页面集合(文稿, 选项, 图片地址, 尺寸), 尺寸)
}

/** 与 生成导出Html 同一实现，供 HTML 导出入口使用 */
export function 导出为Html文档(文稿: 演示文稿, 选项: 导出选项, 图片地址: 图片地址表 = {}, 尺寸: 页面尺寸 = 默认页面尺寸, 标题?: string): string {
  return 生成导出Html(文稿, 选项, 图片地址, 尺寸, 标题)
}

/** 旧版网页预览入口：导出全部页面（含隐藏页），保持既有行为 */
export function 导出为Html预览(文稿: 演示文稿, 标题: string, 图片地址: 图片地址表 = {}): string {
  if (文稿.幻灯片列表.length === 0) return ''
  return 生成导出Html(文稿, { ...默认导出选项, 含隐藏页: true }, 图片地址, 默认页面尺寸, 标题)
}
