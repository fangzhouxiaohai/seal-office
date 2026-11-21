// 受保护查看相关的共享界面：缺失项列表与编辑区顶部提示条。
// 提示条沿用表格模块已有的 wps-sheet-protectionbar 样式，三种编辑器外观一致。
import React, { useState } from 'react'
import { Modal } from 'antd'
import { 拆分警告文本, 内容风险警告 } from './fileWarnings'
import './sheet/sheetFeatures.css'
import './ProtectedViewBar.css'

export const 文件警告弹窗 = { className: 'seal-file-warning-dialog', centered: true }

/** 把每条警告拆成独立文本节点，语言切换时“页眉”“图片未导入”等片段可分别翻译 */
export function 警告文本(警告: string): React.ReactNode[] {
  return 拆分警告文本(警告).map((片段, 序号) => <span key={序号}>{片段}</span>)
}

export function 警告列表({ 警告 }: { 警告: readonly string[] }) {
  const 分组 = new Map<string, string[]>()
  for (const 项 of 警告) {
    const 类型 = /^第 \d+ 页图片「.+?」的(.+)$/.exec(项)?.[1] ?? 项
    const 同类 = 分组.get(类型) ?? []
    同类.push(项)
    分组.set(类型, 同类)
  }
  return <ul className="seal-warning-list">{Array.from(分组, ([类型, 同类]) => (
    <li key={类型}>{同类.length === 1 ? 警告文本(同类[0]) : (
      <details>
        <summary>{警告文本(类型)} <span>({同类.length})</span></summary>
        <ul>{同类.map((项, 序号) => <li key={序号}>{警告文本(项)}</li>)}</ul>
      </details>
    )}</li>
  ))}</ul>
}

export function 仅查看提示条({ 警告, 另存副本 }: { 警告: readonly string[] | undefined; 另存副本?: () => void }) {
  const [详情打开, 设详情打开] = useState(false)
  const 缺失 = 内容风险警告(警告)
  return (
    <div className="wps-sheet-protectionbar seal-protected-view-bar">
      <span role="status" aria-label="仅查看提示">仅查看</span>
      {缺失.length > 0 && <button type="button" className="seal-protected-view-bar__action" onClick={() => 设详情打开(true)}>查看兼容性详情</button>}
      {另存副本 ? <button type="button" className="seal-protected-view-bar__action" onClick={另存副本}>另存副本以便编辑</button> : null}
      <Modal {...文件警告弹窗} open={详情打开} title="仅查看提示" footer={null} onCancel={() => 设详情打开(false)}>
        <警告列表 警告={缺失} />
      </Modal>
    </div>
  )
}
