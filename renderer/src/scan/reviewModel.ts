// 识别结果核对：用户在核对表中修改的值覆盖识别值，并视为已人工确认（置信度为 1）。
import type { 单据解析结果, 异常项 } from './validation'

export type 修改表 = Record<string, string>
export const 修改键 = (来源: string, 行: number | null, 键: string) => `${来源}|${行 ?? '表头'}|${键}`
export const 异常键 = (项: 异常项) => `${项.来源}|${项.行 ?? '表头'}|${项.字段.join(',')}|${项.类型}`

export function 应用修改(结果: 单据解析结果, 修改: 修改表): 单据解析结果 {
  const 覆盖 = (行: 单据解析结果['表头'], 行号: number | null) => {
    const 值 = { ...行.值 }, 置信度 = { ...行.置信度 }
    for (const 键 of Object.keys(修改)) {
      const [来源, 位置, 字段] = 键.split('|')
      if (来源 !== 结果.来源 || 位置 !== String(行号 ?? '表头')) continue
      值[字段] = 修改[键]; 置信度[字段] = 1
    }
    return { 值, 置信度 }
  }
  return { ...结果, 表头: 覆盖(结果.表头, null), 明细: 结果.明细.map((行, 序号) => 覆盖(行, 序号 + 1)) }
}

/** 同名文件作为来源时追加序号，保证异常定位唯一 */
export function 唯一名称(名称: string, 已有: Iterable<string>): string {
  const 集合 = new Set(已有)
  if (!集合.has(名称)) return 名称
  for (let 序号 = 2; ; 序号++) { const 候选 = `${名称} (${序号})`; if (!集合.has(候选)) return 候选 }
}
