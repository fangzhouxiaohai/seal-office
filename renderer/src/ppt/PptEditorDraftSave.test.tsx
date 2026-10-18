import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import PptEditor from './PptEditor'
import GlobalTabs from '../components/GlobalTabs'
import { AppProvider, useAppStore } from '../store'
import { 创建文本框, 创建演示文稿 } from './deck'
import { 合并文字草稿 } from './textDraft'
import { 构建演示保存模型 } from './saveModel'

const codec = createRequire(import.meta.url)('../../../main/office/pptxCodec.js')
afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

it.each([false, true])('textarea 未失焦直接快捷键保存纳入最新草稿，另存为=%s', async saveAs => {
  const 文本 = '编辑中的中文😀𠀀👩🏽‍💻é\n第二行 &<> "新内容"'
  let 已写入 = ''
  const 编码 = vi.fn(async model => ({ 成功: true, 数据: (await codec.写入pptx(model)).toString('base64') }))
  const 写文件 = vi.fn(async (_path: string, data: string) => { 已写入 = data; return { 成功: true, 文件指纹: 'b'.repeat(64) } })
  const 选路径 = vi.fn(async () => 'E:\\验收\\草稿副本.pptx')
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
    backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })),
    saveToFile: 写文件, showSaveDialog: 选路径,
    office: { writePptx: 编码 },
  } })
  const Entry = () => {
    const state = useAppStore()
    return <>
      <button onClick={() => {
        const model = 创建演示文稿()
        const box = 创建文本框(30, 30, 600, 200, '原文字')
        // 外部打开或已有字符格式的文本同样必须更新，不能让旧片段遮盖草稿。
        box.片段列表 = [{ 文本: '原文字', 加粗: true, 斜体: false, 下划线: false, 颜色: '#CC0000' }]
        model.幻灯片列表[0].文本框列表 = [box]
        state.createDoc('ppt', model, { 路径: 'E:\\验收\\编辑草稿.pptx' })
      }}>打开草稿测试文稿</button>
      {state.module === 'ppt' ? <><PptEditor /><GlobalTabs /></> : null}
    </>
  }
  const { container } = render(<AntdApp><AppProvider><Entry /></AppProvider></AntdApp>)
  fireEvent.click(screen.getByText('打开草稿测试文稿'))
  fireEvent.doubleClick(container.querySelector('.wps-ppt-box')!)
  const input = container.querySelector('.wps-ppt-box__editor') as HTMLTextAreaElement
  const blur = vi.fn(); input.addEventListener('blur', blur)
  expect(document.activeElement).toBe(input)
  fireEvent.change(input, { target: { value: 文本 } })
  fireEvent.keyDown(input, { key: 's', ctrlKey: true, shiftKey: saveAs })
  await waitFor(() => expect(写文件).toHaveBeenCalledOnce())
  expect(编码.mock.calls[0][0].幻灯片[0].文本框[0].text).toBe(文本)
  expect(编码.mock.calls[0][0].幻灯片[0].文本框[0].片段.map((part: { 文本: string }) => part.文本).join('')).toBe(文本)
  expect(blur).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(input)
  expect(input).toHaveValue(文本)
  expect(saveAs ? 选路径.mock.calls.length : 0).toBe(saveAs ? 1 : 0)
  const reopened = await codec.读取pptx(Buffer.from(已写入, 'base64'))
  expect(reopened.演示文稿.幻灯片列表[0].文本框列表[0].text.replace(/\r\n/g, '\n')).toBe(文本)
  await waitFor(() => expect(container.querySelector('.wps-global-tab--active .wps-global-tab__dirty')).toBeNull())
})

it('同步文字草稿保留未改动前后文字的字符格式，未修改时复用原对象', () => {
  const box = 创建文本框(0, 0, 500, 100, '甲乙丙')
  box.片段列表 = [
    { 文本: '甲', 加粗: true, 颜色: '#FF0000' },
    { 文本: '乙', 斜体: true, 颜色: '#00FF00' },
    { 文本: '丙', 下划线: true, 颜色: '#0000FF' },
  ]
  expect(合并文字草稿(box, box.text)).toBe(box)
  const changed = 合并文字草稿(box, '甲新丙')
  expect(changed.片段列表?.map(part => part.文本).join('')).toBe('甲新丙')
  expect(changed.片段列表?.[0]).toEqual({ ...box.片段列表[0], 文本: '甲新' })
  expect(changed.片段列表?.[changed.片段列表.length - 1]).toEqual(box.片段列表[2])
  expect(合并文字草稿(box, '').片段列表).toEqual([])
})

it('Unicode 码点插入删除保留前后格式，合并同样式片段后真实 PPTX 往返不产生替换字符', async () => {
  const unicode = '😀𠀀👩🏽‍💻é'
  const box = 创建文本框(20, 30, 600, 200, `甲${unicode}尾`)
  box.片段列表 = [
    { 文本: '甲', 加粗: true, 颜色: '#FF0000' },
    { 文本: unicode, 斜体: true, 颜色: '#00FF00' },
    { 文本: '尾', 下划线: true, 颜色: '#0000FF' },
  ]
  const inserted = 合并文字草稿(box, `甲😀新增𠀀👩🏽‍💻é尾`)
  const deleted = 合并文字草稿(inserted, `甲𠀀👩🏽‍💻é尾`)
  for (const changed of [inserted, deleted]) {
    expect(changed.片段列表?.map(part => part.文本).join('')).toBe(changed.text)
    expect(changed.片段列表?.[0]).toEqual(box.片段列表[0])
    expect(changed.片段列表?.[changed.片段列表.length - 1]).toEqual(box.片段列表[2])
    expect(changed.片段列表?.length).toBe(3)
    expect(changed.片段列表?.[1].文本).toContain('👩🏽‍💻é')
    const model = 创建演示文稿()
    model.幻灯片列表[0].文本框列表 = [changed]
    const bytes = await codec.写入pptx(构建演示保存模型(model, []))
    const reopened = await codec.读取pptx(bytes)
    const text = reopened.演示文稿.幻灯片列表[0].文本框列表[0].text
    expect(text).toBe(changed.text)
    expect(text).not.toContain('\uFFFD')
  }
})
