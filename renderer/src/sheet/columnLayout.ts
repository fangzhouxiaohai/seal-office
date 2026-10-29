import type { Sheet } from './model'

/** 老版转换结果只有离散列宽；压缩后保留数据区以外的布局。 */
export function 压缩列宽(列宽: Record<number, number>): NonNullable<Sheet['列布局']> {
  const 结果: NonNullable<Sheet['列布局']> = []
  for (const 列 of Object.keys(列宽).map(Number).filter(列 => Number.isInteger(列) && 列 >= 0 && 列 < 16384).sort((甲, 乙) => 甲 - 乙)) {
    const 宽度 = 列宽[列]
    if (!Number.isFinite(宽度) || 宽度 <= 0) continue
    const 上项 = 结果[结果.length - 1]
    if (上项 && 上项.止列 + 1 === 列 && 上项.宽度 === 宽度) 上项.止列 = 列
    else 结果.push({ 起列: 列, 止列: 列, 宽度 })
  }
  return 结果
}

/** 插入的空列不继承被右移列的默认格式，删除则将其右侧布局左移。 */
export function 调整列布局(布局: Sheet['列布局'], 位置: number, 删除: boolean): Sheet['列布局'] {
  if (!布局) return undefined
  return 布局.flatMap(项 => {
    if (项.止列 < 位置) return [项]
    if (删除) {
      const 起列 = 项.起列 > 位置 ? 项.起列 - 1 : 项.起列
      const 止列 = 项.止列 - 1
      return 起列 <= 止列 ? [{ ...项, 起列, 止列 }] : []
    }
    if (项.起列 >= 位置) return 项.起列 < 16383 ? [{ ...项, 起列: 项.起列 + 1, 止列: Math.min(16383, 项.止列 + 1) }] : []
    return [{ ...项, 止列: 位置 - 1 }, ...(位置 < 16383 ? [{ ...项, 起列: 位置 + 1, 止列: Math.min(16383, 项.止列 + 1) }] : [])]
  })
}
