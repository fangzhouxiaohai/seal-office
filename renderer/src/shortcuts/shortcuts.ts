/** 通用办公快捷键。只调用各编辑器已有命令，不自行修改文档内容。 */
import { commandCatalog } from './commandCatalog'
import { openRibbonCommand } from './ribbonControl'
export type ShortcutScope = 'word' | 'sheet' | 'ppt' | 'pdf' | 'slideshow'
export const shortcutScopeNames: Record<ShortcutScope, string> = { word: '文字', sheet: '表格', ppt: '演示', pdf: 'PDF', slideshow: '演示放映' }
export interface ShortcutDefinition {
  scope: ShortcutScope
  command: string
  label: string
  defaults: string[]
  /** 搜索框等普通输入控件内仅允许文件操作。 */
  allowInInput?: boolean
  allowRepeat?: boolean
  targetCommand?: string
  argument?: string
}
const commands = (scope: ShortcutScope, rows: Array<[string, string, string[], boolean?]>): ShortcutDefinition[] => rows.map(([command, label, defaults, allowRepeat]) => ({ scope, command, label, defaults, allowRepeat, allowInInput: command === 'file.save' || command === 'file.saveAs' || command === 'file.print' }))
const files: Array<[string, string, string[]]> = [
  ['file.save', '保存', ['Ctrl+S']], ['file.saveAs', '另存为', ['Ctrl+Shift+S', 'F12']], ['file.print', '打印预览', ['Ctrl+P', 'Ctrl+Alt+P']],
]
const history: Array<[string, string, string[]]> = [
  ['edit.undo', '撤销', ['Ctrl+Z']], ['edit.redo', '重做', ['Ctrl+Y', 'Ctrl+Shift+Z']],
]
const defaultDefinitions: ShortcutDefinition[] = [
  ...commands('word', [
    ...files, ...history,
    ['file.open', '打开文件', ['Ctrl+O']],
    ['edit.selectAll', '全选', ['Ctrl+A']], ['edit.find', '查找', ['Ctrl+F']], ['edit.replace', '替换', ['Ctrl+H']],
    ['edit.findNext', '查找下一处', ['F3']], ['edit.findPrevious', '查找上一处', ['Shift+F3']],
    ['clipboard.copy', '复制', ['Ctrl+C']], ['clipboard.cut', '剪切', ['Ctrl+X']], ['clipboard.paste', '粘贴', ['Ctrl+V']],
    ['font.bold', '加粗', ['Ctrl+B']], ['font.italic', '斜体', ['Ctrl+I']], ['font.underline', '下划线', ['Ctrl+U']],
    ['font.superscript', '上标', ['Ctrl+Shift+=']], ['font.subscript', '下标', ['Ctrl+=']],
    ['font.grow', '增大字号', ['Ctrl+]', 'Ctrl+Shift+.']], ['font.shrink', '减小字号', ['Ctrl+[', 'Ctrl+Shift+,']],
    ['font.clear', '清除格式', ['Ctrl+Space']],
    ['para.alignLeft', '左对齐', ['Ctrl+L']], ['para.alignCenter', '居中', ['Ctrl+E']], ['para.alignRight', '右对齐', ['Ctrl+R']], ['para.alignJustify', '两端对齐', ['Ctrl+J']],
    ['para.indentIncrease', '增加缩进', ['Ctrl+M', 'Alt+Shift+.']], ['para.indentDecrease', '减少缩进', ['Ctrl+Shift+M', 'Alt+Shift+,']],
    ['layout.break', '插入分页符', ['Ctrl+Enter']], ['link.insert', '插入超链接', ['Ctrl+K']], ['comment.new', '新建批注', ['Ctrl+Alt+M']],
    ['track.enable', '切换修订', ['Ctrl+Shift+E']],
    ['style.body', '正文样式', ['Ctrl+Shift+N']], ['style.heading1', '标题 1', ['Ctrl+Alt+1']], ['style.heading2', '标题 2', ['Ctrl+Alt+2']], ['style.heading3', '标题 3', ['Ctrl+Alt+3']],
    ['para.bullet', '项目符号', ['Ctrl+Shift+L']], ['view.paragraphMark', '显示段落标记', ['Ctrl+Shift+8']], ['word.count', '字数统计', ['Ctrl+Shift+G']],
    ['font.name', '选择字体', ['Ctrl+Shift+F']], ['font.size', '选择字号', ['Ctrl+Shift+P']], ['spell.check', '拼写检查', ['F7']],
    ['view.page', '页面视图', []], ['view.outline', '大纲视图', ['Ctrl+Alt+O']], ['view.draft', '草稿视图', ['Ctrl+Alt+N']],
    ['view.reading', '切换移动阅读模式', ['Ctrl+Alt+R']],
    ['view.documentStart', '跳到文档开头', ['Ctrl+Home'], true], ['view.documentEnd', '跳到文档末尾', ['Ctrl+End'], true],
  ]),
  ...commands('sheet', [
    ...files, ...history,
    ['edit.selectAll', '全选单元格', ['Ctrl+A']], ['edit.find', '查找', ['Ctrl+F']],
    ['clipboard.copy', '复制', ['Ctrl+C']], ['clipboard.cut', '剪切', ['Ctrl+X']], ['clipboard.paste', '粘贴', ['Ctrl+V']],
    ['cell.bold', '加粗', ['Ctrl+B']], ['cell.italic', '斜体', ['Ctrl+I']], ['cell.underline', '下划线', ['Ctrl+U']],
    ['cell.mergeCenter', '合并居中', ['Ctrl+M']], ['data.filter', '筛选', ['Ctrl+Shift+L']], ['review.comment', '新建批注', ['Shift+F2']],
    ['edit.sum', '自动求和', ['Alt+=']],
    ['number.plain', '常规数字格式', ['Ctrl+Shift+`']], ['number.currency', '货币格式', ['Ctrl+Shift+4']], ['number.percent', '百分比格式', ['Ctrl+Shift+5']], ['number.thousand', '千位分隔', ['Ctrl+Shift+1']],
    ['spell.check', '拼写检查', ['F7']], ['view.freeze', '冻结窗格', []],
  ]),
  ...commands('ppt', [
    ...files, ...history,
    ['file.open', '打开文件', ['Ctrl+O']],
    ['slide.new', '新建幻灯片', ['Ctrl+M']], ['slide.duplicate', '复制幻灯片', ['Ctrl+D']],
    ['edit.selectAll', '全选页面对象', ['Ctrl+A']], ['clipboard.copy', '复制选中对象', ['Ctrl+C']], ['clipboard.cut', '剪切选中对象', ['Ctrl+X']], ['clipboard.paste', '粘贴对象', ['Ctrl+V']],
    ['object.delete', '删除选中对象', ['Delete','Backspace']], ['object.group', '组合对象', ['Ctrl+G']], ['object.ungroup', '取消组合', ['Ctrl+Shift+G']],
    ['object.bringForward', '对象上移一层', ['Ctrl+]']], ['object.sendBackward', '对象下移一层', ['Ctrl+[']], ['object.bringToFront', '对象置顶', ['Ctrl+Shift+]']], ['object.sendToBack', '对象置底', ['Ctrl+Shift+[']],
    ['text.bold', '加粗', ['Ctrl+B']], ['text.italic', '斜体', ['Ctrl+I']], ['text.underline', '下划线', ['Ctrl+U']],
    ['text.sizeUp', '增大字号', ['Ctrl+Shift+.']], ['text.sizeDown', '减小字号', ['Ctrl+Shift+,']],
    ['para.alignLeft', '左对齐', ['Ctrl+L']], ['para.alignCenter', '居中', ['Ctrl+E']], ['para.alignRight', '右对齐', ['Ctrl+R']],
    ['slideshow.start', '从头开始放映', ['F5']], ['slideshow.current', '从当前页开始放映', ['Shift+F5']],
    ['view.reading', '阅读视图', []], ['view.prev', '上一张幻灯片', ['PageUp'], true], ['view.next', '下一张幻灯片', ['PageDown'], true],
  ]),
  ...commands('pdf', [
    ['file.save', '保存', ['Ctrl+S']], ['file.saveAs', '另存为', ['Ctrl+Shift+S', 'F12']],
    ['file.print', '打印预览', ['Ctrl+P']],
    ['view.previousPage', '上一页', ['Ctrl+ArrowUp', 'PageUp'], true], ['view.nextPage', '下一页', ['Ctrl+ArrowDown', 'PageDown'], true],
    ['view.firstPage', '第一页', ['Home', 'Ctrl+Home']], ['view.lastPage', '最后一页', ['End', 'Ctrl+End']],
    ['view.zoomIn', '放大', ['Ctrl+=', 'Ctrl+Shift+='], true], ['view.zoomOut', '缩小', ['Ctrl+-'], true], ['view.zoomReset', '恢复默认缩放', []],
    ['view.actualSize', '实际大小', ['Ctrl+1']], ['view.fitWidth', '适应页宽', ['Ctrl+2']], ['view.fitPage', '适应整页', ['Ctrl+0']],
    ['view.gotoPage', '跳转页码', []], ['edit.copyPage', '复制本页文字', []], ['edit.copyAll', '复制全文文字', []],
    ['tools.rotate', '旋转页面', ['Ctrl+Shift+R']], ['tools.extract', '提取页面', []], ['tools.merge', '合并 PDF', []], ['tools.delete', '删除页面', []], ['tools.insertBlank', '插入空白页', []], ['tools.insertPages', '插入 PDF 页面', []],
  ]),
  ...commands('slideshow',[
    ['show.next','下一步 / 下一页',['ArrowRight','ArrowDown','PageDown','Space','Enter'],true],
    ['show.previous','上一页',['ArrowLeft','ArrowUp','PageUp','Backspace'],true],
    ['show.first','首张幻灯片',['Home']],['show.last','末张幻灯片',['End']],
    ['show.pause','暂停或继续',['P']],['show.black','切换黑屏',['B']],['show.white','切换白屏',['W']],
    ['show.laser','激光笔',['L']],['show.ink','画笔',['I']],['show.erase','橡皮',[]],['show.clearInk','清除本页笔迹',['E']],
    ['show.exit','退出放映 / 阅读',['Escape']],
  ]),
]

