import { describe, expect, it } from 'vitest'
import { 解析页码 } from './pdfCommands'

describe('PDF 页码输入', () => {
  it('展开合法页码与范围，并去重', () => {
    expect(解析页码('1,3-5,3')).toEqual([1, 3, 4, 5])
  })

  it.each(['1,a', '0,2', '-1', '3-2', '1-2-3', '1,,3', '1.5', '  '])('拒绝含无效段的输入 %s，不只执行合法片段', (输入) => {
    expect(() => 解析页码(输入)).toThrow('页码格式无效')
  })
})
