import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import { AppProvider, useAppStore, type AppState } from '../store'
import PptEditor from './PptEditor'
import { 创建演示文稿 } from './deck'
import { 校验演示文稿 } from './model/migrations'
import { 导出为Html预览 } from './deckExport'
import { 创建公式 } from './model/formulas'
import { 创建附件 } from './model/attachments'
import { 搜索符号 } from './model/symbols'
import crypto from 'node:crypto'

const 附件字节 = Buffer.from('附件真实内容', 'utf8')
const 附件标识 = crypto.createHash('sha256').update(附件字节).digest('hex')

function 安装桥接() {
  const 资源 = new Map<string, string>([[附件标识, 附件字节.toString('base64')]])
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })),
      recentAdd: vi.fn(async () => ({ 成功: true })),
      showSaveDialog: vi.fn(async () => 'E:\\Temp\\公式与附件.pptx'),
      saveToFile: vi.fn(async () => ({ 成功: true })),
      office: { writePptx: vi.fn(async () => ({ 成功: true })) },
      presentationResources: {
        add: vi.fn(async (数据: string) => {
          const 标识 = crypto.createHash('sha256').update(Buffer.from(数据, 'base64')).digest('hex')
          资源.set(标识, 数据)
          return { 成功: true, 标识, 字节数: Buffer.from(数据, 'base64').length, 类型: 'application/vnd.openxmlformats-officedocument.oleObject' }
        }),
        read: vi.fn(async (标识: string) => 资源.has(标识) ? { 成功: true, 数据: 资源.get(标识) } : { 成功: false, 错误: '附件字节不存在' }),
        dropTemporary: vi.fn(async () => ({ 成功: true })),
        sync: vi.fn(async () => ({ 成功: true })),
        release: vi.fn(async () => ({ 成功: true })),
        export: vi.fn(async () => ({ 成功: true, 条目: [] })),
        restore: vi.fn(async () => ({ 成功: true })),
      },
    },
  })
}

async function 装配() {
  安装桥接()
  let 状态: AppState
  function 入口() { 状态 = useAppStore(); return <PptEditor/> }
  const 视图 = render(<AntdApp><AppProvider><入口/></AppProvider></AntdApp>)
  await waitFor(() => expect(状态.启动恢复结束).toBe(true))
  const 文稿 = 创建演示文稿('公式核验')
  act(() => 状态.createDoc('ppt', 文稿))
  return { ...视图, 状态: () => 状态, 读取: () => 状态.演示文档模型[状态.activeDocumentId!] }
}

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI'); vi.restoreAllMocks(); vi.clearAllMocks() })

it('公式面板插入原生公式对象并可修改选中公式', async () => {
  const { container, 读取 } = await 装配()
  await userEvent.click(screen.getByRole('tab', { name: '插入' }))
  await userEvent.click(screen.getByRole('button', { name: '公式' }))
  fireEvent.change(screen.getByLabelText('公式表达式'), { target: { value: '\\frac{a^2}{\\sqrt{b}}' } })
  await userEvent.click(screen.getByRole('button', { name: '插入新公式' }))
  const 对象 = 读取().幻灯片列表[0].对象列表![0]
  expect(对象.类型).toBe('公式')
  expect(对象.公式!.表达式).toBe('\\frac{a^2}{\\sqrt{b}}')
  expect(container.querySelector('.wps-ppt-formula__frac')).toBeTruthy()

  fireEvent.mouseDown(container.querySelector(`[data-对象标识="${对象.id}"]`)!, { button: 0 })
  fireEvent.mouseUp(window)
  fireEvent.change(screen.getByLabelText('公式表达式'), { target: { value: 'y_{i}^{2}' } })
  await userEvent.click(screen.getByRole('button', { name: '应用到选中公式' }))
  expect(读取().幻灯片列表[0].对象列表![0].公式!.表达式).toBe('y_{i}^{2}')
})

it('不支持的公式语法给出真实原因且不插入对象', async () => {
  const { 读取 } = await 装配()
  await userEvent.click(screen.getByRole('tab', { name: '插入' }))
  await userEvent.click(screen.getByRole('button', { name: '公式' }))
  fireEvent.change(screen.getByLabelText('公式表达式'), { target: { value: '\\int_0^1 x' } })
  await userEvent.click(screen.getByRole('button', { name: '插入新公式' }))
  expect(await screen.findByText(/公式语法不支持/)).toBeTruthy()
  expect(读取().幻灯片列表[0].对象列表 ?? []).toHaveLength(0)
})