// Keep every implemented command assignable, including commands without an industry default.
// Registry imports stay out of the runtime bundle to avoid circular editor dependencies.
export const shortcutDefinitions: ShortcutDefinition[] = [...defaultDefinitions]
for (const scope of ['word','sheet','ppt'] as const) for (const [command,label] of commandCatalog[scope]) {
  if (!shortcutDefinitions.some(item => item.scope === scope && item.command === command)) shortcutDefinitions.push(...commands(scope, [[command,label,[]]]))
}
const duplicate = shortcutDefinitions.find(item=>item.scope==='ppt'&&item.command==='slide.duplicate')!
duplicate.targetCommand='edit.duplicateContext';duplicate.label='复制选中对象 / 幻灯片'
for (const [command,label,argument,key] of [['para.singleSpacing','单倍行距','1','Ctrl+1'],['para.doubleSpacing','双倍行距','2','Ctrl+2'],['para.oneHalfSpacing','1.5 倍行距','1.5','Ctrl+5']]) shortcutDefinitions.push({scope:'word',command,label,argument,targetCommand:'para.lineSpacing',defaults:[key]})
for (const [direction,label,key] of [['up','上','ArrowUp'],['down','下','ArrowDown'],['left','左','ArrowLeft'],['right','右','ArrowRight']]) {
  for (const [prefix,text,modifiers] of [['move','移动',''],['extend','扩展选区','Shift+'],['edge','跳到数据边界','Ctrl+'],['extendEdge','扩展到数据边界','Ctrl+Shift+']]) shortcutDefinitions.push({scope:'sheet',command:`navigation.${prefix}.${direction}`,label:`向${label}${text}`,defaults:[modifiers+key],allowRepeat:true})
  for(const [prefix,text,modifier]of [['nudge','微移',''],['nudgeLarge','移动','Shift+']])shortcutDefinitions.push({scope:'ppt',command:`object.${prefix}.${direction}`,label:`向${label}${text}对象`,defaults:[modifier+key],allowRepeat:true})
}
shortcutDefinitions.push(...commands('sheet',[
  ['navigation.home','返回 A1',['Home','Ctrl+Home']], ['navigation.end','转到已用区域末尾',['Ctrl+End']],
  ['navigation.pageUp','向上滚动一屏',['PageUp'],true], ['navigation.pageDown','向下滚动一屏',['PageDown'],true],
  ['navigation.edit','编辑当前单元格',['F2','Enter']], ['navigation.clear','清除选区内容',['Delete','Backspace']],
]))

