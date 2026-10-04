import type { 思考强度, 思考参数模式 } from '../ipc/bridge'

export const 思考选项: Array<{ value: 思考强度; label: string }> = [
  { value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' }, { value: 'max', label: '最高' }, { value: 'ultra', label: '极致（ultra）' },
]
export const 参数选项: Array<{ value: 思考参数模式; label: string }> = [
  { value: 'none', label: '模型默认（不传强度参数）' }, { value: 'three', label: '低 / 高 / 最高，开启思考' },
  { value: 'four', label: '标准四档 reasoning_effort' }, { value: 'six', label: '扩展六档 reasoning_effort' },
  { value: 'thinking', label: '开启思考，不传强度' }, { value: 'budget', label: 'thinking_budget 令牌预算' },
]
export function 思考说明(模式: 思考参数模式 = 'none', 强度: 思考强度 = 'high'): string {
  if (模式 === 'none') return '当前按模型默认思考；如需控制强度，请在模型设置选择其支持的参数模式。'
  if (模式 === 'thinking') return '当前模型开启思考，强度由服务商控制；六档不会额外发送不支持的参数。'
  if (模式 === 'three') {
    const 实际 = { low: '低', medium: '高', high: '高', xhigh: '高', max: '最高', ultra: '最高' }[强度]
    return `服务商支持低、高、最高三档；当前实际使用${实际}档。中、极高映射高，极致映射最高。`
  }
  if (模式 === 'four') return '最高和极致映射为极高；具体模型需支持所选 reasoning_effort 参数。'
  if (模式 === 'six') return '按六档原值发送；仅用于明确支持 low/medium/high/xhigh/max/ultra 的模型。'
  return `思考预算为 ${{ low: 1024, medium: 4096, high: 8192, xhigh: 16384, max: 24576, ultra: 32768 }[强度]} 个令牌；需模型支持 thinking_budget。`
}

/** 解码顶层回复字符串的已到达部分，避免向用户显示 JSON 修改协议。 */
export function 提取流式正文(原文: string): string {
  const 文本 = 原文.trimStart().replace(/^```(?:json)?\s*/i, '')
  if (!文本 || 文本.startsWith('`')) return ''
  if (!文本.startsWith('{') && !文本.startsWith('[')) return 文本
  let 深度 = 0
  for (let i = 0; i < 文本.length; i++) {
    const 字符 = 文本[i]
    if (字符 === '{' || 字符 === '[') 深度++
    else if (字符 === '}' || 字符 === ']') 深度--
    else if (字符 === '"') {
      const 起点 = i
      for (i++; i < 文本.length; i++) {
        if (文本[i] === '\\') i++
        else if (文本[i] === '"') break
      }
      if (深度 !== 1 || 文本.slice(起点, i + 1) !== '"回复"') continue
      const 后面 = 文本.slice(i + 1).match(/^\s*:\s*"/)
      if (!后面) continue
      const 起始 = i + 1 + 后面[0].length
      let 内容 = ''
      for (let j = 起始; j < 文本.length; j++) {
        if (文本[j] === '"') break
        if (文本[j] !== '\\') { 内容 += 文本[j]; continue }
        const 转义 = 文本[++j]
        if (!转义) break
        if (转义 === 'u') {
          const 数字 = 文本.slice(j + 1, j + 5)
          if (!/^[0-9a-f]{4}$/i.test(数字)) break
          内容 += String.fromCharCode(parseInt(数字, 16)); j += 4
        } else {
          const 映射: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' }
          if (映射[转义] === undefined) break
          内容 += 映射[转义]
        }
      }
      return 内容
    }
  }
  return ''
}
