// 段落排版属性的受控映射，两端读写只接受明确支持的数值与开关。
const 缩进字段 = [
  ['左', 'left', true], ['右', 'right', true], ['首行', 'firstLine'], ['悬挂', 'hanging'],
  ['左字符', 'leftChars', true], ['右字符', 'rightChars', true], ['首行字符', 'firstLineChars'], ['悬挂字符', 'hangingChars'],
]
const 间距字段 = [
  ['段前', 'before'], ['段后', 'after'], ['行距', 'line'], ['行距规则', 'lineRule'],
  ['段前行', 'beforeLines'], ['段后行', 'afterLines'], ['自动段前', 'beforeAutospacing'], ['自动段后', 'afterAutospacing'],
]
const 扩展字段 = new Set(['leftChars', 'rightChars', 'firstLineChars', 'hangingChars', 'beforeLines', 'afterLines', 'beforeAutospacing', 'afterAutospacing'])

function 属性有效(字段, 值, 允许负数 = false) {
  if (字段 === 'lineRule') return ['auto', 'exact', 'atLeast'].includes(值)
  if (字段.endsWith('Autospacing')) return typeof 值 === 'boolean'
  return Number.isSafeInteger(值) && 值 >= (允许负数 ? -2147483648 : 字段 === 'line' ? 1 : 0) && 值 <= 2147483647
}

function 验证段落属性(段) {
  const 扩展 = { ind: {}, spacing: {} }
  for (const [组, 标签, 字段列表] of [['缩进', 'ind', 缩进字段], ['间距', 'spacing', 间距字段]]) {
    if (!段[组]) continue
    for (const [名称, 属性, 允许负数] of 字段列表) {
      const 值 = 段[组][名称]
      if (值 === undefined) continue
      if (!属性有效(属性, 值, 允许负数)) throw new Error(`段落${名称}数值或规则无效，无法保存`)
      if (扩展字段.has(属性)) 扩展[标签][属性] = typeof 值 === 'boolean' ? Number(值) : 值
    }
  }
  if ((段.缩进?.首行 !== undefined || 段.缩进?.首行字符 !== undefined) &&
      (段.缩进?.悬挂 !== undefined || 段.缩进?.悬挂字符 !== undefined)) throw new Error('段落首行与悬挂缩进不能同时设置')
  return 扩展
}

module.exports = { 缩进字段, 间距字段, 扩展字段, 属性有效, 验证段落属性 }
