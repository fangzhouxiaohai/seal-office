// 文字编辑器的选区浮窗与右键菜单共用的动作定义。
// 本地动作直接调用编辑器既有的格式化/命令入口，AI 动作交给助手对话（预览确认后应用）。
import type { 浮窗按钮 } from '../components/SelectionFloatPanel'
import type { 菜单节点 } from '../components/ContextMenu'
import { 构建AI按钮, 通用AI指令, 交给助手 } from '../assistant/quickActions'

export const 突出显示颜色 = [
  { 名称: '黄色', 值: '#FFF176' },
  { 名称: '绿色', 值: '#A5D6A7' },
  { 名称: '蓝色', 值: '#90CAF9' },
  { 名称: '粉色', 值: '#F8BBD0' },
  { 名称: '无', 值: 'transparent' },
]

export const 字体颜色 = [
  { 名称: '黑色', 值: '#1A1D24' },
  { 名称: '红色', 值: '#E34D59' },
  { 名称: '橙色', 值: '#F2994A' },
  { 名称: '绿色', 值: '#2E9E5B' },
  { 名称: '蓝色', 值: '#2B6CF6' },
  { 名称: '紫色', 值: '#8E5BF6' },
]

export interface 文字浮窗依赖 {
  /** 执行命令表中的命令 */
  执行命令: (标识: string) => void
  /** 执行浏览器格式化指令（bold、hiliteColor、removeFormat 等） */
  执行格式化: (指令: string, 值?: string) => void
  /** 取当前选区文本，用于 AI 快捷动作 */
  取选区文本: () => string
  /** 当前选区文字的格式状态，用于把已生效的按钮标成“取消…” */
  读取格式?: () => { 加粗?: boolean; 斜体?: boolean; 下划线?: boolean; 删除线?: boolean }
}

/** 选区浮窗：编辑类 + 字体格式 + 段落 + 常用颜色 + AI 快捷动作 */
export function 构建文字浮窗按钮(依赖: 文字浮窗依赖): 浮窗按钮[] {
  const 格式 = 依赖.读取格式?.() ?? {}
  const 本地: 浮窗按钮[] = [
    { id: 'clipboard.copy', 标签: '复制', 图标: 'copy', 分组: 0, 执行: () => 依赖.执行命令('clipboard.copy') },
    { id: 'clipboard.cut', 标签: '剪切', 图标: 'cut', 分组: 0, 执行: () => 依赖.执行命令('clipboard.cut') },
    { id: 'clipboard.formatPainter', 标签: '格式刷', 图标: 'brush', 分组: 0, 执行: () => 依赖.执行命令('clipboard.formatPainter') },
    { id: 'font.bold', 标签: 格式.加粗 ? '取消加粗' : '加粗', 图标: 'bold', 分组: 10, 执行: () => 依赖.执行格式化('bold') },
    { id: 'font.italic', 标签: 格式.斜体 ? '取消斜体' : '斜体', 图标: 'italic', 分组: 10, 执行: () => 依赖.执行格式化('italic') },
    { id: 'font.underline', 标签: 格式.下划线 ? '取消下划线' : '下划线', 图标: 'underline', 分组: 10, 执行: () => 依赖.执行格式化('underline') },
    { id: 'font.strike', 标签: 格式.删除线 ? '取消删除线' : '删除线', 图标: 'strike', 分组: 10, 执行: () => 依赖.执行格式化('strikeThrough') },
    // 面板只放最常用的一种，完整调色板在右键菜单与功能区
    { id: 'font.highlight', 标签: '突出显示（黄色）', 图标: 'highlight', 分组: 20, 执行: () => 依赖.执行格式化('hiliteColor', 突出显示颜色[0].值) },
    { id: 'font.color', 标签: '字体颜色（红色）', 图标: 'color', 分组: 20, 执行: () => 依赖.执行格式化('foreColor', 字体颜色[1].值) },
    { id: 'font.clear', 标签: '清除格式', 图标: 'clear', 分组: 20, 执行: () => 依赖.执行格式化('removeFormat') },
    { id: 'para.bullet', 标签: '项目符号', 图标: 'list', 分组: 30, 执行: () => 依赖.执行命令('para.bullet') },
    { id: 'para.number', 标签: '编号', 图标: 'number-list', 分组: 30, 执行: () => 依赖.执行命令('para.number') },
  ]
  return [...本地, ...构建AI按钮(依赖.取选区文本)]
}

/** 右键菜单里的颜色分组：完整调色板，点一下作用于当前选区 */
export function 构建颜色菜单组(): 菜单节点[] {
  return [
    {
      type: 'group', 标题: '突出显示', 子项: 突出显示颜色.map((项) => ({
        type: 'item' as const, commandId: `__highlight__:${项.值}`, label: 项.名称,
      })),
    },
    {
      type: 'group', 标题: '字体颜色', 子项: 字体颜色.map((项) => ({
        type: 'item' as const, commandId: `__color__:${项.值}`, label: 项.名称,
      })),
    },
  ]
}

/** 右键菜单里的 AI 快捷动作 */
export function 构建AI菜单组(): 菜单节点[] {
  return 通用AI指令.map((指令) => ({
    type: 'item' as const,
    commandId: `__ai__:${指令.id}`,
    label: `AI ${指令.标签}`,
  }))
}

/** 统一的 AI 菜单命令解析：命中返回 true */
export function 处理AI菜单命令(命令标识: string, 取选区文本: () => string): boolean {
  if (!命令标识.startsWith('__ai__:')) return false
  const 指令 = 通用AI指令.find((项) => 项.id === 命令标识.slice('__ai__:'.length))
  if (指令) 交给助手(指令, 取选区文本())
  return true
}

/** 统一的颜色菜单命令解析：命中返回 true */
export function 处理颜色菜单命令(命令标识: string, 执行格式化: (指令: string, 值?: string) => void): boolean {
  if (命令标识.startsWith('__highlight__:')) {
    执行格式化('hiliteColor', 命令标识.slice('__highlight__:'.length))
    return true
  }
  if (命令标识.startsWith('__color__:')) {
    执行格式化('foreColor', 命令标识.slice('__color__:'.length))
    return true
  }
  return false
}
