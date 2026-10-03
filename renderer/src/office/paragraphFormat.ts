/** 段落尺寸使用缇（1 磅 = 20 缇）；倍数行距使用 240 分之一行。 */
export interface 段落排版 {
  缩进?: { 左?: number; 右?: number; 首行?: number; 悬挂?: number; 左字符?: number; 右字符?: number; 首行字符?: number; 悬挂字符?: number }
  间距?: { 段前?: number; 段后?: number; 行距?: number; 行距规则?: 'auto' | 'exact' | 'atLeast'; 段前行?: number; 段后行?: number; 自动段前?: boolean; 自动段后?: boolean }
}

/** 来源属性只在相应排版未被编辑时保留，避免字符单位被换算成固定磅值。 */
function 恢复来源排版(元素: HTMLElement, 缩进: NonNullable<段落排版['缩进']>, 间距: NonNullable<段落排版['间距']>, 未覆盖: Set<string>): void {
  const 来源 = 元素.dataset.sealParagraphFormat
  if (!来源) return
  try {
    const 数据 = JSON.parse(来源)
    if (!数据 || typeof 数据 !== 'object' || typeof 数据.样式 !== 'string') throw new Error()
    const 原样式 = document.createElement('p').style
    原样式.cssText = 数据.样式
    const 分组: ['marginLeft' | 'marginRight' | 'textIndent' | 'marginTop' | 'marginBottom', '缩进' | '间距', string[]][] = [
      ['marginLeft', '缩进', ['左', '左字符']], ['marginRight', '缩进', ['右', '右字符']],
      ['textIndent', '缩进', ['首行', '悬挂', '首行字符', '悬挂字符']],
      ['marginTop', '间距', ['段前', '段前行', '自动段前']], ['marginBottom', '间距', ['段后', '段后行', '自动段后']],
    ]
    for (const [样式名, 组, 字段] of 分组) {
      const 原格式 = 数据[组]
      if (!原格式 || !字段.some((键) => 原格式[键] !== undefined) || 元素.style[样式名] !== 原样式[样式名]) continue
      const 有效字段 = 字段.filter((键) => 原格式[键] !== undefined)
      if (有效字段.some((键) => 键.startsWith('自动') ? typeof 原格式[键] !== 'boolean'
        : !Number.isSafeInteger(原格式[键]) || 原格式[键] > 2147483647 || 原格式[键] < (['左', '右', '左字符', '右字符'].includes(键) ? -2147483648 : 0))) throw new Error()
      const 目标 = (组 === '缩进' ? 缩进 : 间距) as Record<string, unknown>
      字段.forEach((键) => delete 目标[键])
      有效字段.forEach((键) => { 目标[键] = 原格式[键] })
    }
    if ((缩进.首行 !== undefined || 缩进.首行字符 !== undefined) && (缩进.悬挂 !== undefined || 缩进.悬挂字符 !== undefined)) throw new Error()
  } catch {
    未覆盖.add('段落来源排版数据无效')
  }
}

function 长度转缇(文本: string, 字号: number): number | undefined {
  const 匹配 = 文本.trim().match(/^(-?(?:\d+(?:\.\d*)?|\.\d+))(px|pt|em|rem|cm|mm|in|pc)?$/i)
  if (!匹配) return undefined
  const 数值 = Number(匹配[1])
  const 单位 = (匹配[2] || 'px').toLowerCase()
  const 每单位缇: Record<string, number> = { px: 15, pt: 20, em: 字号 * 20, rem: 240, cm: 1440 / 2.54, mm: 1440 / 25.4, in: 1440, pc: 240 }
  const 结果 = Math.round(数值 * 每单位缇[单位])
  return Number.isSafeInteger(结果) && Math.abs(结果) <= 2147483647 ? 结果 : undefined
}

/** 只将能可靠映射到段落属性的尺寸写入模型，无法解释的值仍报告风险。 */
export function 读取段落排版(元素: HTMLElement, 字号: number | undefined, 未覆盖: Set<string>): 段落排版 {
  const 格式: 段落排版 = {}
  const 缩进: NonNullable<段落排版['缩进']> = {}
  const 间距: NonNullable<段落排版['间距']> = {}
  const 样式 = 元素.style
  const 读取尺寸 = (值: string, 允许负数: boolean): number | undefined => {
    const 尺寸 = 长度转缇(值, 字号 ?? 12)
    if (尺寸 === undefined || !允许负数 && 尺寸 < 0) {
      未覆盖.add('段落缩进或间距')
      return undefined
    }
    return 尺寸
  }
  if (样式.marginLeft) 缩进.左 = 读取尺寸(样式.marginLeft, true)
  if (样式.marginRight) 缩进.右 = 读取尺寸(样式.marginRight, true)
  if (样式.textIndent) {
    const 首行 = 读取尺寸(样式.textIndent, true)
    if (首行 !== undefined) {
      if (首行 < 0) 缩进.悬挂 = -首行
      else 缩进.首行 = 首行
    }
  }
  if (样式.marginTop) 间距.段前 = 读取尺寸(样式.marginTop, false)
  if (样式.marginBottom) 间距.段后 = 读取尺寸(样式.marginBottom, false)
  const 行高 = 样式.lineHeight.trim()
  if (行高 && 行高 !== 'normal') {
    const 倍数 = 行高.match(/^(\d+(?:\.\d*)?|\.\d+)(%)?$/)
    if (倍数) {
      const 行距 = Math.round(Number(倍数[1]) * (倍数[2] ? 2.4 : 240))
      if (Number.isSafeInteger(行距) && 行距 > 0 && 行距 <= 2147483647) {
        间距.行距 = 行距
        间距.行距规则 = 'auto'
      } else 未覆盖.add('段落缩进或间距')
    } else {
      const 行距 = 读取尺寸(行高, false)
      if (行距 !== undefined && 行距 > 0) {
        间距.行距 = 行距
        间距.行距规则 = 元素.dataset.sealLineRule === 'atLeast' ? 'atLeast' : 'exact'
      } else 未覆盖.add('段落缩进或间距')
    }
  }
  恢复来源排版(元素, 缩进, 间距, 未覆盖)
  if (Object.values(缩进).some((值) => 值 !== undefined)) 格式.缩进 = 缩进
  if (Object.values(间距).some((值) => 值 !== undefined)) 格式.间距 = 间距
  return 格式
}
