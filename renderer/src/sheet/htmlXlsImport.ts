import { parse } from 'parse5'
import { 生成地址 } from './address'
import { 从Html表格构建工作表 } from './sheetImport'
import type { CellFormat, Sheet } from './model'

type 网页节点 = { tagName?: string; nodeName?: string; value?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: 网页节点[] }

const 默认限制 = { 最大字节数: 10 * 1024 * 1024, 最大表格数: 10, 最大单元格数: 200_000, 最大列数: 1_000 }

function 属性(节点: 网页节点, 名称: string): string | undefined {
  return 节点.attrs?.find(项 => 项.name.toLowerCase() === 名称)?.value
}

function 文字(节点: 网页节点): string {
  if (节点.nodeName === '#text') return 节点.value ?? ''
  if (['script', 'style', 'img', 'iframe', 'object', 'embed', 'svg'].includes(节点.tagName ?? '')) return ''
  return (节点.childNodes ?? []).map(文字).join('')
}

function 转义(内容: string): string {
  return 内容.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function 取行(表格: 网页节点): 网页节点[] {
  const 行: 网页节点[] = []
  const 遍历 = (节点: 网页节点) => {
    for (const 子节点 of 节点.childNodes ?? []) {
      if (子节点.tagName === 'table') throw new Error('网页型旧版表格包含嵌套表格，暂无法安全导入')
      if (子节点.tagName === 'tr') 行.push(子节点)
      else 遍历(子节点)
    }
  }
  遍历(表格)
  return 行
}

function 读取样式(节点: 网页节点, 格式: CellFormat, 损失: Set<string>) {
  if (节点.tagName === 'th') 格式.加粗 = true
  const 声明 = (属性(节点, 'style') ?? '').split(';')
  for (const 项 of 声明) {
    const 冒号 = 项.indexOf(':')
    if (冒号 < 0) continue
    const 名 = 项.slice(0, 冒号).trim().toLowerCase(), 值 = 项.slice(冒号 + 1).trim()
    if (['color','background','background-color'].includes(名) && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(值)) {
      格式[名 === 'color' ? '字体颜色' : '填充颜色'] = 值.length === 4 ? '#' + [...值.slice(1)].map(c => c + c).join('') : 值
    } else if (名 === 'font-weight') 格式.加粗 = 值 === 'bold' || Number(值) >= 600
    else if (名 === 'mso-number-format' && 值.replace(/["'\\]/g, '') === '@') 格式.数字格式代码 = '@'
    else if (名 !== 'border-collapse') 损失.add('未导入网页样式 ' + 名)
  }
}

export function 导入网页型旧版表格(原文: string, 限制: Partial<typeof 默认限制> = {}, 损失 = new Set<string>()): Sheet[] {
  const 配置 = { ...默认限制, ...限制 }
  if (!/^\uFEFF?\s*(?:<!doctype\s+html(?:\s|>)|<html(?:\s|>))/i.test(原文)) throw new Error('文件内容不是网页文档，不能作为网页型旧版表格导入')
  if (new TextEncoder().encode(原文).length > 配置.最大字节数) throw new Error('网页型旧版表格超过导入字节上限')
  const 根 = parse(原文) as 网页节点
  const 表格列表: 网页节点[] = []
  const 找表格 = (节点: 网页节点, 表内 = false) => {
    const 标签 = 节点.tagName ?? ''
    if (['script','style','img','iframe','object','embed','svg','a','input','link'].includes(标签)) 损失.add('未导入网页元素 <' + 标签 + '>')
    if (标签 === 'table' && !表内) 表格列表.push(节点)
    for (const 子节点 of 节点.childNodes ?? []) 找表格(子节点, 表内 || 标签 === 'table')
  }
  找表格(根)
  if (!表格列表.length) throw new Error('网页型旧版表格没有可识别的表格，文件未打开')
  if (表格列表.length > 配置.最大表格数) throw new Error('网页型旧版表格超过表格数量上限')
  let 总单元格数 = 0
  return 表格列表.map((表格, 表序) => {
    const 行列表 = 取行(表格)
    if (!行列表.length) throw new Error(`第 ${表序 + 1} 张网页表格没有数据行`)
    const 网格: Array<Array<{ 值: string; 文本: boolean } | undefined>> = []
    const 合并区域: string[] = []
    const 单元格格式: Record<string, CellFormat> = {}
    const 表样式: CellFormat = Number(属性(表格, 'border')) > 0 ? { 边框: { 上: true, 下: true, 左: true, 右: true } } : {}
    读取样式(表格, 表样式, 损失)
    for (let 行号 = 0; 行号 < 行列表.length; 行号 += 1) {
      网格[行号] ??= []
      let 列号 = 0
      const 行样式 = { ...表样式 }
      读取样式(行列表[行号], 行样式, 损失)
      const 数据格 = (行列表[行号].childNodes ?? []).filter(节点 => ['td', 'th'].includes(节点.tagName ?? ''))
      for (const 格 of 数据格) {
        while (网格[行号][列号] !== undefined) 列号 += 1
        const 横跨 = Number(属性(格, 'colspan') ?? 1), 纵跨 = Number(属性(格, 'rowspan') ?? 1)
        if (!Number.isInteger(横跨) || !Number.isInteger(纵跨) || 横跨 < 1 || 纵跨 < 1 || 横跨 > 配置.最大列数 || 纵跨 > 100_000) throw new Error('网页型旧版表格的合并单元格范围无效')
        if (列号 + 横跨 > 配置.最大列数 || 行号 + 纵跨 > 100_000) throw new Error('网页型旧版表格超过行列上限')
        总单元格数 += 横跨 * 纵跨
        if (总单元格数 > 配置.最大单元格数) throw new Error('网页型旧版表格超过单元格数量上限')
        const 明确数字 = 属性(格, 'data-value-type') === 'number' || 属性(格, 'x:num') !== undefined
        const 格式 = { ...行样式 }
        读取样式(格, 格式, 损失)
        if (Object.keys(格式).length) 单元格格式[生成地址(行号, 列号)] = 格式
        const 值 = 明确数字 ? (属性(格, 'x:num') ?? 文字(格)) : 文字(格)
        for (let 行偏移 = 0; 行偏移 < 纵跨; 行偏移 += 1) {
          网格[行号 + 行偏移] ??= []
          for (let 列偏移 = 0; 列偏移 < 横跨; 列偏移 += 1) 网格[行号 + 行偏移][列号 + 列偏移] = 行偏移 || 列偏移 ? { 值: '', 文本: true } : { 值, 文本: !明确数字 }
        }
        if (横跨 > 1 || 纵跨 > 1) 合并区域.push(`${生成地址(行号, 列号)}:${生成地址(行号 + 纵跨 - 1, 列号 + 横跨 - 1)}`)
        列号 += 横跨
      }
    }
    const HTML = `<table>${网格.map(行 => `<tr>${Array.from({ length: 行.length }, (_, 列) => {
      const 格 = 行[列] ?? { 值: '', 文本: true }
      return `<td${格.文本 ? ' data-value-type="text"' : ''}>${转义(格.值)}</td>`
    }).join('')}</tr>`).join('')}</table>`
    const 工作表 = 从Html表格构建工作表(HTML, 属性(表格, 'name') || `网页表格${表序 + 1}`, undefined, { 合并区域, 单元格格式 })
    if (!工作表) throw new Error('网页型旧版表格转换失败，文件未打开')
    return 工作表
  })
}

export function 从二进制读取网页型旧版表格(内容: string): string | null {
  const 前缀 = atob(内容.slice(0, 1024).replace(/=+$/, ''))
  if (!/^\uFEFF?\s*(?:<!doctype\s+html(?:\s|>)|<html(?:\s|>))/i.test(前缀.replace(/^ï»¿/, ''))) return null
  if (内容.length > Math.ceil(默认限制.最大字节数 / 3) * 4 + 4) throw new Error('网页型旧版表格超过 10 MB 导入上限')
  const 字节 = Uint8Array.from(atob(内容), 字符 => 字符.charCodeAt(0))
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(字节) }
  catch { throw new Error('网页型旧版表格编码不是有效的 UTF-8') }
}
