// 演示文稿编辑器的选区浮窗与右键菜单共用的动作定义。
// 对象类动作走 PptEditor 的 对象操作，文本类走演示命令表，AI 动作交给助手对话。
import type { 浮窗按钮 } from '../components/SelectionFloatPanel'
import { 构建AI按钮, 通用AI指令, 交给助手 } from '../assistant/quickActions'

export const 演示字体颜色 = [
  { 名称: '黑色', 值: '#1A1D24' },
  { 名称: '红色', 值: '#E34D59' },
  { 名称: '橙色', 值: '#F2994A' },
  { 名称: '蓝色', 值: '#2B6CF6' },
]

export interface 演示浮窗依赖 {
  /** 执行演示命令表里的命令（可带参数） */
  执行命令: (标识: string, 参数?: string) => void
  /** 对象级操作，命令形如 '对齐:左'、'图层:置顶'、'删除' */
  对象操作: (命令: string) => void
  /** 取选中对象里的文字，用于 AI 快捷动作 */
  取选区文本: () => string
  /** 是否存在文本类对象（决定是否显示文字格式按钮） */
  有文本对象: boolean
}

/** 演示选区浮窗：剪贴板 + 对象操作 + 文本格式 + AI 快捷动作 */
export function 构建演示浮窗按钮(依赖: 演示浮窗依赖): 浮窗按钮[] {
  const 对象类: 浮窗按钮[] = [
    { id: 'object.delete', 标签: '删除对象', 图标: 'trash', 分组: 10, 执行: () => 依赖.对象操作('删除') },
    { id: 'layer.front', 标签: '置于顶层', 图标: 'front', 分组: 10, 执行: () => 依赖.对象操作('图层:置顶') },
    { id: 'layer.back', 标签: '置于底层', 图标: 'back', 分组: 10, 执行: () => 依赖.对象操作('图层:置底') },
    { id: 'align.left', 标签: '左对齐', 图标: 'align-left', 分组: 20, 执行: () => 依赖.对象操作('对齐:左') },
    { id: 'align.center', 标签: '水平居中', 图标: 'align-center', 分组: 20, 执行: () => 依赖.对象操作('对齐:水平居中') },
    { id: 'align.right', 标签: '右对齐', 图标: 'align-right', 分组: 20, 执行: () => 依赖.对象操作('对齐:右') },
  ]
  const 本地: 浮窗按钮[] = [
    { id: 'edit.copy', 标签: '复制', 图标: 'copy', 分组: 0, 执行: () => 依赖.执行命令('edit.copy') },
    { id: 'edit.cut', 标签: '剪切', 图标: 'cut', 分组: 0, 执行: () => 依赖.执行命令('edit.cut') },
    { id: 'edit.paste', 标签: '粘贴', 图标: 'paste', 分组: 0, 执行: () => 依赖.执行命令('edit.paste') },
    ...对象类,
  ]
  const 文本: 浮窗按钮[] = 依赖.有文本对象 ? [
    { id: 'text.bold', 标签: '加粗', 图标: 'bold', 分组: 30, 执行: () => 依赖.执行命令('text.bold') },
    { id: 'text.italic', 标签: '斜体', 图标: 'italic', 分组: 30, 执行: () => 依赖.执行命令('text.italic') },
    { id: 'text.underline', 标签: '下划线', 图标: 'underline', 分组: 30, 执行: () => 依赖.执行命令('text.underline') },
    { id: 'text.color', 标签: '字体颜色（红色）', 图标: 'color', 分组: 40, 执行: () => 依赖.执行命令(`__pptcolor__:${演示字体颜色[1].值}`) },
  ] : []
  return [...本地, ...文本, ...构建AI按钮(依赖.取选区文本)]
}

/** 右键菜单里的文本颜色分组 */
export function 构建演示颜色菜单组(): Array<{ type: 'group'; 标题: string; 子项: Array<{ type: 'item'; commandId: string; label: string }> }> {
  return [
    {
      type: 'group', 标题: '字体颜色', 子项: 演示字体颜色.map((项) => ({
        type: 'item' as const, commandId: `__pptcolor__:${项.值}`, label: 项.名称,
      })),
    },
  ]
}

/** 演示颜色菜单命令解析：命中返回 true */
export function 处理演示颜色命令(命令标识: string, 执行命令: (标识: string, 参数?: string) => void): boolean {
  if (!命令标识.startsWith('__pptcolor__:')) return false
  执行命令('text.color', 命令标识.slice('__pptcolor__:'.length))
  return true
}

/** 演示 AI 菜单命令解析：命中返回 true */
export function 处理演示AI命令(命令标识: string, 取选区文本: () => string): boolean {
  if (!命令标识.startsWith('__ai__:')) return false
  const 指令 = 通用AI指令.find((项) => 项.id === 命令标识.slice('__ai__:'.length))
  if (指令) 交给助手(指令, 取选区文本())
  return true
}
