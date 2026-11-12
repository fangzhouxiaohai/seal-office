import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import DatabasePage from './DatabasePage'
import { 桥接 } from '../ipc/bridge'

const 结构 = {
  tables: [{
    name: '客户', type: 'TABLE', primaryKey: ['编号'], indexes: [{ name: 'PrimaryKey', columns: ['编号'], primary: true, unique: true }],
    columns: [
      { name: '编号', type: '', dataType: 3, nullable: false, ordinal: 1, autoIncrement: true },
      { name: '姓名', type: '', dataType: 130, maxLength: 50, nullable: false, ordinal: 2 },
      { name: '生日', type: '', dataType: 7, nullable: true, ordinal: 3 },
      { name: '启用', type: '', dataType: 11, nullable: false, ordinal: 4 },
      { name: '余额', type: '', dataType: 6, nullable: true, ordinal: 5 },
    ],
  }],
  queries: [{ name: '在册客户', type: 'VIEW' }], relationships: [],
  提供者: 'Microsoft.ACE.OLEDB.16.0', 位数: 64, 格式代际: 'Access 2007–2024 / Microsoft 365（ACCDB）',
}
const 查询结果 = { columns: [{ name: '编号', type: 'Int32' }, { name: '姓名', type: 'String' }], rows: [{ 编号: 1, 姓名: '张三 🦭' }], truncated: false, rowCount: 1 }

const 渲染 = (初始新建请求?: number) => render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><DatabasePage 初始新建请求={初始新建请求} /></AntdApp></ConfigProvider>)

const 模拟已打开 = (额外: (操作: string, 输入: Record<string, unknown>) => unknown = () => undefined) => {
  vi.spyOn(桥接.database, 'pick').mockResolvedValue({ 成功: true, 路径: 'C:\\数据\\业务.accdb' })
  return vi.spyOn(桥接.database, 'invoke').mockImplementation(async (操作, 输入) => {
    const 自定义 = 额外(操作, 输入)
    if (自定义) return 自定义 as never
    if (操作 === 'inspect') return { 成功: true, 数据: 结构 }
    if (操作 === 'readTable' || 操作 === 'query') return { 成功: true, 数据: 查询结果 }
    return { 成功: true, 数据: { affectedRows: 1 } }
  })
}

const 打开 = async () => {
  await userEvent.click(screen.getByRole('button', { name: '打开数据库' }))
  await screen.findByText('张三 🦭')
}

// antd 在测试环境下所有弹窗共用 aria-labelledby="test-id"，多个弹窗同时打开时按名称查找会命中第一个；
// 确认框标题也会渲染两次。这里按标题文字定位最后打开的弹窗。
const 找弹窗 = (标题: string) => waitFor(() => {
  const 命中 = screen.getAllByRole('dialog').filter((项) => 项.textContent?.includes(标题))
  if (!命中.length) throw new Error(`未找到弹窗：${标题}`)
  return 命中[命中.length - 1]
})

