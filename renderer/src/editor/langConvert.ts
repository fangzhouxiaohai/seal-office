// 简繁转换：基于公共单字对照表逐字替换。
//
// 说明：中文简繁并非严格一一对应，存在一对多情况（例如「发」对应「發」与「髮」，
// 「干」对应「乾」「幹」「干」）。单字表只收录高频差异字并采用单映射，
// 覆盖日常办公文本的常见场景，不做全量转换，也不对未收录字符做任何猜测替换。
// 一词多形需要词组消歧（例如「头发」与「发展」），由演示模块的词组级转换处理。
import { 简到繁单字表 } from '../utils/简繁单字表'

/** 简体到繁体的对照表，键为简体字 */
const 简到繁表: Record<string, string> = 简到繁单字表

/** 繁体到简体：由简到繁表反转生成，因此必须保证该表为单射 */
const 繁到简表: Record<string, string> = Object.entries(简到繁表).reduce<Record<string, string>>(
  (累计, [简体, 繁体]) => {
    if (累计[繁体] === undefined) {
      累计[繁体] = 简体
    }
    return 累计
  },
  {}
)

export type 转换方向 = '简' | '繁'

export interface 转换结果 {
  文本: string
  转换数: number
}

/** 转换并返回替换字数 */
export function 转换简繁带统计(文本: string, 方向: 转换方向): 转换结果 {
  if (文本.length === 0) {
    return { 文本: '', 转换数: 0 }
  }

  const 表 = 方向 === '繁' ? 简到繁表 : 繁到简表
  let 转换数 = 0
  let 结果 = ''

  for (const 字 of 文本) {
    const 目标 = 表[字]
    if (目标 !== undefined && 目标 !== 字) {
      结果 += 目标
      转换数 += 1
    } else {
      结果 += 字
    }
  }

  return { 文本: 结果, 转换数 }
}

/** 仅转换文本 */
export function 转换简繁(文本: string, 方向: 转换方向): string {
  return 转换简繁带统计(文本, 方向).文本
}

/** 对照表规模，供界面提示说明覆盖范围 */
export const 对照表规模: number = Object.keys(简到繁表).length
