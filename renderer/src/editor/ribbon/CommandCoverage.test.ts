import { expect, it } from 'vitest'
import { RIBBON_TABS } from './tabSpecs'
import { 命令表 } from '../commands'
import { 演示标签 } from '../../ppt/ribbonSpecs'
import { 演示命令表 } from '../../ppt/pptCommands'

const 文字编辑器直接处理 = new Set(['file.print'])
const 演示编辑器直接处理 = new Set([
  'file.open', 'file.save', 'file.saveAs', 'file.print', 'file.exportDialog', 'file.exportHtml',
  'insert.picture', 'insert.formula', 'insert.symbol', 'insert.attachment', 'insert.media',
  'insert.generate', 'insert.assets', 'design.beautify', 'slideshow.narrate',
  'review.translate', 'review.proofread', 'view.gridlines', 'view.zoomIn', 'view.zoomOut', 'view.zoomReset',
])

it('文字编辑器每个功能区入口都有实际命令', () => {
  const 未接通 = RIBBON_TABS.flatMap((标签) => 标签.groups.flatMap((组) => 组.items))
    .filter((按钮) => !命令表[按钮.commandId] && !文字编辑器直接处理.has(按钮.commandId))
    .map((按钮) => `${按钮.label}：${按钮.commandId}`)
  expect(未接通).toEqual([])
})

it('文字功能区不展示当前无法完整保存为文档格式的编辑入口', () => {
  const 可见 = new Set(RIBBON_TABS.flatMap((标签) => 标签.groups.flatMap((组) => 组.items.map((按钮) => 按钮.commandId))))
  for (const 命令 of ['chart.insert', 'smartart.insert', 'formula.insert', 'shape.insert', 'textbox.insert', 'wordart.insert', 'layout.watermark', 'layout.dropCap', 'toc.insert', 'toc.update']) {
    expect(可见.has(命令), 命令).toBe(false)
  }
})

it('演示编辑器每个功能区入口都有实际命令', () => {
  const 未接通 = 演示标签.flatMap((标签) => 标签.groups.flatMap((组) => 组.items))
    .filter((按钮) => !演示命令表[按钮.commandId] && !演示编辑器直接处理.has(按钮.commandId))
    .map((按钮) => `${按钮.label}：${按钮.commandId}`)
  expect(未接通).toEqual([])
})