const 选择下拉 = async (组合框: HTMLElement, 选项: string) => {
  fireEvent.mouseDown(组合框)
  const 候选 = await screen.findAllByText(选项, { selector: '.ant-select-item-option-content' })
  fireEvent.click(候选[候选.length - 1])
}

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
    const 调用 = 模拟已打开()
    渲染()
    await 打开()
    expect(screen.getByRole('button', { name: '客户' })).toBeInTheDocument()
    expect(screen.getByText('Microsoft.ACE.OLEDB.16.0 · 64 位')).toBeInTheDocument()
    expect(调用).toHaveBeenCalledWith('inspect', expect.objectContaining({ 路径: 'C:\\数据\\业务.accdb' }))
    expect(调用).toHaveBeenCalledWith('readTable', expect.objectContaining({ 表名: '客户' }))
  })

  it('从首页新建时直接使用主进程回读的结构打开工作区，不再二次 inspect', async () => {
    const 创建 = vi.spyOn(桥接.database, 'create').mockResolvedValue({ 成功: true, 路径: 'C:\\数据\\新建数据库.accdb', 数据: 结构 } as never)
    const 调用 = 模拟已打开()
    渲染(1)
    await waitFor(() => expect(创建).toHaveBeenCalledWith('新建数据库.accdb'))
    expect(await screen.findByText('张三 🦭')).toBeInTheDocument()
    expect(调用).not.toHaveBeenCalledWith('inspect', expect.anything())
    expect(screen.getByTitle('C:\\数据\\新建数据库.accdb')).toBeInTheDocument()
  })

  it('SQL 编辑器默认折叠，展开后查询和执行更改使用不同入口', async () => {
    const 调用 = 模拟已打开()
    渲染()
    await 打开()
    await userEvent.click(screen.getByRole('tab', { name: '查询' }))
    expect(screen.queryByLabelText('SQL 语句')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /手写 SQL（高级）/ }))
    const 编辑器 = screen.getByLabelText('SQL 语句')
    fireEvent.change(编辑器, { target: { value: 'SELECT * FROM [客户]' } })
    await userEvent.click(screen.getByRole('button', { name: '执行查询' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('query', expect.objectContaining({ SQL: 'SELECT * FROM [客户]' })))
  })
})

describe('Access 新建前置检查与错误分类', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('驱动不可用时禁用新建并提示安装 Runtime，首页新建请求也不进入保存对话框', async () => {
    vi.spyOn(桥接.database, 'status').mockResolvedValue({ 成功: true, 可用: false, 平台支持: true, 安装地址: 'https://support.microsoft.com/x' })
    const 创建 = vi.spyOn(桥接.database, 'create')
    渲染(1)
    expect(await screen.findByText('未检测到 Access 数据库引擎')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '新建 ACCDB' })).toBeDisabled())
    expect(await screen.findByText(/当前无法新建 Access 数据库/)).toBeInTheDocument()
    expect(创建).not.toHaveBeenCalled()
  })

  it('状态检测完成前新建按钮不可用，避免用户在未知状态下点击', () => {
    vi.spyOn(桥接.database, 'status').mockReturnValue(new Promise(() => {}))
    渲染()
    expect(screen.getByRole('button', { name: '新建 ACCDB' })).toBeDisabled()
  })

  it('目录不可写时弹窗标题为“无法创建数据库”，不说“打开失败”', async () => {
    vi.spyOn(桥接.database, 'status').mockResolvedValue({ 成功: true, 可用: true, 平台支持: true })
    vi.spyOn(桥接.database, 'create').mockResolvedValue({ 成功: false, 错误类别: '目录不可写', 错误: '所选目录不可写或不存在，无法在此创建数据库，请选择“文档”等有写入权限的目录。', 路径: 'C:\\Program Files\\新建数据库.accdb' })
    渲染()
    await waitFor(() => expect(screen.getByRole('button', { name: '新建 ACCDB' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '新建 ACCDB' }))
    const 弹窗 = await 找弹窗('无法创建数据库')
    expect(within(弹窗).getAllByText('无法创建数据库').length).toBeGreaterThan(0)
    expect(within(弹窗).getByText(/所选目录不可写/)).toBeInTheDocument()
    expect(within(弹窗).queryByText(/打开.*失败/)).not.toBeInTheDocument()
  })

  it('文件已创建但打开失败时单独说明并展示路径与原因', async () => {
    vi.spyOn(桥接.database, 'status').mockResolvedValue({ 成功: true, 可用: true, 平台支持: true })
    vi.spyOn(桥接.database, 'create').mockResolvedValue({ 成功: false, 已创建: true, 路径: 'D:\\库\\新建数据库.accdb', 错误类别: '文件损坏', 错误: '数据库文件已创建但无法打开：D:\\库\\新建数据库.accdb', 原因: '数据库文件已损坏或不是有效的 Access 文件，无法打开。' })
    渲染()
    await waitFor(() => expect(screen.getByRole('button', { name: '新建 ACCDB' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '新建 ACCDB' }))
    const 弹窗 = await 找弹窗('数据库已创建但无法打开')
    expect(within(弹窗).getAllByText('数据库已创建但无法打开').length).toBeGreaterThan(0)
    expect(within(弹窗).getByText('数据库文件已创建但无法打开：D:\\库\\新建数据库.accdb')).toBeInTheDocument()
    expect(within(弹窗).getByText(/文件已损坏/)).toBeInTheDocument()
  })
})

