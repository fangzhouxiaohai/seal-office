// 导出文档生成：编辑区、图片、PDF、扫描件与讲义共用同一套幻灯片渲染。
// 每个导出页是一个固定尺寸的 <section>，主进程按该尺寸逐页栅格化或打印。
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { 演示文稿, 幻灯片 } from '../deck'
import { SlideObjects, type 图片地址表 } from '../render/SlideObjects'
import { 默认导出选项, 规划导出页, type 导出选项 } from '../model/exportPlan'
import { 默认页面尺寸, type 页面尺寸 } from '../model/pageSize'
import { 默认备注设置, 默认讲义设置, 格式化日期, 读取讲义占位符, 讲义网格, type 备注设置, type 讲义设置 } from '../model/handout'

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

/** 讲义与备注的母版装饰：页眉、页脚、日期与页码，占位符按当前页码替换 */
function 母版装饰(设置: { 页眉: string; 页脚: string; 显示日期: boolean; 显示页码: boolean }, 页码: number): string {
  const 日期 = 设置.显示日期 ? `<span class="seal-export-date">${格式化日期(new Date())}</span>` : ''
  const 页码文本 = 设置.显示页码 ? `<span class="seal-export-number">第 ${页码} 页</span>` : ''
  const 页眉 = 读取讲义占位符(设置.页眉, 页码)
  const 页脚 = 读取讲义占位符(设置.页脚, 页码)
  const 通用 = `position:absolute;left:16px;right:16px;display:flex;gap:8px;font-family:'Microsoft YaHei','PingFang SC',Arial,sans-serif;font-size:12px;color:#5A6473`
  const 上 = 页眉 || 日期
    ? `<div class="seal-export-header" style="${通用};top:6px;justify-content:flex-start">${页眉 ? `<span>${转义(页眉)}</span>` : ''}${日期}</div>`
    : ''
  const 下 = 页脚 || 页码文本
    ? `<div class="seal-export-footer" style="${通用};bottom:6px;justify-content:space-between">${页脚 ? `<span>${转义(页脚)}</span>` : '<span></span>'}${页码文本}</div>`
    : ''
  return 上 + 下
}

/** 备注页/仅备注排版：按备注母版设置渲染缩略图与备注文本 */
function 备注块(页: 幻灯片, 尺寸: 页面尺寸, 只备注: boolean, 装饰高: number): string {
  const 备注 = (页.备注 ?? '').trim()
  const 缩放 = 只备注 ? 0 : 0.7
  const 顶部 = 只备注 ? 装饰高 : Math.round((尺寸.高 - 装饰高 * 2) * 缩放) + 装饰高 + 8
  const 备注高 = Math.max(48, 尺寸.高 - 顶部 - 装饰高 - 8)
  return (
    `<div class="seal-export-notes" style="position:absolute;left:0;top:${顶部}px;` +
    `width:${尺寸.宽}px;height:${备注高}px;box-sizing:border-box;padding:8px 12px;border-top:1px solid #C9CFDA;` +
    `font-family:'Microsoft YaHei','PingFang SC',Arial,sans-serif;font-size:14px;line-height:1.5;color:#1A1D24;white-space:pre-wrap;overflow:hidden">` +
    `备注：${转义(备注.length > 0 ? 备注 : '（本页无备注）')}</div>`
  )
}

function 页面集合(文稿: 演示文稿, 选项: 导出选项, 图片地址: 图片地址表, 尺寸: 页面尺寸): string {
  const 导出页 = 规划导出页(文稿, 选项)
  const 扫描样式 = 选项.格式 === '扫描件PDF' ? 'filter:grayscale(1) contrast(1.06) brightness(1.02);' : ''
  const 讲义设置: 讲义设置 | null = 选项.格式 === 'PDF' && 选项.讲义每页张数 > 1
    ? { ...默认讲义设置, ...(选项.讲义设置 ?? {}), 每页张数: 选项.讲义每页张数 }
    : null
  const 装饰高 = 22

  if (讲义设置) {
    const { 列数, 行数 } = 讲义网格(讲义设置.每页张数)
    const 单元宽 = Math.floor(尺寸.宽 / 列数)
    const 单元高 = Math.floor((尺寸.高 - 装饰高 * 2) / 行数)
    const 缩放 = Math.min(单元宽 / 尺寸.宽, 单元高 / 尺寸.高) * 0.94
    const 页面列表: string[] = []
    for (let 起点 = 0, 页号 = 1; 起点 < 导出页.length; 起点 += 讲义设置.每页张数, 页号 += 1) {
      const 本页 = 导出页.slice(起点, 起点 + 讲义设置.每页张数)
      const 内容 = 本页.map((项, i) => {
        const 列 = i % 列数
        const 行 = Math.floor(i / 列数)
        const 内宽 = 尺寸.宽 * 缩放
        const 内高 = 尺寸.高 * 缩放
        return 幻灯片块(项.页, 项.序号, 图片地址, 尺寸, {
          缩放,
          左: Math.round(列 * 单元宽 + (单元宽 - 内宽) / 2),
          上: Math.round(装饰高 + 行 * 单元高 + (单元高 - 内高) / 2),
        })
      }).join('')
      页面列表.push(
        `<section class="seal-export-page" data-讲义张数="${讲义设置.每页张数}" data-页数="${页号}" style="position:relative;` +
        `width:${尺寸.宽}px;height:${尺寸.高}px;overflow:hidden;background:#FFFFFF;${扫描样式}">` +
        `${母版装饰(讲义设置, 页号)}${内容}</section>`
      )
    }
    return 页面列表.join('')
  }

  return 导出页.map((项, i) => {
    const 页号 = i + 1
    if (选项.输出备注) {
      const 设置: 备注设置 = { ...默认备注设置, ...(选项.备注设置 ?? {}) }
      const 只备注 = 设置.排版 === '仅备注'
      const 正文 = 只备注 ? '' : 幻灯片块(项.页, 项.序号, 图片地址, 尺寸, { 缩放: 0.7, 上: 装饰高 })
      return (
        `<section class="seal-export-page" data-页序号="${项.序号}" data-页数="${页号}" style="position:relative;` +
        `width:${尺寸.宽}px;height:${尺寸.高}px;overflow:hidden;background:#FFFFFF;${扫描样式}">` +
        `${母版装饰(设置, 页号)}${正文}${备注块(项.页, 尺寸, 只备注, 装饰高)}</section>`
      )
    }
    const 正文 = 幻灯片块(项.页, 项.序号, 图片地址, 尺寸, {})
    return (
      `<section class="seal-export-page" data-页序号="${项.序号}" data-页数="${页号}" style="position:relative;` +
      `width:${尺寸.宽}px;height:${尺寸.高}px;overflow:hidden;background:#FFFFFF;${扫描样式}">${正文}</section>`
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
