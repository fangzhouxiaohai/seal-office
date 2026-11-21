import { PDFDocument } from 'pdf-lib'
import { 创建工作表, type Sheet } from '../sheet/model'
import { 生成地址 } from '../sheet/address'
import { 桥接 } from '../ipc/bridge'
import type { 扫描页 } from './scanLibrary'
import type { 证件类型 } from './scanModes'

/** 识别结果保留原列顺序和空格；保留前导零、长编号与疑似公式的字面原文。 */
export function 生成照片工作表(文字: string, 页号: number): Sheet {
  let 有分列 = false
  const 行列: string[][] = []
  for (const 原行 of 文字.split(/\r?\n/)) {
    if (!原行.trim() || /^\s*```/.test(原行)) continue
    let 项: string[]
    if (原行.includes('\t')) 项 = 原行.split('\t').map(格 => 格.trim())
    else if (原行.includes('|')) 项 = 原行.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(格 => 格.trim().replace(/\\\|/g, '|'))
    else 项 = [原行.trim()]
    if (项.every(格 => /^:?-{2,}:?$/.test(格))) continue
    if (项.length > 1) 有分列 = true
    行列.push(项)
  }
  if (!有分列) throw new Error(`第 ${页号} 页没有可分辨的表格行列，请重新拍摄或在识别结果中用制表符、竖线分列`)
  const 列数 = 行列.reduce((最多, 行) => Math.max(最多, 行.length), 0)
  if (列数 > 16384 || 行列.length > 1048576) throw new Error('识别结果超出工作表可保存的行列数')
  const 表 = 创建工作表(`第 ${页号} 页`, Math.max(100, 行列.length), Math.max(26, 列数))
  行列.forEach((行, y) => 行.forEach((值, x) => {
    if (!值) return
    const 数值 = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(值) && 值.replace(/[-.]/g, '').length <= 15
    表.单元格[生成地址(y, x)] = { 原始值: 值, 显示值: 值, ...(数值 ? {} : { 值类型: '文本' as const }), 格式: {} }
  }))
  return 表
}

const 毫米 = (值: number) => 值 * 72 / 25.4
const A4宽 = 毫米(210), A4高 = 毫米(297)
type 位置 = { x: number; y: number; width: number; height: number; 序号: number }
export function 证件排版(页: Pick<扫描页, '宽' | '高'>[], 类型: 证件类型): 位置[][] {
  if (!页.length) throw new Error('请先拍摄证件')
  if (类型 === '身份证' && 页.length % 2) throw new Error('请补拍身份证反面，每份身份证需有正反两面')
  const 双面 = 类型 === '身份证'
  const 组: 位置[][] = []
  页.forEach((项, i) => {
    if (!(项.宽 > 0 && 项.高 > 0)) throw new Error('证件图片尺寸无效')
    const 限宽 = 毫米(双面 ? 85.6 : 类型 === '护照' ? 125 : 类型 === '户口本' ? 170 : 180)
    const 限高 = 毫米(双面 ? 54 : 类型 === '护照' ? 125 : 245)
    const 缩放 = Math.min(限宽 / 项.宽, 限高 / 项.高), width = 项.宽 * 缩放, height = 项.高 * 缩放
    const 组号 = 双面 ? Math.floor(i / 2) : i
    const 中央 = 双面 ? (i % 2 ? 0.31 : 0.69) * A4高 : A4高 / 2
    ;(组[组号] ??= []).push({ x: (A4宽 - width) / 2, y: 中央 - height / 2, width, height, 序号: i })
  })
  return 组
}

export async function 生成证件PDF(页列表: 扫描页[], 类型: 证件类型) {
  const 排版 = 证件排版(页列表, 类型)
  const 文档 = await PDFDocument.create()
  文档.setCreator('海豹办公')
  for (const 组 of 排版) {
    const 页 = 文档.addPage([A4宽, A4高])
    for (const { 序号, ...尺寸 } of 组) {
      const 输入 = 页列表[序号]
      const 图片 = 输入.类型 === 'image/png' ? await 文档.embedPng(输入.图片) : await 文档.embedJpg(输入.图片)
      页.drawImage(图片, 尺寸)
    }
  }
  return 文档.save()
}

export async function 翻译扫描文字(页: { 标识: string; 文字: string }[], 目标语言: string): Promise<Map<string, string>> {
  if (页.some(项 => !项.文字.trim())) throw new Error('请先识别各页文字，再翻译')
  const 条目 = 页.map(项 => ({ 对象标识: 项.标识, 原文: 项.文字 }))
  const 返回 = await 桥接.presentationAi.translate({ 请求标识: `扫描翻译-${Date.now()}`, 条目, 目标语言 })
  if (!返回.成功) throw new Error(返回.错误 || '翻译服务暂时不可用')
  const 结果 = new Map(返回.数据?.译文?.map(项 => [项.对象标识, 项.译文.trim()]))
  if (页.some(项 => !结果.get(项.标识))) throw new Error('翻译服务未返回每一页的有效译文，请重试')
  return 结果
}
