import { expect, it } from 'vitest'
import { 词组表规模, 差异片段, 转换简繁词组, 转换文本 } from './langConvert'

it('一词多形按词组消歧，不做逐字替换', () => {
  expect(转换文本('头发长', '繁')).toBe('頭髮長')
  expect(转换文本('干杯之后发展很快', '繁')).toBe('乾杯之後發展很快')
  expect(转换文本('问题很复杂', '繁')).toBe('問題很複雜')
  expect(转换文本('只有一只猫', '繁')).toBe('只有一隻貓')
  expect(转换文本('里外都要干净', '繁')).toBe('裡外都要乾淨')
  expect(转换文本('恢复计划', '繁')).toBe('恢復計劃')
})

it('繁体转简体同样按词组回退，未收录字符不猜测', () => {
  expect(转换文本('頭髮長', '简')).toBe('头发长')
  expect(转换文本('乾杯之後發展很快', '简')).toBe('干杯之后发展很快')
  expect(转换文本('問題很複雜', '简')).toBe('问题很复杂')
  expect(转换文本('龍鳳龘', '简')).toBe('龙凤龘')
})

it('转换结果给出差异片段与统计，供差异预览使用', () => {
  const 结果 = 转换简繁词组('发现并发展', '繁')
  expect(结果.文本).toBe('發現並發展')
  expect(结果.转换数).toBeGreaterThan(0)
  expect(结果.片段.map(片段 => 片段.文本).join('')).toBe(结果.文本)
  expect(结果.片段.some(片段 => 片段.改变)).toBe(true)
  expect(差异片段('发现', '發現')).toEqual([{ 文本: '發現', 改变: true }])
  expect(差异片段('abc', 'abc')).toEqual([{ 文本: 'abc', 改变: false }])
})

it('词组表规模可用于界面如实说明覆盖范围', () => {
  expect(词组表规模).toBeGreaterThanOrEqual(60)
})

it('空文本与纯符号保持原样', () => {
  expect(转换文本('', '繁')).toBe('')
  expect(转换文本('2026-10-06 100%', '繁')).toBe('2026-10-06 100%')
})
