// 显式文案取词：t('键', { 参数 })。语言来自设置层，切换后组件重渲染即时生效。
import { useCallback } from 'react'
import { use界面语言, type 界面语言 } from '../store/settingsStore'
import { 台账, type 文案键 } from './ledger'

export type 文案参数 = Record<string, string | number>

export function 取文案(键: 文案键, 语言: 界面语言, 参数: 文案参数 = {}): string {
  const 条目: { zh: string; en: string; enOne?: string } = 台账[键]
  // 英文单复数：count 为 1 时取单数形式；0 与多项用复数
  const 模板 = 语言 === 'en-US' ? (条目.enOne !== undefined && Number(参数.count) === 1 ? 条目.enOne : 条目.en) : 条目.zh
  return 模板.replace(/\{(\w+)\}/g, (原样, 名称) => 名称 in 参数 ? String(参数[名称]) : 原样)
}

export function useT() {
  const 语言 = use界面语言()
  return useCallback((键: 文案键, 参数?: 文案参数) => 取文案(键, 语言, 参数), [语言])
}
