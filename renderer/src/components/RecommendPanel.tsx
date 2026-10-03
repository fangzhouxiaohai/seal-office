// 首页右侧常用操作面板，入口均连接当前可用的本机功能。
import { useState } from 'react'
import { Button } from 'antd'
import Icon from './Icon'

type 文档类型 = 'word' | 'table' | 'ppt'

interface Props {
  onOpenFile: () => void
  onOpenPdf: () => void
  onNewDoc: (类型: 文档类型) => void
}

const 快捷入口: Array<{ 标识: 文档类型 | 'pdf'; 标题: string; 图标: string }> = [
  { 标识: 'word', 标题: '空白文字', 图标: 'doc-word' },
  { 标识: 'table', 标题: '空白表格', 图标: 'doc-table' },
  { 标识: 'ppt', 标题: '空白演示', 图标: 'doc-ppt' },
  { 标识: 'pdf', 标题: '阅读 PDF', 图标: 'doc-pdf' },
]

const 功能入口: Array<{ 标识: 文档类型 | 'pdf'; 标题: string; 描述: string; 图标: string }> = [
  { 标识: 'pdf', 标题: 'PDF 页面处理', 描述: '阅读、提取、合并、删除和旋转页面', 图标: 'pdf' },
  { 标识: 'word', 标题: '文字编辑', 描述: '编辑文档并导出常用格式', 图标: 'doc-word' },
  { 标识: 'table', 标题: '表格计算', 描述: '编辑工作表、公式与单元格格式', 图标: 'doc-table' },
  { 标识: 'ppt', 标题: '演示放映', 描述: '编辑幻灯片并全屏放映', 图标: 'doc-ppt' },
]

const RecommendPanel = ({ onOpenFile, onOpenPdf, onNewDoc }: Props) => {
  const [可见, 设可见] = useState(true)
  const 执行入口 = (标识: 文档类型 | 'pdf') => {
    if (标识 === 'pdf') onOpenPdf()
    else onNewDoc(标识)
  }

  if (!可见) {
    return (
      <button type="button" className="wps-recommend__reopen" aria-label="展开精选推荐" onClick={() => 设可见(true)}>
        <Icon name="grid" size={16} />
      </button>
    )
  }

  return (
    <aside className="wps-recommend">
      <div className="wps-recommend__header">
        <span className="wps-recommend__title">精选推荐</span>
        <button type="button" className="wps-recommend__close" aria-label="关闭精选推荐" onClick={() => 设可见(false)}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="wps-recommend__checkin">
        <div className="wps-recommend__checkin-row">
          <span className="wps-recommend__checkin-title">本机文档</span>
          <Button type="primary" size="small" onClick={onOpenFile}>打开文件</Button>
        </div>
        <span className="wps-recommend__checkin-more">最近打开的文件会显示在首页</span>
      </div>
      <div className="wps-recommend__section">
        <div className="wps-recommend__section-head"><span>快捷开始</span></div>
        <div className="wps-recommend__grid">
          {快捷入口.map((项) => (
            <button key={项.标识} type="button" className="wps-recommend__cell" onClick={() => 执行入口(项.标识)}>
              <span className="wps-recommend__cell-icon"><Icon name={项.图标} size={18} /></span>
              <span className="wps-recommend__cell-label">{项.标题}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="wps-recommend__section">
        <div className="wps-recommend__section-head"><span>工具与编辑</span></div>
        {功能入口.map((项) => (
          <button key={项.标题} type="button" className="wps-recommend__row" onClick={() => 执行入口(项.标识)}>
            <span className="wps-recommend__row-icon"><Icon name={项.图标} size={18} /></span>
            <span className="wps-recommend__row-text">
              <span className="wps-recommend__row-title">{项.标题}</span>
              <span className="wps-recommend__row-desc">{项.描述}</span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  )
}

export default RecommendPanel
