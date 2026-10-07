// 表格编辑器的选区浮窗与右键菜单共用的动作定义。
// 本地动作走表格既有命令表，颜色/对齐等带参数动作直接用命令 id；AI 动作交给助手对话。
import type { 浮窗按钮 } from '../components/SelectionFloatPanel'
import type { 菜单节点 } from '../components/ContextMenu'
import { 构建AI按钮, 通用AI指令, 交给助手 } from '../assistant/quickActions'

export const 表格填充颜色 = [
  { 名称: '黄色', 值: '#FFF176' },
  { 名称: '绿色', 值: '#A5D6A7' },
  { 名称: '蓝色', 值: '#90CAF9' },
  { 名称: '浅灰', 值: '#ECEFF1' },
  { 名称: '无填充', 值: 'transparent' },
]

export const 表格字体颜色 = [
  { 名称: '黑色', 值: '#1A1D24' },
  { 名称: '红色', 值: '#E34D59' },
  { 名称: '绿色', 值: '#2E9E5B' },
  { 名称: '蓝色', 值: '#2B6CF6' },
]

export interface 表格浮窗依赖 {
  /** 执行表格命令表里的命令 */
  执行命令: (标识: string) => void
  /** 取当前选区文本，用于 AI 快捷动作 */
  取选区文本: () => string
  /** 选区内是否已有内容，用于决定浮窗是否出现 */
  选区有内容: boolean
}

/** 表格选区浮窗：编辑 + 字体与填充 + 对齐与合并 + 数据 + AI 快捷动作 */
export function 构建表格浮窗按钮(依赖: 表格浮窗依赖): 浮窗按钮[] {
  const 本地: 浮窗按钮[] = [
    { id: 'clipboard.copy', 标签: '复制', 图标: 'copy', 分组: 0, 执行: () => 依赖.执行命令('clipboard.copy') },
    { id: 'clipboard.cut', 标签: '剪切', 图标: 'cut', 分组: 0, 执行: () => 依赖.执行命令('clipboard.cut') },
    { id: 'cell.bold', 标签: '加粗', 图标: 'bold', 分组: 10, 执行: () => 依赖.执行命令('cell.bold') },
    { id: 'cell.italic', 标签: '斜体', 图标: 'italic', 分组: 10, 执行: () => 依赖.执行命令('cell.italic') },
    { id: 'cell.underline', 标签: '下划线', 图标: 'underline', 分组: 10, 执行: () => 依赖.执行命令('cell.underline') },
    { id: 'cell.fontColor', 标签: '字体颜色（红色）', 图标: 'color', 分组: 20, 执行: () => 依赖.执行命令(`__cellcolor__:${表格字体颜色[1].值}`) },
    { id: 'cell.fill', 标签: '填充（黄色）', 图标: 'fill', 分组: 20, 执行: () => 依赖.执行命令(`__cellfill__:${表格填充颜色[0].值}`) },
    { id: 'cell.alignLeft', 标签: '左对齐', 图标: 'align-left', 分组: 30, 执行: () => 依赖.执行命令('cell.alignLeft') },
    { id: 'cell.alignCenter', 标签: '居中', 图标: 'align-center', 分组: 30, 执行: () => 依赖.执行命令('cell.alignCenter') },
    { id: 'cell.alignRight', 标签: '右对齐', 图标: 'align-right', 分组: 30, 执行: () => 依赖.执行命令('cell.alignRight') },
    { id: 'cell.mergeCenter', 标签: '合并居中', 图标: 'merge', 分组: 40, 执行: () => 依赖.执行命令('cell.mergeCenter') },
    { id: 'cell.wrap', 标签: '自动换行', 图标: 'wrap', 分组: 40, 执行: () => 依赖.执行命令('cell.wrap') },
    { id: 'edit.sum', 标签: '求和', 图标: 'sum', 分组: 50, 执行: () => 依赖.执行命令('edit.sum') },
    { id: 'edit.clear', 标签: '清除内容', 图标: 'clear', 分组: 50, 执行: () => 依赖.执行命令('edit.clear') },
  ]
  return [...本地, ...构建AI按钮(依赖.取选区文本)]
}

/** 右键菜单里的填充与字体颜色分组 */
export function 构建表格颜色菜单组(): 菜单节点[] {
  return [
    {
      type: 'group', 标题: '填充颜色', 子项: 表格填充颜色.map((项) => ({
        type: 'item' as const, commandId: `__cellfill__:${项.值}`, label: 项.名称,
      })),
    },
    {
      type: 'group', 标题: '字体颜色', 子项: 表格字体颜色.map((项) => ({
        type: 'item' as const, commandId: `__cellcolor__:${项.值}`, label: 项.名称,
      })),
    },
  ]
}

/** 右键菜单里的数据操作与 AI 快捷动作 */
export function 构建表格数据菜单组(): 菜单节点[] {
  return [
    {
      type: 'group', 标题: '数据', 子项: [
        { type: 'item', commandId: 'edit.sum', label: '自动求和' },
        { type: 'item', commandId: 'edit.clear', label: '清除内容' },
        { type: 'divider' },
        { type: 'item', commandId: 'data.sortAsc', label: '升序排序' },
        { type: 'item', commandId: 'data.sortDesc', label: '降序排序' },
        { type: 'item', commandId: 'data.filter', label: '筛选' },
        { type: 'item', commandId: 'data.removeDuplicates', label: '删除重复项' },
      ],
    },
    { type: 'divider' },
    ...通用AI指令.map((指令) => ({ type: 'item' as const, commandId: `__ai__:${指令.id}`, label: `AI ${指令.标签}` })),
  ]
}

/** 颜色菜单命令解析：命中返回 true */
export function 处理表格颜色命令(命令标识: string, 执行命令: (标识: string, 参数?: string) => void): boolean {
  if (命令标识.startsWith('__cellfill__:')) {
    执行命令('cell.fill', 命令标识.slice('__cellfill__:'.length))
    return true
  }
  if (命令标识.startsWith('__cellcolor__:')) {
    执行命令('cell.fontColor', 命令标识.slice('__cellcolor__:'.length))
    return true
  }
  return false
}

/** AI 菜单命令解析：命中返回 true */
export function 处理表格AI命令(命令标识: string, 取选区文本: () => string): boolean {
  if (!命令标识.startsWith('__ai__:')) return false
  const 指令 = 通用AI指令.find((项) => 项.id === 命令标识.slice('__ai__:'.length))
  if (指令) 交给助手(指令, 取选区文本())
  return true
}
