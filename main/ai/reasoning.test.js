const { 生成思考参数, 预设列表 } = require('./reasoning')
const { 规范配置 } = require('./assistant')

describe('内置服务商和六档思考适配', () => {
  it('DeepSeek 预设和六档按官方三档映射', () => {
    expect(预设列表[0].模型).toBe('deepseek-flash')
    for (const [强度, 实际] of Object.entries({ low: 'low', medium: 'high', high: 'high', xhigh: 'high', max: 'max', ultra: 'max' })) {
      expect(生成思考参数({ 服务商: 'deepseek', 参数模式: 'three' }, 强度)).toEqual({ thinking: { type: 'enabled' }, reasoning_effort: 实际 })
    }
    expect(生成思考参数({ 服务商: 'kimi', 参数模式: 'three' }, 'high')).toEqual({ reasoning_effort: 'high' })
  })
  it('模型默认不额外发送参数，扩展模式发送实际六档', () => {
    expect(生成思考参数({ 参数模式: 'none' }, 'ultra')).toEqual({})
    expect(生成思考参数({ 参数模式: 'six' }, 'ultra')).toEqual({ reasoning_effort: 'ultra' })
    expect(生成思考参数({ 参数模式: 'budget' }, 'max')).toEqual({ enable_thinking: true, thinking_budget: 24576 })
    expect(() => 生成思考参数({}, 'utra')).toThrow('强度')
  })
  it('切换服务商或接口地址不沿用其他平台密钥', () => {
    const 原 = { ...预设列表[0], 服务商: 'deepseek', 思考强度: 'high', 密钥: '测试专用密钥' }
    const 下一家 = { ...预设列表[2], 服务商: 'zhipu' }
    expect(规范配置(下一家, 原).密钥).toBe('')
    expect(规范配置({ ...下一家, 密钥: '新密钥' }, 原).密钥).toBe('新密钥')
    expect(规范配置({ ...原, 密钥: undefined }, 原).密钥).toBe('测试专用密钥')
    expect(规范配置({ ...原, 地址: 'https://example.com/chat/completions', 密钥: undefined }, 原).密钥).toBe('')
  })
})
