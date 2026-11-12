// 受保护查看相关的共享界面：缺失项列表与编辑区顶部提示条。
// 提示条沿用表格模块已有的 wps-sheet-protectionbar 样式，三种编辑器外观一致。
import React from 'react'
import { 拆分警告文本, 内容风险警告 } from './fileWarnings'
import './sheet/sheetFeatures.css'
import './ProtectedViewBar.css'

/** 把每条警告拆成独立文本节点，语言切换时“页眉”“图片未导入”等片段可分别翻译 */
export function 警告文本(警告: string): React.ReactNode[] {
  return 拆分警告文本(警告).map((片段, 序号) => <span key={序号}>{片段}</span>)
}

export function 警告列表({ 警告 }: { 警告: readonly string[] }) {
  return <ul className="seal-warning-list">{警告.map((项, 序号) => <li key={序号}>{警告文本(项)}</li>)}</ul>
}

/** 仅查看提示条：持续显示缺少的内容，并提供另存副本入口 */
export function 仅查看提示条({ 警告, 另存副本 }: { 警告: readonly string[] | undefined; 另存副本?: () => void }) {
  const 缺失 = 内容风险警告(警告)
  return (
    <div className="wps-sheet-protectionbar seal-protected-view-bar" role="status" aria-label="仅查看提示">
      <span>仅查看：</span>
      {缺失.map((项, 序号) => <React.Fragment key={序号}>{序号 > 0 ? <span>；</span> : null}{警告文本(项)}</React.Fragment>)}
      <span>。原文件不会被覆盖。</span>
      {另存副本 ? <button type="button" className="seal-protected-view-bar__action" onClick={另存副本}>另存副本以便编辑</button> : null}
    </div>
  )
}