export type ShortcutOverrides = Record<string, string[]>
export const SHORTCUT_STORAGE_KEY = 'seal-office-shortcuts-v1'
export const SHORTCUT_CHANGED_EVENT = 'seal-shortcuts-changed'
export const shortcutId = (definition: Pick<ShortcutDefinition, 'scope' | 'command'>) => `${definition.scope}:${definition.command}`
const definitionsById = new Map(shortcutDefinitions.map(definition => [shortcutId(definition), definition]))

const keyAliases: Record<string, string> = { ' ': 'Space', space: 'Space', spacebar: 'Space', esc: 'Escape', escape: 'Escape', return: 'Enter', enter: 'Enter', del: 'Delete', delete: 'Delete', backspace: 'Backspace', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', tab: 'Tab', plus: '=', minus: '-' }
function normalizeKey(key: string): string | null {
  const lower = key.toLowerCase()
  if (keyAliases[lower]) return keyAliases[lower]
  if (/^f([1-9]|1\d|2[0-4])$/i.test(key)) return key.toUpperCase()
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase()
  if (/^[=\-,.\/;\[\]\\'`]$/.test(key)) return key
  return null
}

/** Ctrl 也接受 Cmd / Mod 输入；外接 Mac 键盘的 ⌘ 与 Ctrl 等效。 */
export function normalizeShortcut(value: string, allowPresentationKey = false): string | null {
  const parts = value.split('+').map(part => part.trim())
  if (!parts.length || parts.some(part => !part)) return null
  const key = normalizeKey(parts.pop()!)
  if (!key) return null
  const modifiers = new Set<string>()
  for (const part of parts) {
    const modifier = /^(ctrl|control|cmd|command|meta|mod)$/i.test(part) ? 'Ctrl' : /^alt$/i.test(part) ? 'Alt' : /^shift$/i.test(part) ? 'Shift' : null
    if (!modifier || modifiers.has(modifier)) return null
    modifiers.add(modifier)
  }
  if (!modifiers.size && !/^F\d+$/.test(key) && !['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Delete', 'Backspace'].includes(key) && !(allowPresentationKey && (/^[A-Z0-9]$/.test(key) || key === 'Space' || key === 'Escape'))) return null
  // 保留系统切换、关闭、辅助功能及文本光标的基本导航。
  if (key === 'Tab' || key === 'Escape' && !(allowPresentationKey && !modifiers.size) || (key === 'F4' && modifiers.has('Alt')) || (key === 'Delete' && modifiers.has('Ctrl') && modifiers.has('Alt'))) return null
  return [...['Ctrl', 'Alt', 'Shift'].filter(modifier => modifiers.has(modifier)), key].join('+')
}

export interface ShortcutKeyboardEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat?: boolean
  isComposing?: boolean
  keyCode?: number
  defaultPrevented?: boolean
  target?: EventTarget | null
  nativeEvent?: { isComposing?: boolean; keyCode?: number }
  getModifierState?: (key: 'AltGraph') => boolean
  preventDefault: () => void
}
export function shortcutFromEvent(event: ShortcutKeyboardEvent, scope?: ShortcutScope): string | null {
  if (event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229 || event.nativeEvent?.keyCode === 229 || event.getModifierState?.('AltGraph') || (event.ctrlKey && event.metaKey)) return null
  // 字符按实际键位保存，Shift 的标点显示值还原后再与修饰键一起比较。
  const shifted: Record<string, string> = { '+': '=', '_': '-', '<': ',', '>': '.', '?': '/', ':': ';', '{': '[', '}': ']', '|': '\\', '"': "'", '~': '`', '!':'1', '@':'2', '#':'3', '$':'4', '%':'5', '^':'6', '&':'7', '*':'8', '(':'9', ')':'0' }
  const key = normalizeKey(event.shiftKey ? shifted[event.key] ?? event.key : event.key)
  if (!key) return null
  return normalizeShortcut([...(event.ctrlKey || event.metaKey ? ['Ctrl'] : []), ...(event.altKey ? ['Alt'] : []), ...(event.shiftKey ? ['Shift'] : []), key].join('+'),scope === 'slideshow')
}

export function getShortcutBindings(definition: ShortcutDefinition, overrides: ShortcutOverrides): string[] {
  return overrides[shortcutId(definition)] ?? definition.defaults
}
export interface ShortcutConflict { scope: ShortcutScope; shortcut: string; commands: string[] }
export function findShortcutConflicts(overrides: ShortcutOverrides): ShortcutConflict[] {
  const occupied = new Map<string, { scope: ShortcutScope; shortcut: string; commands: string[] }>()
  for (const definition of shortcutDefinitions) {
    for (const shortcut of getShortcutBindings(definition, overrides)) {
      const key = `${definition.scope}:${shortcut}`
      const entry = occupied.get(key) ?? { scope: definition.scope, shortcut, commands: [] }
      if (!entry.commands.includes(definition.command)) entry.commands.push(definition.command)
      occupied.set(key, entry)
    }
  }
  return [...occupied.values()].filter(entry => entry.commands.length > 1)
}

function validateOverrides(value: unknown): ShortcutOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('快捷键配置格式无效，请恢复默认后重试。')
  const result: ShortcutOverrides = {}
  for (const [id, shortcuts] of Object.entries(value)) {
    if (!definitionsById.has(id)) continue
    if (!Array.isArray(shortcuts) || shortcuts.length > 4 || shortcuts.some(shortcut => typeof shortcut !== 'string' || !normalizeShortcut(shortcut,id.startsWith('slideshow:')))) throw new Error('快捷键配置包含无效键位，请恢复默认后重试。')
    result[id] = [...new Set(shortcuts.map(shortcut => normalizeShortcut(shortcut,id.startsWith('slideshow:'))!))]
  }
  if (findShortcutConflicts(result).length) throw new Error('快捷键配置存在冲突，请恢复默认后重试。')
  return result
}
export function readShortcutOverrides(): ShortcutOverrides {
  const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY)
  if (!raw) return {}
  const parsed = JSON.parse(raw)
  if (parsed?.version !== 1) throw new Error('快捷键配置版本无效，请恢复默认后重试。')
  return validateOverrides(parsed.overrides)
}
export function saveShortcutOverrides(overrides: ShortcutOverrides): void {
  const checked = validateOverrides(overrides)
  localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify({ version: 1, overrides: checked }))
  window.dispatchEvent(new Event(SHORTCUT_CHANGED_EVENT))
}
export function resetShortcutOverrides(): void {
  localStorage.removeItem(SHORTCUT_STORAGE_KEY)
  window.dispatchEvent(new Event(SHORTCUT_CHANGED_EVENT))
}

