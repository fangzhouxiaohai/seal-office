import { describe, expect, it } from 'vitest'
import { 读取演示命令状态 } from './commandStatus'

describe('演示命令能力状态', () => {
  it('未实现入口不计为可用', () => {
    expect(读取演示命令状态('insert.chart')).toMatchObject({ 状态: '可用' })
    expect(读取演示命令状态('insert.table')).toMatchObject({ 状态: '可用' })
    expect(读取演示命令状态('insert.picture')).toMatchObject({ 状态: '可用' })
    expect(读取演示命令状态('slide.new')).toMatchObject({ 状态: '可用' })
  })

  it('只读、执行中和缺少配置均给出明确状态', () => {
    expect(读取演示命令状态('slide.new', { 只读: true }).状态).toBe('只读')
    expect(读取演示命令状态('slide.new', { 正在执行: true }).状态).toBe('正在执行')
    expect(读取演示命令状态('ai.generate', { 需要配置: true, 已配置: false }).状态).toBe('缺少配置')
  })
})
