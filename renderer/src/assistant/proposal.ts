import { 净化富文本 } from '../editor/sanitizeHtml'
import { 解析地址 } from '../sheet/address'
import { 写入单元格, 读取单元格, type Sheet } from '../sheet/model'
import type { 演示文稿, 文本框 } from '../ppt/deck'
import { 构建文字根, 清理文字定位块, 收集文字段落, 段落文本 } from './wordBlocks'

export type 文字替换 = { 种类: '文字替换'; 段落标识?: string; 查找: string; 替换为: string }
export type 段落格式 = { 标题级别?: number; 对齐?: 'left' | 'center' | 'right' | 'justify'; 字号?: number; 字体?: string; 颜色?: string; 加粗?: boolean; 行距?: number; 段前?: number; 段后?: number; 首行缩进?: number }
export type 段落排版 = { 种类: '段落排版'; 段落标识: string; 原文: string; 格式: 段落格式 }
export type 文字修改 = 文字替换 | 段落排版
export type 表格修改 = { 种类: '单元格写入'; 工作表: string; 地址: string; 原值: string; 新值: string }
export type 演示修改 = { 种类: '演示文本替换'; 页码: number; 文本框标识: string; 查找: string; 替换为: string }
export type 助手修改 = 文字修改 | 表格修改 | 演示修改
export type 助手回复 = { 回复: string; 修改: 助手修改[] }

function 有效文本(值: unknown, 字段: string, 可空 = false): string {
  if (typeof 值 !== 'string' || (!可空 && !值.trim())) throw new Error(`${字段}格式无效`)
  return 值
}

/** 仅接受固定的修改指令；模型输出不能直接运行任意命令。 */
export function 解析助手回复(原文: string): 助手回复 {
  const 文本 = 原文.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let 数据: unknown
  try { 数据 = JSON.parse(文本) }
  catch {
    if (文本.startsWith('{') || 文本.startsWith('[')) throw new Error('模型回复的修改格式无效，请重新描述需求')
    return { 回复: 有效文本(文本, '模型回复'), 修改: [] }
  }
  if (!数据 || typeof 数据 !== 'object' || Array.isArray(数据)) throw new Error('模型回复格式无效')
  const 对象 = 数据 as Record<string, unknown>
  const 回复 = 有效文本(对象.回复, '模型回复')
  if (!Array.isArray(对象.修改)) throw new Error('模型修改数量格式无效')
  const 修改 = 对象.修改.map((项): 助手修改 => {
    if (!项 || typeof 项 !== 'object' || Array.isArray(项)) throw new Error('模型修改格式无效')
    const 指令 = 项 as Record<string, unknown>
    if (指令.种类 === '文字替换') return { 种类: '文字替换', ...(指令.段落标识 !== undefined ? { 段落标识: 有效文本(指令.段落标识, '段落标识') } : {}), 查找: 有效文本(指令.查找, '查找文本'), 替换为: 有效文本(指令.替换为, '替换文本', true) }
    if (指令.种类 === '段落排版') return { 种类: '段落排版', 段落标识: 有效文本(指令.段落标识, '段落标识'), 原文: 有效文本(指令.原文, '段落原文', true), 格式: 校验段落格式(指令.格式) }
    if (指令.种类 === '单元格写入') return { 种类: '单元格写入', 工作表: 有效文本(指令.工作表, '工作表'), 地址: 有效文本(指令.地址, '单元格地址'), 原值: 有效文本(指令.原值, '原值', true), 新值: 有效文本(指令.新值, '新值', true) }
    if (指令.种类 === '演示文本替换') {
      if (!Number.isSafeInteger(指令.页码) || Number(指令.页码) < 1) throw new Error('幻灯片页码无效')
      return { 种类: '演示文本替换', 页码: Number(指令.页码), 文本框标识: 有效文本(指令.文本框标识, '文本框标识'), 查找: 有效文本(指令.查找, '查找文本'), 替换为: 有效文本(指令.替换为, '替换文本', true) }
    }
    throw new Error('模型返回了不支持的修改指令，未执行任何操作')
  })
  return { 回复, 修改 }
}

