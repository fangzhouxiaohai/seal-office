import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp, ConfigProvider, Modal } from 'antd'
import SheetEditor from './SheetEditor'
import { AppProvider, useAppStore } from '../store'
import { 读取本地文件内容 } from '../fileOpen'
import { 保存全部文档 } from '../editor/saveAll'
import { 创建工作表, 写入单元格, type Sheet } from './model'

const codec = createRequire(import.meta.url)('../../../main/office/sealFormat.js')
const original = window.electronAPI
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
afterEach(() => { window.electronAPI = original; Modal.destroyAll() })

it.each(['slxls', 'sealsheet'])('%s 的原生表格 UI 连续保存完整模型，不受 XLSX 兼容性约束且清除未保存标记', async extension => {
  const path = `E:/native/连续编辑.${extension}`
  // The native model is allowed to retain exact per-sheet source metadata. This
  // combination deliberately cannot pass the OOXML workbook export preflight.
  const first = { ...写入单元格(创建工作表('源数据', 4, 4), 'A1', '旧文本'), 日期系统1904: true, 公式兼容模式: 'WPS' as const }
  const blank = 创建工作表('预留空表', 4, 4)
  let bytes = await codec.writeSeal('table', { 工作表列表: [first, blank], 警告: [] })
  const writeXlsx = vi.fn(() => { throw new Error('不应调用 XLSX 写出器') })
  const save = vi.fn(async (_path: string, content: string | Uint8Array, _format: string, fingerprint: string) => {
    expect(_path).toBe(path); expect(fingerprint).toBe(hash(bytes))
    bytes = typeof content === 'string' ? Buffer.from(content, 'base64') : Buffer.from(content)
    return { 成功: true, 文件指纹: hash(bytes) }
  })
  window.electronAPI = { backupLoad: async () => ({ 成功: true, 内容: null }), backupSave: async () => ({ 成功: true }), backupClear: async () => ({ 成功: true }), recentAdd: async () => ({ 成功: true, 数据: [] }),
    readFile: async () => ({ 成功: true, 内容: bytes.toString('base64'), 二进制: true, 扩展名: extension, 文件指纹: hash(bytes) }), saveToFile: save,
    office: { writeXlsx, readSeal: async (ext: string, data: string) => ({ 成功: true, ...await codec.readSeal(ext, Buffer.from(data, 'base64')) }), writeSeal: async (type: string, payload: unknown) => ({ 成功: true, 数据: (await codec.writeSeal(type, payload)).toString('base64') }) },
  } as any
  function Host() {
    const store = useAppStore()
    return <><button onClick={async () => { const parsed = await 读取本地文件内容(path); store.createDoc('table', parsed.工作表列表, { 路径: path, 文件指纹: parsed.文件指纹 }) }}>打开本机表格</button><output data-testid="native-sheet-state">{JSON.stringify({ tabs: store.workspaceTabs, model: store.activeDocumentId ? store.表格文档模型[store.activeDocumentId] : null })}</output>{store.module === 'table' ? <SheetEditor /> : null}</>
  }
  render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><Host /></AppProvider></AntdApp></ConfigProvider>)
  fireEvent.click(screen.getByText('打开本机表格'))
  const formula = await screen.findByLabelText('公式栏')
  for (let cycle = 0; cycle < 2; cycle++) {
    const text = `连续修改${cycle + 1} 中文𠀀 e\u0301 👩🏽‍💻 العربية`
    fireEvent.change(formula, { target: { value: text } })
    if (cycle === 0) fireEvent.keyDown(formula, { key: 's', ctrlKey: true })
    else fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(cycle + 1))
    await waitFor(() => expect(JSON.parse(screen.getByTestId('native-sheet-state').textContent!).tabs[0].dirty).toBe(false))
    const expected: Sheet[] = JSON.parse(screen.getByTestId('native-sheet-state').textContent!).model
    const reopened = await 读取本地文件内容(path)
    expect(reopened.工作表列表).toEqual(expected)
    expect(expected[0].单元格.A1.原始值).toBe(text)
    expect(expected[0].日期系统1904).toBe(true); expect(expected[0].公式兼容模式).toBe('WPS')
    expect(expected[1].name).toBe('预留空表'); expect(expected[1].单元格).toEqual({})
  }
  expect(writeXlsx).not.toHaveBeenCalled()
})

it('关闭时保存默认空 slxls 工作簿成功，不以 XLSX 的空模型阻止退出', async () => {
  const source = [创建工作表('空一'), 创建工作表('空二')]
  let encoded = ''
  const save = vi.fn(async (_path: string, value: string) => { encoded = value; return { 成功: true, 文件指纹: 'empty-saved' } })
  const writeXlsx = vi.fn(() => { throw new Error('不应调用 XLSX 写出器') })
  window.electronAPI = { saveToFile: save, office: { writeXlsx, writeSeal: async (type: string, payload: unknown) => ({ 成功: true, 数据: (await codec.writeSeal(type, payload)).toString('base64') }) } } as any
  const result = await 保存全部文档([{ 标识: 'empty-native', 名称: '空表.slxls', 类型: 'table', 路径: 'E:/native/空表.slxls', 表格模型: source }])
  expect(result.失败).toEqual([]); expect(result.已保存).toHaveLength(1)
  expect((await codec.readSeal('slxls', Buffer.from(encoded, 'base64'))).工作表列表).toEqual(source)
  expect(writeXlsx).not.toHaveBeenCalled()
})
