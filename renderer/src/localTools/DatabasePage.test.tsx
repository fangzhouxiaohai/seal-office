import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import DatabasePage from './DatabasePage'
import { 桥接 } from '../ipc/bridge'

const 结构 = {
  tables: [{
    name: '客户', type: 'TABLE', primaryKey: ['编号'], indexes: [{ name: 'PrimaryKey', columns: ['编号'], primary: true, unique: true }],
    columns: [
      { name: '编号', type: 'INTEGER', nullable: false, ordinal: 1 },
      { name: '姓名', type: 'TEXT', nullable: false, ordinal: 2 },
    ],
  }],
  queries: [{ name: '在册客户', type: 'VIEW' }], relationships: [],
  提供者: 'Microsoft.ACE.OLEDB.16.0', 位数: 64, 格式代际: 'Access 2007–2024 / Microsoft 365（ACCDB）',
}
const 查询结果 = { columns: [{ name: '编号', type: 'Int32' }, { name: '姓名', type: 'String' }], rows: [{ 编号: 1, 姓名: '张三 🦭' }], truncated: false, rowCount: 1 }

const 渲染 = (初始新建请求?: number) => render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><DatabasePage 初始新建请求={初始新建请求} /></AntdApp></ConfigProvider>)

describe('Access 数据库工作区', () => {
  beforeEach(() => {
    vi.spyOn(桥接.database, 'status').mockResolvedValue({ 成功: true, 可用: true, 平台支持: true, 提供者: [{ 名称: 'Microsoft.ACE.OLEDB.16.0', 位数: 64 }] })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('空状态明确显示 Access 2003 到 Microsoft 365 的兼容边界', async () => {
    渲染()
    expect(screen.getByRole('heading', { name: 'Access 数据库' })).toBeInTheDocument()
    expect(screen.getByText(/Access 2003、2007/)).toBeInTheDocument()
    expect(screen.getByText(/Access 1.0–2002\/XP/)).toBeInTheDocument()
    await waitFor(() => expect(桥接.database.status).toHaveBeenCalled())
  })

  it('打开数据库后展示表、字段和 Unicode 数据', async () => {
    vi.spyOn(桥接.database, 'pick').mockResolvedValue({ 成功: true, 路径: 'C:\\数据\\业务.accdb' })
    const 调用 = vi.spyOn(桥接.database, 'invoke').mockImplementation(async (操作) => {
      if (操作 === 'inspect') return { 成功: true, 数据: 结构 }
      if (操作 === 'readTable') return { 成功: true, 数据: 查询结果 }
      return { 成功: false, 错误: '未预期操作' }
    })
    渲染()
    await userEvent.click(screen.getByRole('button', { name: '打开数据库' }))
    expect(await screen.findByText('张三 🦭')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '客户' })).toBeInTheDocument()
    expect(screen.getByText('Microsoft.ACE.OLEDB.16.0 · 64 位')).toBeInTheDocument()
    expect(调用).toHaveBeenCalledWith('inspect', expect.objectContaining({ 路径: 'C:\\数据\\业务.accdb' }))
    expect(调用).toHaveBeenCalledWith('readTable', expect.objectContaining({ 表名: '客户' }))
  })

  it('从首页新建时默认创建 Access 2007 ACCDB 并打开工作区', async () => {
    const 创建 = vi.spyOn(桥接.database, 'create').mockResolvedValue({ 成功: true, 路径: 'C:\\数据\\新建数据库.accdb' })
    const 调用 = vi.spyOn(桥接.database, 'invoke').mockImplementation(async (操作) => {
      if (操作 === 'inspect') return { 成功: true, 数据: 结构 }
      if (操作 === 'readTable') return { 成功: true, 数据: 查询结果 }
      return { 成功: false, 错误: '未预期操作' }
    })
    渲染(1)
    await waitFor(() => expect(创建).toHaveBeenCalledWith('新建数据库.accdb'))
    expect(await screen.findByText('张三 🦭')).toBeInTheDocument()
    expect(调用).toHaveBeenCalledWith('inspect', expect.objectContaining({ 路径: 'C:\\数据\\新建数据库.accdb' }))
  })

  it('SQL 查询和执行更改使用不同入口', async () => {
    vi.spyOn(桥接.database, 'pick').mockResolvedValue({ 成功: true, 路径: 'C:\\数据\\业务.accdb' })
    const 调用 = vi.spyOn(桥接.database, 'invoke').mockImplementation(async (操作) => {
      if (操作 === 'inspect') return { 成功: true, 数据: 结构 }
      if (操作 === 'readTable' || 操作 === 'query') return { 成功: true, 数据: 查询结果 }
      if (操作 === 'execute') return { 成功: true, 数据: { affectedRows: 1 } }
      return { 成功: false, 错误: '未预期操作' }
    })
    渲染()
    await userEvent.click(screen.getByRole('button', { name: '打开数据库' }))
    await screen.findByText('张三 🦭')
    await userEvent.click(screen.getByRole('tab', { name: 'SQL' }))
    const 编辑器 = screen.getByLabelText('SQL 语句')
    fireEvent.change(编辑器, { target: { value: 'SELECT * FROM [客户]' } })
    await userEvent.click(screen.getByRole('button', { name: '执行查询' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('query', expect.objectContaining({ SQL: 'SELECT * FROM [客户]' })))
  })
})
