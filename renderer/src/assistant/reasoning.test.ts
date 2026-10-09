import { describe, expect, it } from 'vitest'
import { 提取流式正文, 思考说明 } from './reasoning'

describe('流式正文展示', () => {
  it('逐步展示顶层回复，不泄漏修改 JSON，正确处理转义和中文', () => {
    const 文本 = '{"修改":[{"回复":"不能展示嵌套值"}],"回复":"中文\\n引号\\\"和\\u4e2d文","其他":1}'
    expect(提取流式正文(文本)).toBe('中文\n引号"和中文')
    expect(提取流式正文('{"回复":"正在\\u4e')).toBe('正在')
    expect(提取流式正文('{"回复":"已经输出')).toBe('已经输出')
    expect(提取流式正文('{"修改":[')).toBe('')
    expect(提取流式正文('```json\n{"回复":"正常')).toBe('正常')
    expect(提取流式正文('自然正文')).toBe('自然正文')
  })
  it('不支持的独立强度明确说明映射', () => {
    expect(思考说明('three', 'ultra')).toContain('实际使用最高档')
    expect(思考说明('none')).toContain('默认思考')
  })
  it('流式代码保留语言围栏、缩进和换行，完整 JSON 示例按原文输出', () => {
    expect(提取流式正文('```py')).toBe('')
    for (const 内容 of ['```python\n', '```python\nprint(1)\n```', '```md\n# 标题', '  文字\n  缩进', '```json\n{"name":"海豹"}\n```', '{"name":"海豹"}']) expect(提取流式正文(内容)).toBe(内容)
    expect(提取流式正文('```json\n{"修改":[')).toBe('')
    expect(提取流式正文('```json\n{"回复":"正文含 ```python\\nprint(1)\\n```","修改":[]}\n```')).toBe('正文含 ```python\nprint(1)\n```')
  })
})
