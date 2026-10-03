// PDF 工具页面：提供 PDF 文件的提取、删除、旋转等操作。
import PdfWorkbench from '../pdf/PdfWorkbench'
import { useAppStore } from '../store'
import { useLayoutEffect, useMemo, useRef } from 'react'

const PdfPage = () => {
  const { PDF待预览, pdfDocuments, activeWorkspaceTabId, createDoc, selectWorkspaceTab, closeWorkspaceTab } = useAppStore()
  const 待替换标签 = useRef<{ 原标识: string; 目标路径: string } | null>(null)
  const 已打开文件 = useMemo(() => pdfDocuments.filter((文件) => 文件.data !== null).map((文件) => ({ 标识: 文件.id, 名称: 文件.name, 数据: 文件.data! })), [pdfDocuments])

  useLayoutEffect(() => {
    const 待替换 = 待替换标签.current
    if (!待替换) return
    const 已保存文件 = pdfDocuments.find((文件) => 文件.path === 待替换.目标路径)
    if (!已保存文件 || activeWorkspaceTabId !== 已保存文件.id) return
    待替换标签.current = null
    if (待替换.原标识 !== 已保存文件.id) closeWorkspaceTab(待替换.原标识)
  }, [pdfDocuments, activeWorkspaceTabId, closeWorkspaceTab])

  const 保存后打开 = (路径: string, 数据: string) => {
    const 原文件 = pdfDocuments.find((文件) => 文件.id === activeWorkspaceTabId)
    if (原文件?.path === null) 待替换标签.current = { 原标识: 原文件.id, 目标路径: 路径 }
    try {
      createDoc('pdf', 数据, { 路径 })
    } catch (错误) {
      待替换标签.current = null
      throw 错误
    }
  }

  return <PdfWorkbench
    key={activeWorkspaceTabId}
    初始文件={PDF待预览}
    已打开文件={已打开文件}
    当前标识={activeWorkspaceTabId}
    onAdded={({ 路径, 名称, 数据 }) => createDoc('pdf', 数据, 路径 ? { 路径 } : { 名称 })}
    onSelected={(标识) => {
      if (pdfDocuments.some((文件) => 文件.id === 标识)) selectWorkspaceTab(标识)
    }}
    onRemoved={closeWorkspaceTab}
    onSaved={保存后打开}
  />
}

export default PdfPage
