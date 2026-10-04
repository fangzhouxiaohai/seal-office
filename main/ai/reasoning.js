const 预设列表 = require('./providers.json')
const 思考档位 = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
const 参数模式列表 = ['none', 'three', 'four', 'six', 'thinking', 'budget']

function 生成思考参数(配置, 强度 = 配置.思考强度 || 'high') {
  if (!思考档位.includes(强度)) throw new Error('思考强度无效')
  const 模式 = 配置.参数模式 || 'none'
  if (!参数模式列表.includes(模式)) throw new Error('思考参数模式无效')
  if (模式 === 'none') return {}
  if (模式 === 'three') {
    const 实际 = { low: 'low', medium: 'high', high: 'high', xhigh: 'high', max: 'max', ultra: 'max' }[强度]
    return { ...(配置.服务商 === 'kimi' ? {} : { thinking: { type: 'enabled' } }), reasoning_effort: 实际 }
  }
  if (模式 === 'four') return { reasoning_effort: ['max', 'ultra'].includes(强度) ? 'xhigh' : 强度 }
  if (模式 === 'six') return { reasoning_effort: 强度 }
  if (模式 === 'thinking') return { thinking: { type: 'enabled' } }
  return { enable_thinking: true, thinking_budget: { low: 1024, medium: 4096, high: 8192, xhigh: 16384, max: 24576, ultra: 32768 }[强度] }
}
module.exports = { 预设列表, 思考档位, 参数模式列表, 生成思考参数 }
