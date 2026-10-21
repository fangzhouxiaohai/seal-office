import { expect, it } from 'vitest'
import { 创建草稿生命周期 } from './draftLifecycle'
import { 创建工作表 } from '../sheet/model'
import { 创建演示文稿 } from '../ppt/deck'

it('工作区隔离、指定文档准备、替换注册旧清理及异常阻止快照', () => {
  const first = 创建草稿生命周期(), other = 创建草稿生命周期()
  const sheet = [创建工作表('草稿')], deck = 创建演示文稿()
  const oldRelease = first.注册('sheet', () => ({ 成功: false, 错误: '旧实例不能调用' }))
  const release = first.注册('sheet', () => ({ 成功: true, 类型: 'table', 模型: sheet, 已修改: true }))
  oldRelease()
  first.注册('deck', () => ({ 成功: true, 类型: 'ppt', 模型: deck, 已修改: false }))
  expect(first.准备('sheet')).toEqual({ 成功: true, 已提交: ['sheet'], 表格文档模型: { sheet }, 演示文档模型: {} })
  expect(first.准备()).toEqual({ 成功: true, 已提交: ['sheet'], 表格文档模型: { sheet }, 演示文档模型: { deck } })
  expect(other.准备()).toEqual({ 成功: true, 已提交: [], 表格文档模型: {}, 演示文档模型: {} })
  release(); expect(first.准备('sheet')).toMatchObject({ 成功: true, 已提交: [], 表格文档模型: {} })
  first.注册('blocked', () => { throw new Error('请先完成输入法') })
  expect(first.准备()).toEqual({ 成功: false, 标识: 'blocked', 错误: '请先完成输入法' })
})