export function 校验段落格式(输入: unknown): 段落格式 {
  if (!输入 || typeof 输入 !== 'object' || Array.isArray(输入)) throw new Error('段落格式无效')
  const 格式 = 输入 as Record<string, unknown>
  const 范围: Record<string, [number, number]> = { 标题级别: [0, 6], 字号: [8, 96], 行距: [1, 3], 段前: [0, 96], 段后: [0, 96], 首行缩进: [0, 8] }
  if (!Object.keys(格式).length) throw new Error('段落格式不能为空')
  for (const [键, 值] of Object.entries(格式)) {
    if (范围[键]) {
      if (typeof 值 !== 'number' || !Number.isFinite(值) || 值 < 范围[键][0] || 值 > 范围[键][1] || (键 === '标题级别' && !Number.isInteger(值))) throw new Error(`${键}超出允许范围`)
    } else if (键 === '对齐') { if (!['left', 'center', 'right', 'justify'].includes(String(值))) throw new Error('段落对齐无效') }
    else if (键 === '颜色') { if (typeof 值 !== 'string' || !/^#[0-9a-f]{6}$/i.test(值)) throw new Error('文字颜色无效，请使用六位颜色值') }
    else if (键 === '字体') { if (typeof 值 !== 'string' || !值.trim() || 值.length > 60 || /[;{}<>\\]/.test(值)) throw new Error('字体名称无效') }
    else if (键 === '加粗') { if (typeof 值 !== 'boolean') throw new Error('加粗设置无效') }
    else throw new Error(`不支持的段落格式：${键}`)
  }
  return 格式 as 段落格式
}

function 应用段落格式(元素: HTMLElement, 格式: 段落格式): HTMLElement {
  if (格式.标题级别 !== undefined) {
    const 标签 = 格式.标题级别 === 0 ? 'p' : `h${格式.标题级别}`
    const 新元素 = document.createElement(标签)
    if ((['P', 'DIV', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(元素.tagName) || 元素.hasAttribute('data-seal-assistant-block')) && 元素.parentElement) {
      Array.from(元素.attributes).filter((属性) => 属性.name !== 'data-seal-assistant-block').forEach((属性) => 新元素.setAttribute(属性.name, 属性.value))
      while (元素.firstChild) 新元素.appendChild(元素.firstChild)
      元素.replaceWith(新元素)
    } else {
      while (元素.firstChild) 新元素.appendChild(元素.firstChild)
      元素.appendChild(新元素)
    }
    元素 = 新元素
  }
  const 设置 = (目标: HTMLElement) => {
    if (格式.字号 !== undefined) 目标.style.fontSize = `${格式.字号}pt`
    if (格式.字体 !== undefined) 目标.style.fontFamily = 格式.字体
    if (格式.颜色 !== undefined) 目标.style.color = 格式.颜色
    if (格式.加粗 !== undefined) 目标.style.fontWeight = 格式.加粗 ? 'bold' : 'normal'
  }
  设置(元素)
  // 清理片段的冲突值，使整段格式真正生效，同时保留其他片段属性和图片。
  元素.querySelectorAll<HTMLElement>('span,b,strong,i,em,u,a,font').forEach(设置)
  if (格式.对齐 !== undefined) 元素.style.textAlign = 格式.对齐
  if (格式.行距 !== undefined) 元素.style.lineHeight = String(格式.行距)
  if (格式.段前 !== undefined) 元素.style.marginTop = `${格式.段前}px`
  if (格式.段后 !== undefined) 元素.style.marginBottom = `${格式.段后}px`
  if (格式.首行缩进 !== undefined) 元素.style.textIndent = `${格式.首行缩进}em`
  return 元素
}

/** 修改局部文字节点，图片和格式标签不进入删除范围；段落标识始终绑定原始快照。 */
export function 预览文字修改(html: string, 修改: 文字修改[]): string {
  const 根 = 构建文字根(html)
  const 段落 = 收集文字段落(根)
  const 段落索引 = new Map(段落.map((块) => [块.标识, 块]))
  for (const 项 of 修改) {
    const 目标 = '段落标识' in 项 && 项.段落标识 ? 段落索引.get(项.段落标识) : undefined
    if ('段落标识' in 项 && 项.段落标识 && !目标) throw new Error(`找不到指定段落：${项.段落标识}`)
    if (项.种类 === '段落排版') {
      if (!目标 || 目标.原文 !== 项.原文) throw new Error('段落原文与发送时快照不一致，已阻止误改')
      const 格式 = 目标.元素.hasAttribute('data-seal-assistant-block') && 项.格式.标题级别 === undefined ? { ...项.格式, 标题级别: 0 } : 项.格式
      目标.元素 = 应用段落格式(目标.元素, 校验段落格式(格式))
      continue
    }
    if (typeof 项.查找 !== 'string' || !项.查找 || typeof 项.替换为 !== 'string') throw new Error('文字修改内容无效')
    const 匹配: Array<{ 元素: HTMLElement; 位置: number }> = []
    for (const 块 of 目标 ? [目标] : 段落) {
      const 原文 = 段落文本(块.元素)
      let 位置 = 原文.indexOf(项.查找)
      while (位置 >= 0) {
        匹配.push({ 元素: 块.元素, 位置 })
        位置 = 原文.indexOf(项.查找, 位置 + 项.查找.length)
      }
    }
    if (匹配.length === 0) throw new Error(`未找到需要修改的原文：${项.查找.slice(0, 40)}`)
    if (匹配.length !== 1) throw new Error(`原文不是唯一匹配，已阻止误改：${项.查找.slice(0, 40)}`)
    const { 元素, 位置 } = 匹配[0]
    if (项.查找.includes('\n')) throw new Error('原文跨越换行，请分别修改每一行以保留版式')
    const 遍历器 = document.createTreeWalker(元素, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
    let 节点: Node | null, 偏移 = 0, 已写入 = false
    while ((节点 = 遍历器.nextNode()) !== null) {
      if (节点.nodeName === 'BR') { 偏移 += 1; continue }
      if (节点.nodeType !== Node.TEXT_NODE) continue
      const 原文 = 节点.textContent ?? ''
      const 末尾 = 偏移 + 原文.length
      if (末尾 > 位置 && 偏移 < 位置 + 项.查找.length) {
        const 开始 = Math.max(0, 位置 - 偏移), 结束 = Math.min(原文.length, 位置 + 项.查找.length - 偏移)
        节点.textContent = 原文.slice(0, 开始) + (已写入 ? '' : 项.替换为) + 原文.slice(结束)
        已写入 = true
      }
      偏移 = 末尾
    }
  }
  清理文字定位块(根)
  return 净化富文本(根.innerHTML)
}

export function 预览表格修改(工作表列表: Sheet[], 修改: 表格修改[]): Sheet[] {
  let 候选 = 工作表列表
  for (const 项 of 修改) {
    const 下标 = 候选.findIndex((表) => 表.name === 项.工作表)
    if (下标 < 0) throw new Error(`找不到工作表：${项.工作表}`)
    const 表 = 候选[下标]
    const 地址 = 项.地址.trim().toUpperCase()
    const 位置 = 解析地址(地址)
    if (!位置 || 位置.行 >= 表.行数 || 位置.列 >= 表.列数) throw new Error(`单元格地址超出工作表范围：${项.地址}`)
    if (读取单元格(表, 地址).原始值 !== 项.原值) throw new Error(`${表.name} 的 ${地址} 内容已变化，无法应用修改`)
    候选 = 候选.map((原表, 索引) => 索引 === 下标 ? 写入单元格(原表, 地址, 项.新值) : 原表)
  }
  return 候选
}

function 替换文本框(框: 文本框, 查找: string, 替换为: string): 文本框 {
  const 位置 = 框.text.indexOf(查找)
  if (位置 < 0) throw new Error('指定文本框中未找到原文')
  if (框.text.indexOf(查找, 位置 + 查找.length) >= 0) throw new Error('文本框中的原文不是唯一匹配')
  const 新文本 = 框.text.slice(0, 位置) + 替换为 + 框.text.slice(位置 + 查找.length)
  if (!框.片段列表?.length) return { ...框, text: 新文本 }
  if (框.片段列表.map((片段) => 片段.文本).join('') !== 框.text) throw new Error('文本框片段与正文不一致，无法安全修改')
  let 偏移 = 0, 已写入 = false
  const 片段列表 = 框.片段列表.map((片段) => {
    const 起点 = 偏移; 偏移 += 片段.文本.length
    if (偏移 <= 位置 || 起点 >= 位置 + 查找.length) return 片段
    const 前文 = 片段.文本.slice(0, Math.max(0, 位置 - 起点))
    const 后文 = 片段.文本.slice(Math.min(片段.文本.length, 位置 + 查找.length - 起点))
    const 文本 = 前文 + (已写入 ? '' : 替换为) + 后文
    已写入 = true
    return { ...片段, 文本 }
  })
  return { ...框, text: 新文本, 片段列表 }
}

export function 预览演示修改(文稿: 演示文稿, 修改: 演示修改[]): 演示文稿 {
  let 候选 = 文稿
  for (const 项 of 修改) {
    const 页 = 候选.幻灯片列表[项.页码 - 1]
    if (!页) throw new Error(`幻灯片页码超出范围：${项.页码}`)
    const 框 = 页.文本框列表.find((目标) => 目标.id === 项.文本框标识)
    if (!框) throw new Error(`第 ${项.页码} 页找不到指定文本框`)
    const 新框 = 替换文本框(框, 项.查找, 项.替换为)
    候选 = { ...候选, 幻灯片列表: 候选.幻灯片列表.map((原页, 索引) => 索引 === 项.页码 - 1
      ? { ...原页, 文本框列表: 原页.文本框列表.map((原框) => 原框.id === 框.id ? 新框 : 原框) }
      : 原页) }
  }
  return 候选
}