describe('Access 选择式建表', () => {
  beforeEach(() => {
    vi.spyOn(桥接.database, 'status').mockResolvedValue({ 成功: true, 可用: true, 平台支持: true })
  })
  afterEach(() => { vi.restoreAllMocks() })

  const 打开建表 = async () => {
    await userEvent.click(screen.getByRole('button', { name: '新建数据表' }))
    return screen.findByRole('dialog', { name: '新建数据表' })
  }

  it('不输入任何类型名，五步内建好三字段表（编号自动编号主键、名称必填、日期）', async () => {
    const 调用 = 模拟已打开()
    渲染()
    await 打开()
    // 第 1 步：打开建表弹窗（默认已有“编号 自动编号 主键”一行）
    const 弹窗 = await 打开建表()
    // 第 2 步：填表名
    fireEvent.change(within(弹窗).getByLabelText('表名'), { target: { value: '项目' } })
    // 第 3 步：添加字段并填“名称”（默认短文本），打开必填
    await userEvent.click(within(弹窗).getByRole('button', { name: '添加字段' }))
    fireEvent.change(within(弹窗).getByLabelText('第 2 个字段名'), { target: { value: '名称' } })
    await userEvent.click(within(弹窗).getByRole('switch', { name: '第 2 个字段必填' }))
    // 第 4 步：一键追加“创建时间”
    await userEvent.click(within(弹窗).getByRole('button', { name: '+ 创建时间' }))
    // 第 5 步：创建
    await userEvent.click(within(弹窗).getByRole('button', { name: '创建' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('createTable', expect.objectContaining({
      表名: '项目',
      字段: [
        { 名称: '编号', 类型: 'COUNTER', 必填: false },
        { 名称: '名称', 类型: 'TEXT(255)', 必填: true },
        { 名称: '创建时间', 类型: 'DATETIME', 必填: false },
      ],
      主键: ['编号'],
    })))
  })

  it('字段名为空、重名、含非法字符时在输入框旁即时提示并禁止创建', async () => {
    模拟已打开()
    渲染()
    await 打开()
    const 弹窗 = await 打开建表()
    fireEvent.change(within(弹窗).getByLabelText('表名'), { target: { value: '项目' } })
    await userEvent.click(within(弹窗).getByRole('button', { name: '添加字段' }))
    const 第二 = within(弹窗).getByLabelText('第 2 个字段名')
    fireEvent.change(第二, { target: { value: '编号' } })
    expect(within(弹窗).getByText('字段名重复')).toBeInTheDocument()
    expect(第二).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(第二, { target: { value: '金额.合计' } })
    expect(within(弹窗).getByText('字段名不能包含 . ! ` [ ] 等符号')).toBeInTheDocument()
    fireEvent.change(第二, { target: { value: '' } })
    expect(within(弹窗).getByText('请输入字段名')).toBeInTheDocument()
    expect(within(弹窗).getByRole('button', { name: '创建' })).toBeDisabled()
  })

  it('类型下拉显示中文名，长度只在短文本时出现，自动编号由类型决定', async () => {
    模拟已打开()
    渲染()
    await 打开()
    const 弹窗 = await 打开建表()
    await userEvent.click(within(弹窗).getByRole('button', { name: '添加字段' }))
    expect(within(弹窗).getByLabelText('第 2 个字段长度')).toBeInTheDocument()
    expect(within(弹窗).queryByLabelText('第 1 个字段长度')).not.toBeInTheDocument()
    await 选择下拉(within(弹窗).getByRole('combobox', { name: '第 2 个字段类型' }), '日期时间')
    expect(within(弹窗).queryByLabelText('第 2 个字段长度')).not.toBeInTheDocument()
    expect(within(弹窗).getByRole('switch', { name: '第 1 个字段必填' })).toBeDisabled()
    expect(document.body.textContent).not.toMatch(/LONGTEXT|NOT NULL/)
  })

  it('点击“订单记录”模板后字段与约束与模板定义一致', async () => {
    const 调用 = 模拟已打开()
    渲染()
    await 打开()
    const 弹窗 = await 打开建表()
    await userEvent.click(within(弹窗).getByRole('button', { name: '订单记录' }))
    expect(within(弹窗).getByLabelText('表名')).toHaveValue('订单记录')
    await userEvent.click(within(弹窗).getByRole('button', { name: '创建' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('createTable', expect.objectContaining({
      表名: '订单记录',
      字段: [
        { 名称: '订单编号', 类型: 'COUNTER', 必填: false },
        { 名称: '客户名称', 类型: 'TEXT(100)', 必填: true },
        { 名称: '下单日期', 类型: 'DATETIME', 必填: true },
        { 名称: '订单金额', 类型: 'CURRENCY', 必填: true },
        { 名称: '订单状态', 类型: 'TEXT(20)', 必填: false },
        { 名称: '备注', 类型: 'LONGTEXT', 必填: false },
      ],
      主键: ['订单编号'],
    })))
  })

  it('从已有表复制结构带入字段、类型与主键', async () => {
    const 调用 = 模拟已打开()
    渲染()
    await 打开()
    const 弹窗 = await 打开建表()
    await 选择下拉(within(弹窗).getByRole('combobox', { name: '从已有表复制结构' }), '客户')
    fireEvent.change(within(弹窗).getByLabelText('表名'), { target: { value: '客户备份' } })
    await userEvent.click(within(弹窗).getByRole('button', { name: '创建' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('createTable', expect.objectContaining({
      表名: '客户备份',
      字段: [
        { 名称: '编号', 类型: 'COUNTER', 必填: false },
        { 名称: '姓名', 类型: 'TEXT(50)', 必填: true },
        { 名称: '生日', 类型: 'DATETIME', 必填: false },
        { 名称: '启用', 类型: 'YESNO', 必填: false },
        { 名称: '余额', 类型: 'CURRENCY', 必填: false },
      ],
      主键: ['编号'],
    })))
  })
})

describe('Access 表结构编辑', () => {
  beforeEach(() => {
    vi.spyOn(桥接.database, 'status').mockResolvedValue({ 成功: true, 可用: true, 平台支持: true })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('删除字段弹出中文确认，说明该列数据会永久丢失，确认后才调用', async () => {
    const 调用 = 模拟已打开()
    渲染()
    await 打开()
    await userEvent.click(screen.getByRole('tab', { name: '表设计' }))
    await userEvent.click(screen.getByRole('button', { name: '删除字段 余额' }))
    const 确认 = await 找弹窗('删除字段「余额」')
    expect(within(确认).getByText(/该列在全部记录中的数据会被永久删除/)).toBeInTheDocument()
    expect(调用).not.toHaveBeenCalledWith('alterTable', expect.anything())
    await userEvent.click(within(确认).getByRole('button', { name: '删除字段' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('alterTable', expect.objectContaining({ 表名: '客户', 操作: 'dropColumn', 字段名: '余额' })))
  })

  it('改主键先确认影响，再以事务方式提交新主键', async () => {
    const 调用 = 模拟已打开()
    渲染()
    await 打开()
    await userEvent.click(screen.getByRole('tab', { name: '表设计' }))
    await userEvent.click(screen.getByRole('button', { name: '调整主键' }))
    const 弹窗 = await screen.findByRole('dialog', { name: '调整主键' })
    await userEvent.click(within(弹窗).getByRole('switch', { name: '姓名 设为主键' }))
    await userEvent.click(within(弹窗).getByRole('switch', { name: '编号 设为主键' }))
    await userEvent.click(within(弹窗).getByRole('button', { name: '确认更改' }))
    const 确认 = await 找弹窗('确认变更主键')
    expect(within(确认).getByText(/已有记录中存在重复值或空值/)).toBeInTheDocument()
    await userEvent.click(within(确认).getByRole('button', { name: '变更主键' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('alterTable', expect.objectContaining({ 操作: 'setPrimaryKey', 主键: ['姓名'] })))
  })

  it('增加字段、重命名与改类型走选择式弹窗；引擎拒绝时如实显示中文原因', async () => {
    const 调用 = 模拟已打开((操作, 输入) => 操作 === 'alterTable' && 输入.操作 === 'alterColumn'
      ? { 成功: false, 错误类别: '结构冲突', 错误: '现有数据无法转换为所选类型，Access 拒绝了此次类型修改，原数据未改动。' }
      : undefined)
    渲染()
    await 打开()
    await userEvent.click(screen.getByRole('tab', { name: '表设计' }))

    await userEvent.click(screen.getByRole('button', { name: '增加字段' }))
    let 弹窗 = await screen.findByRole('dialog', { name: '增加字段' })
    fireEvent.change(within(弹窗).getByLabelText('字段名'), { target: { value: '积分' } })
    await 选择下拉(within(弹窗).getByRole('combobox', { name: '字段类型' }), '整数')
    await userEvent.click(within(弹窗).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('alterTable', expect.objectContaining({ 操作: 'addColumn', 字段: { 名称: '积分', 类型: 'INTEGER', 必填: false } })))

    await userEvent.click(screen.getByRole('button', { name: '修改字段 姓名' }))
    弹窗 = await screen.findByRole('dialog', { name: '修改字段「姓名」' })
    fireEvent.change(within(弹窗).getByLabelText('字段名'), { target: { value: '客户姓名' } })
    await 选择下拉(within(弹窗).getByRole('combobox', { name: '字段类型' }), '日期时间')
    await userEvent.click(within(弹窗).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('alterTable', expect.objectContaining({ 操作: 'alterColumn', 字段: { 名称: '姓名', 类型: 'DATETIME', 必填: true } })))
    expect(await screen.findByText(/现有数据无法转换为所选类型/)).toBeInTheDocument()
    // 改类型失败时不继续执行重命名，避免半途状态
    expect(调用).not.toHaveBeenCalledWith('alterTable', expect.objectContaining({ 操作: 'renameColumn' }))
  })

  it('自动编号字段的类型下拉不提供“自动编号”以外的修改，已有字段也不能改为自动编号', async () => {
    模拟已打开()
    渲染()
    await 打开()
    await userEvent.click(screen.getByRole('tab', { name: '表设计' }))
    await userEvent.click(screen.getByRole('button', { name: '修改字段 姓名' }))
    const 弹窗 = await screen.findByRole('dialog', { name: '修改字段「姓名」' })
    fireEvent.mouseDown(within(弹窗).getByRole('combobox', { name: '字段类型' }))
    const 选项 = await screen.findAllByText('自动编号', { selector: '.ant-select-item-option-content' })
    expect(选项[选项.length - 1].closest('.ant-select-item-option')).toHaveClass('ant-select-item-option-disabled')
  })
})

describe('Access 常用查询与类型驱动录入', () => {
  beforeEach(() => {
    vi.spyOn(桥接.database, 'status').mockResolvedValue({ 成功: true, 可用: true, 平台支持: true })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('常用查询标签点击后直接出结果，无需手写 SQL', async () => {
    const 调用 = 模拟已打开((操作, 输入) => 操作 === 'query' && String(输入.SQL).startsWith('SELECT COUNT')
      ? { 成功: true, 数据: { columns: [{ name: '行数', type: 'Int32' }], rows: [{ 行数: 42 }], truncated: false, rowCount: 1 } }
      : undefined)
    渲染()
    await 打开()
    await userEvent.click(screen.getByRole('tab', { name: '查询' }))
    await userEvent.click(screen.getByRole('button', { name: '统计行数' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('query', expect.objectContaining({ SQL: 'SELECT COUNT(*) AS [行数] FROM [客户]', 参数: [] })))
    expect(await screen.findByText('42')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: '查询' }))
    await userEvent.click(screen.getByRole('button', { name: '最近 100 条' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('query', expect.objectContaining({ SQL: 'SELECT TOP 100 * FROM [客户] ORDER BY [编号] DESC' })))
  })

  it('按条件筛选用下拉选字段和运算，值以参数传递', async () => {
    const 调用 = 模拟已打开()
    渲染()
    await 打开()
    await userEvent.click(screen.getByRole('tab', { name: '查询' }))
    await userEvent.click(screen.getByRole('button', { name: '按条件筛选' }))
    await 选择下拉(screen.getByRole('combobox', { name: '筛选字段' }), '姓名')
    await 选择下拉(screen.getByRole('combobox', { name: '筛选方式' }), '包含')
    fireEvent.change(screen.getByLabelText('筛选值'), { target: { value: "O'张" } })
    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('query', expect.objectContaining({ SQL: 'SELECT * FROM [客户] WHERE [姓名] LIKE ?', 参数: ["%O'张%"] })))
  })

  it('命令模板下拉把语句插入展开的 SQL 编辑器', async () => {
    模拟已打开()
    渲染()
    await 打开()
    await userEvent.click(screen.getByRole('tab', { name: '查询' }))
    await 选择下拉(screen.getByRole('combobox', { name: '插入命令模板' }), '删除 DELETE')
    expect(screen.getByLabelText('SQL 语句')).toHaveValue('DELETE FROM [客户] WHERE [编号] = 1;')
  })

  it('新增记录按字段类型渲染：自动编号只读、日期选择、是/否开关、货币数字输入', async () => {
    const 调用 = 模拟已打开()
    渲染()
    await 打开()
    await userEvent.click(screen.getByRole('button', { name: '新增记录' }))
    const 弹窗 = await screen.findByRole('dialog', { name: '新增「客户」记录' })
    expect(within(弹窗).getByLabelText('编号')).toBeDisabled()
    expect(within(弹窗).getByPlaceholderText('自动生成')).toBeInTheDocument()
    expect(within(弹窗).getByLabelText('生日')).toHaveAttribute('type', 'datetime-local')
    expect(within(弹窗).getByRole('switch', { name: '启用' })).toBeInTheDocument()
    expect(within(弹窗).getByRole('spinbutton', { name: '余额' })).toBeInTheDocument()
    fireEvent.change(within(弹窗).getByLabelText('姓名'), { target: { value: '李四' } })
    fireEvent.change(within(弹窗).getByLabelText('生日'), { target: { value: '2001-02-03T04:05' } })
    await userEvent.click(within(弹窗).getByRole('switch', { name: '启用' }))
    fireEvent.change(within(弹窗).getByRole('spinbutton', { name: '余额' }), { target: { value: '12.5' } })
    await userEvent.click(within(弹窗).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(调用).toHaveBeenCalledWith('insert', expect.objectContaining({
      表名: '客户', 值: { 姓名: '李四', 生日: '2001-02-03 04:05:00', 启用: true, 余额: 12.5 },
    })))
  })
})