const 系统粘贴键 = ['Ctrl+V', 'Shift+Insert']

/** 返回 true 才消费按键。输入法、弹窗、控件原生编辑、已被局部消费的事件均优先。 */
export function dispatchShortcut(event: ShortcutKeyboardEvent, scope: ShortcutScope, execute: (command: string, argument?: string) => boolean | void, overrides?: ShortcutOverrides): boolean {
  if (event.defaultPrevented) return false
  const shortcut = shortcutFromEvent(event,scope)
  if (!shortcut) return false
  const target = event.target instanceof Element ? event.target : null
  const overlay = target?.closest('[role="dialog"], [role="menu"], [data-shortcut-recorder]')
  if (overlay && !(scope === 'slideshow' && overlay.classList.contains('wps-slideshow'))) return false
  let bindings = overrides
  if (!bindings) { try { bindings = readShortcutOverrides() } catch { bindings = {} } }
  const definition = shortcutDefinitions.find(item => item.scope === scope && getShortcutBindings(item, bindings!).includes(shortcut))
  const removedDefault = !definition ? shortcutDefinitions.find(item => item.scope === scope && bindings![shortcutId(item)] !== undefined && item.defaults.includes(shortcut)) : undefined
  const candidate = definition ?? removedDefault
  if (!candidate) return false
  const input = target?.closest('input, textarea, select, [role="textbox"], [contenteditable="true"], [contenteditable=""]')
  const documentEditor = input?.closest('.wps-editor-canvas__content')
  // 文字正文中的系统粘贴键交给原生 paste 事件：截图等纯图片剪贴板随事件送达正文的粘贴监听。
  // 不可编辑区域（表格网格、演示画布）浏览器不派发 paste 事件，仍执行粘贴命令读取剪贴板。
  if (documentEditor && definition?.command === 'clipboard.paste' && 系统粘贴键.includes(shortcut)) return false
  const slideTextEditor = scope === 'ppt' && input?.matches('[data-seal-shortcut-editor="ppt"]') && /^(text\.|para\.)/.test(candidate.command)
  if (input && !documentEditor && !slideTextEditor && !candidate.allowInInput) return false
  // 改绑/禁用后同时挡住 contenteditable 的原生 Ctrl+B / Ctrl+Z 等回退行为。
  // 已识别但长按的文件操作也只消费事件，避免浏览器另行打开打印/保存对话框。
  if (!definition || (event.repeat && !definition.allowRepeat)) { event.preventDefault(); return true }
  if (definition.argument !== undefined) { if (execute(definition.targetCommand ?? definition.command, definition.argument) === false) return false }
  else if (!openRibbonCommand(definition.targetCommand ?? definition.command) && execute(definition.targetCommand ?? definition.command) === false) return false
  event.preventDefault()
  return true
}