it('符号面板按分类与关键词检索后按普通文字插入', async () => {
  const { 读取 } = await 装配()
  await userEvent.click(screen.getByRole('tab', { name: '插入' }))
  await userEvent.click(screen.getByRole('button', { name: '符号' }))
  expect(screen.getByLabelText('符号分类')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('搜索符号'), { target: { value: '求和' } })
  const 命中 = 搜索符号('求和')
  expect(命中).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: `插入符号 ${命中[0].名称}` }))
  const 框 = 读取().幻灯片列表[0].文本框列表[读取().幻灯片列表[0].文本框列表.length - 1]
  expect(框.text).toBe('∑')
  expect(框.字体).toBeTruthy()
})

it('附件按真实字节嵌入并可导出原文件，宏扩展名给出风险提示', async () => {
  const { 读取 } = await 装配()
  const 创建对象URL = vi.fn(() => 'blob:附件')
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: 创建对象URL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  await userEvent.click(screen.getByRole('tab', { name: '插入' }))
  await userEvent.click(screen.getByRole('button', { name: '附件' }))
  const 输入 = document.querySelector('input[aria-label="选择附件文件"]') as HTMLInputElement
  const 文件 = new File([附件字节], '数据.xlsm', { type: 'application/octet-stream' })
  fireEvent.change(输入, { target: { files: [文件] } })
  await waitFor(() => expect((读取().幻灯片列表[0].对象列表 ?? []).length).toBe(1))
  const 对象 = 读取().幻灯片列表[0].对象列表![0]
  expect(对象.类型).toBe('附件')
  expect(对象.附件!.文件名).toBe('数据.xlsm')
  expect(读取().资源索引![对象.附件!.资源标识]).toMatchObject({ 类型: 'application/vnd.openxmlformats-officedocument.oleObject', 字节数: 附件字节.length })
  expect(await screen.findByText(/可能包含宏或脚本/)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: '导出原附件' }))
  await waitFor(() => expect(创建对象URL).toHaveBeenCalled())
})

it('导出预览渲染公式与附件内容且不写入编辑控件', async () => {
  const 文稿 = 创建演示文稿('渲染核验')
  文稿.幻灯片列表[0].对象列表 = [
    创建公式('\\frac{1}{n}'),
    创建附件('说明.txt', '说明附件', 附件标识, 附件字节.length),
    { id: '图示-1', 类型: '图示', x: 100, y: 100, width: 240, height: 150, 图示: { 显示文本: '流程节点', 资源标识: 附件标识, 关系: [{ 角色: 'dm', 部件路径: 'ppt/diagrams/data1.xml' }] } },
  ]
  文稿.资源索引 = { [附件标识]: { 指纹: 附件标识, 类型: 'application/vnd.openxmlformats-officedocument.oleObject', 字节数: 附件字节.length } }
  const html = 导出为Html预览(文稿, '渲染核验')
  expect(html).toContain('wps-ppt-formula__frac')
  expect(html).toContain('说明附件')
  expect(html).toContain('原生图示')
  expect(html).toContain('流程节点')
  expect(html).not.toContain('contenteditable')
})

it('模型校验接受公式、附件与图示，缺失资源时拒绝加载', () => {
  const 文稿 = 创建演示文稿('校验')
  文稿.幻灯片列表[0].对象列表 = [创建公式('x^2')]
  文稿.资源索引 = { [附件标识]: { 指纹: 附件标识, 类型: 'application/vnd.openxmlformats-officedocument.oleObject', 字节数: 附件字节.length } }
  文稿.幻灯片列表[0].对象列表!.push(创建附件('说明.txt', '说明附件', 附件标识, 附件字节.length))
  expect(() => 校验演示文稿(JSON.parse(JSON.stringify(文稿)))).not.toThrow()
  const 损坏 = JSON.parse(JSON.stringify(文稿))
  损坏.资源索引 = {}
  expect(() => 校验演示文稿(损坏)).toThrow(/附件数据或资源无效/)
})
