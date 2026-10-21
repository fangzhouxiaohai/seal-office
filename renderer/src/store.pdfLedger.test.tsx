import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { PDFDocument } from 'pdf-lib'
import { AppProvider, useAppStore, type AppState } from './store'

const codec = createRequire(import.meta.url)('../../main/office/sealFormat.js')
const original = window.electronAPI
afterEach(() => { window.electronAPI = original })

it('SPDF来源ledger在新建、编辑、并发保存、预览、干净路径备份及重新读取真实SPDF恢复均保留', async () => {
  let state!: AppState, backup: string | null = null
  const originalPdf = await PDFDocument.create(); originalPdf.addPage([300, 400])
  const first = Buffer.from(await originalPdf.save()).toString('base64')
  originalPdf.addPage([400, 500])
  const edited = Buffer.from(await originalPdf.save()).toString('base64')
  const sourceLedger = ['来源转换保留记录', '合并页面来源记录']
  const native = await codec.writeSeal('pdf', { PDF数据: edited, 警告: sourceLedger })
  const readFile = vi.fn(async () => ({ 成功: true, 内容: native.toString('base64'), 二进制: true, 扩展名: 'spdf', 文件指纹: 'restored-fingerprint' }))
  window.electronAPI = {
    backupLoad: async () => ({ 成功: true, 内容: backup }), backupSave: async (value: string) => { backup = value; return { 成功: true } }, backupClear: async () => ({ 成功: true }),
    readFile, office: { readSeal: async (extension: string, value: string) => ({ 成功: true, ...await codec.readSeal(extension, Buffer.from(value, 'base64')) }) },
  } as any
  const Probe = () => { state = useAppStore(); return null }
  const mount = () => render(<AntdApp><AppProvider><Probe /></AppProvider></AntdApp>)
  let view = mount()
  await waitFor(() => expect(state.启动恢复结束).toBe(true))
  act(() => state.createDoc('pdf', first, { 路径: 'E:/ledger/source.spdf', 警告: sourceLedger, 文件指纹: 'source-fingerprint' }))
  const id = state.pdfDocuments[0].id
  expect(state.PDF待预览?.警告).toEqual(sourceLedger)
  act(() => { state.更新PDF内容(id, edited); state.保存PDF文档(id, 'E:/ledger/saved.spdf', first, 'stale-save-fingerprint') })
  expect(state.pdfDocuments[0]).toMatchObject({ data: edited, dirty: true, 警告: sourceLedger })
  expect(state.PDF待预览).toMatchObject({ 数据: edited, 警告: sourceLedger })
  const merged = [...sourceLedger, '插入文档来源记录']
  act(() => state.更新PDF内容(id, edited, merged))
  expect(state.PDF待预览?.警告).toEqual(merged)
  act(() => state.保存PDF文档(id, 'E:/ledger/saved.spdf', edited, 'new-fingerprint'))
  expect(state.pdfDocuments[0]).toMatchObject({ data: edited, dirty: false, 警告: merged })
  await act(async () => { expect(await state.刷新工作状态备份()).toEqual({ 成功: true }) })
  const metadata = JSON.parse(backup!).pdfDocuments[0]
  expect(metadata.警告).toEqual(merged); expect(metadata.data).toBeUndefined()
  view.unmount(); view = mount()
  await waitFor(() => expect(state.启动恢复结束).toBe(true))
  expect(readFile).toHaveBeenCalledOnce()
  expect(state.pdfDocuments[0]).toMatchObject({ id, data: edited, 警告: merged, 文件指纹: 'restored-fingerprint' })
  expect(state.PDF待预览).toMatchObject({ 数据: edited, 警告: merged })
  expect((await codec.readSeal('spdf', native)).PDF数据).toBe(edited)
  // Supplying the optional fifth argument intentionally replaces the ledger;
  // omitting it above preserved prior records without dropping concurrent bytes.
  act(() => state.保存PDF文档(id, 'E:/ledger/saved.spdf', edited, 'final-fingerprint', []))
  expect(state.pdfDocuments[0].警告).toEqual([]); expect(state.PDF待预览?.警告).toEqual([])
  view.unmount()
})
