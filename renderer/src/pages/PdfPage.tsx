// PDF 工具页面：提供 PDF 文件的提取、删除、旋转等操作。
import PdfWorkbench from '../pdf/PdfWorkbench'
import OfdViewer from '../pdf/OfdViewer'
import { useAppStore } from '../store'
import { useLayoutEffect, useMemo, useRef } from 'react'

const PdfPage = () => {
  const { PDF待预览, pdfDocuments, activeWorkspaceTabId, createDoc, 更新PDF内容, 保存PDF文档, 查找保存路径占用, selectWorkspaceTab, closeWorkspaceTab } = useAppStore()
  const 待替换标签 = useRef<{ 原标识: string; 目标路径: string } | null>(null)
  const 已打开文件 = useMemo(() => pdfDocuments.filter((文件) => 文件.data !== null && !/\.ofd$/i.test(文件.name)).map((文件) => ({ 标识: 文件.id, 名称: 文件.name, 数据: 文件.data!, 路径: 文件.path, 文件指纹: 文件.文件指纹, 警告: 文件.警告 })), [pdfDocuments])

  useLayoutEffect(() => {
    const 待替换 = 待替换标签.current
    if (!待替换) return
    const 已保存文件 = pdfDocuments.find((文件) => 文件.path === 待替换.目标路径)
    if (!已保存文件 || activeWorkspaceTabId !== 已保存文件.id) return
    待替换标签.current = null
    if (待替换.原标识 !== 已保存文件.id) closeWorkspaceTab(待替换.原标识)
  }, [pdfDocuments, activeWorkspaceTabId, closeWorkspaceTab])

  const 保存后打开 = (路径: string, 数据: string, 文件指纹?: string, 标识 = activeWorkspaceTabId ?? undefined, 警告?: string[]) => {
    const 原文件 = pdfDocuments.find((文件) => 文件.id === 标识)
    if (原文件?.path === null) 待替换标签.current = { 原标识: 原文件.id, 目标路径: 路径 }
    try {
      if (标识 && pdfDocuments.some(文件 => 文件.id === 标识)) 保存PDF文档(标识, 路径, 数据, 文件指纹, 警告)
      else createDoc('pdf', 数据, { 路径, 文件指纹, 警告 })
    } catch (错误) {
      待替换标签.current = null
      throw 错误
    }
  }

  if (PDF待预览 && /\.ofd$/i.test(PDF待预览.名称)) return <OfdViewer key={activeWorkspaceTabId} 名称={PDF待预览.名称} 数据={PDF待预览.数据} />
  return <PdfWorkbench
    key={activeWorkspaceTabId}
    初始文件={PDF待预览}
    已打开文件={已打开文件}
    当前标识={activeWorkspaceTabId}
    onAdded={({ 路径, 名称, 数据, 文件指纹, 警告 }) => createDoc('pdf', 数据, 路径 ? { 路径, 文件指纹, 警告 } : { 名称, 警告 })}
    onSelected={(标识) => {
      if (pdfDocuments.some((文件) => 文件.id === 标识)) selectWorkspaceTab(标识)
    }}
    onRemoved={closeWorkspaceTab}
    onEdited={(数据, 标识 = activeWorkspaceTabId ?? undefined, 警告) => {if (标识) 更新PDF内容(标识, 数据, 警告)}}
    onSaved={保存后打开}
    校验保存路径={(路径, 标识) => {
      const 占用 = 查找保存路径占用(标识 ?? activeWorkspaceTabId, 路径)
      return 占用 ? `目标路径已在「${占用.name}」标签中打开，请先切换到该标签或选择其他文件名。` : null
    }}
  />
}

export default PdfPage
