import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, App as AntdApp, Button, Card, Descriptions, Empty, Form, Input, Modal, Select, Space, Spin, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { 桥接, type Access单元格值, type Access字段信息, type Access数据库结构, type Access数据库状态, type Access查询结果 } from '../ipc/bridge'
import { 解析邮件合并CSV } from '../editor/mailMerge'
import { 下载本地内容 } from './download'
import './localTools.css'

type 数据行 = Record<string, Access单元格值>
type 行模式 = { 类型: '新增' } | { 类型: '编辑'; 原始行: 数据行 }

const ACCESS_RUNTIME_URL = 'https://support.microsoft.com/zh-cn/access/download-and-install-microsoft-365-access-runtime'

function 显示值(值: Access单元格值 | undefined): string {
  if (值 === null || 值 === undefined) return 'NULL'
  if (typeof 值 === 'object') return `[二进制 ${值.length} 字节]`
  if (typeof 值 === 'boolean') return 值 ? '是' : '否'
  return String(值)
}

function 转义Csv(值: Access单元格值 | undefined): string {
  const 文本 = 显示值(值)
  return /[",\r\n]/.test(文本) ? `"${文本.replace(/"/g, '""')}"` : 文本
}

function 安全文件名(名称: string): string {
  return 名称.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '') || 'Access数据'
}

function 是自动编号字段(字段: Access字段信息): boolean {
  return /COUNTER|AUTOINCREMENT/i.test(字段.type)
}

function 表单值转数据库值(字段: Access字段信息, 值: unknown): Access单元格值 {
  if (值 === undefined || 值 === null) return null
  if (/YESNO|BOOLEAN|BIT/i.test(字段.type)) return 值 === true || 值 === 'true' || 值 === '是' || 值 === 1
  if (/BYTE|SHORT|INTEGER|LONG|SINGLE|DOUBLE|DECIMAL|NUMERIC|CURRENCY|BIGINT/i.test(字段.type)) {
    if (值 === '') return null
    const 数字 = Number(值)
    if (!Number.isFinite(数字)) throw new Error(`字段「${字段.name}」必须是有效数字`)
    return 数字
  }
  return String(值)
}

function 解析建表字段(文本: string): { 字段: Array<{ 名称: string; 类型: string; 必填: boolean }>; 主键: string[] } {
  const 行 = 文本.split(/\r?\n/).map((项) => 项.trim()).filter(Boolean)
  if (行.length === 0) throw new Error('请至少输入一个字段')
  const 字段: Array<{ 名称: string; 类型: string; 必填: boolean }> = []
  const 主键: string[] = []
  for (const [序号, 内容] of 行.entries()) {
    const 匹配 = 内容.match(/^(.+?)\s+(TEXT\(\d{1,3}\)|LONGTEXT|BYTE|SHORT|INTEGER|LONG|SINGLE|DOUBLE|DECIMAL(?:\(\d{1,2},\d{1,2}\))?|CURRENCY|DATETIME|YESNO|GUID|LONGBINARY|COUNTER)(.*)$/i)
    if (!匹配) throw new Error(`第 ${序号 + 1} 行格式无效，应为“字段名 类型 [PK] [NOT NULL]”`)
    const 名称 = 匹配[1].trim().replace(/^\[(.*)\]$/, '$1')
    const 标记 = 匹配[3].toUpperCase()
    字段.push({ 名称, 类型: 匹配[2].toUpperCase(), 必填: /\bNOT\s+NULL\b/.test(标记) })
    if (/\bPK\b|\bPRIMARY\s+KEY\b/.test(标记)) 主键.push(名称)
  }
  return { 字段, 主键 }
}

function 数据列(结果: Access查询结果): ColumnsType<数据行> {
  return 结果.columns.map((字段) => ({
    title: 字段.name,
    dataIndex: 字段.name,
    key: 字段.name,
    width: Math.min(Math.max(字段.name.length * 16 + 72, 140), 280),
    ellipsis: { showTitle: false },
    render: (值: Access单元格值) => <Tooltip title={显示值(值)}><Typography.Text ellipsis>{显示值(值)}</Typography.Text></Tooltip>,
  }))
}

interface DatabasePageProps {
  /** 首页“新建 Access”每点击一次递增；同一请求只执行一次。 */
  初始新建请求?: number
  on初始新建已处理?: () => void
}

export default function DatabasePage({ 初始新建请求, on初始新建已处理 }: DatabasePageProps) {
  const { message, modal } = AntdApp.useApp()
  const [状态, 设状态] = useState<Access数据库状态 | null>(null)
  const [数据库路径, 设数据库路径] = useState('')
  const [数据库密码, 设数据库密码] = useState('')
  const [工作组文件, 设工作组文件] = useState('')
  const [用户名, 设用户名] = useState('')
  const [用户密码, 设用户密码] = useState('')
  const [结构, 设结构] = useState<Access数据库结构 | null>(null)
  const [当前表名, 设当前表名] = useState('')
  const [数据, 设数据] = useState<Access查询结果 | null>(null)
  const [忙碌, 设忙碌] = useState(false)
  const [活动页, 设活动页] = useState('data')
  const [选中行, 设选中行] = useState<数据行 | null>(null)
  const [SQL, 设SQL] = useState('SELECT TOP 100 * FROM [表名];')
  const [查询标题, 设查询标题] = useState('数据记录')
  const [行弹窗, 设行弹窗] = useState<行模式 | null>(null)
  const [建表弹窗, 设建表弹窗] = useState(false)
  const [导入数据, 设导入数据] = useState<{ 字段: string[]; 记录: Record<string, string>[]; 文件名: string } | null>(null)
  const [行表单] = Form.useForm<Record<string, string | number | boolean | undefined>>()
  const [建表表单] = Form.useForm<{ 表名: string; 字段: string }>()
  const [导入表单] = Form.useForm<{ 表名: string; 新建表: boolean }>()
  const 导入引用 = useRef<HTMLInputElement>(null)
  const 已处理初始新建请求 = useRef<number | undefined>(undefined)

  const 当前表 = useMemo(() => 结构?.tables.find((表) => 表.name === 当前表名) ?? null, [结构, 当前表名])
  const 是当前表数据 = Boolean(当前表 && 查询标题 === `${当前表.name} 数据`)
  const 主键可编辑 = Boolean(是当前表数据 && 当前表 && 当前表.primaryKey.length > 0)
  const 取得行键 = (行: 数据行): string => 当前表?.primaryKey.length
    ? JSON.stringify(当前表.primaryKey.map((名称) => 行[名称]))
    : `row-${数据?.rows.indexOf(行) ?? -1}`

  useEffect(() => {
    void 桥接.database.status().then(设状态)
  }, [])

  const 请求输入 = (额外: Record<string, unknown> = {}) => ({ 路径: 数据库路径, 数据库密码, 工作组文件, 用户名, 用户密码, ...额外 })

  const 显示失败 = (标题: string, 结果: { 错误?: string; 安装地址?: string; 需要旧版转换?: boolean }) => {
    modal.error({
      title: 标题,
      content: <div><p>{结果.错误 || '数据库操作失败'}</p>{结果.安装地址 && !结果.需要旧版转换 ? <Button type="link" onClick={() => void 桥接.openExternal(结果.安装地址 || ACCESS_RUNTIME_URL)}>下载 Microsoft 365 Access Runtime</Button> : null}</div>,
    })
  }

  const 读取结构 = async (路径: string, 密码 = 数据库密码): Promise<boolean> => {
    设忙碌(true)
    try {
      const 结果 = await 桥接.database.invoke<Access数据库结构>('inspect', { 路径, 数据库密码: 密码, 工作组文件, 用户名, 用户密码 })
      if (!结果.成功 || !结果.数据) { 显示失败('打开 Access 数据库失败', 结果); return false }
      设数据库路径(路径)
      设结构(结果.数据)
      const 首表 = 结果.数据.tables[0]?.name || ''
      设当前表名(首表)
      设数据(null)
      设选中行(null)
      设查询标题(首表 ? `${首表} 数据` : '数据记录')
      if (首表) await 读取表(路径, 首表, 密码)
      return true
    } finally {
      设忙碌(false)
    }
  }

  const 读取表 = async (路径: string, 表名: string, 密码 = 数据库密码) => {
    const 结果 = await 桥接.database.invoke<Access查询结果>('readTable', { 路径, 数据库密码: 密码, 工作组文件, 用户名, 用户密码, 表名, 最大行数: 1000 })
    if (!结果.成功 || !结果.数据) { 显示失败('读取数据表失败', 结果); return }
    设数据(结果.数据)
    设查询标题(`${表名} 数据`)
    设选中行(null)
  }

  const 打开数据库 = async () => {
    const 选择 = await 桥接.database.pick()
    if (!选择.成功) { 显示失败('选择数据库失败', 选择); return }
    if (选择.已取消 || !选择.路径) return
    await 读取结构(选择.路径)
  }

  const 创建数据库 = async () => {
    const 结果 = await 桥接.database.create('新建数据库.accdb')
    if (!结果.成功) { 显示失败('创建数据库失败', 结果); return }
    if (结果.已取消 || !结果.路径) return
    message.success('Access 数据库已创建')
    await 读取结构(结果.路径, '')
  }

  useEffect(() => {
    if (初始新建请求 === undefined || 已处理初始新建请求.current === 初始新建请求) return
    已处理初始新建请求.current = 初始新建请求
    on初始新建已处理?.()
    void 创建数据库()
  }, [初始新建请求, on初始新建已处理])

  const 选择表 = async (表名: string) => {
    设当前表名(表名)
    设活动页('data')
    设忙碌(true)
    try { await 读取表(数据库路径, 表名) } finally { 设忙碌(false) }
  }

  const 执行查询 = async () => {
    设忙碌(true)
    try {
      const 结果 = await 桥接.database.invoke<Access查询结果>('query', 请求输入({ SQL, 最大行数: 5000 }))
      if (!结果.成功 || !结果.数据) { 显示失败('执行查询失败', 结果); return }
      设数据(结果.数据)
      设查询标题('SQL 查询结果')
      设活动页('data')
      设选中行(null)
      message.success(`查询完成，共读取 ${结果.数据.rowCount} 行`)
    } finally { 设忙碌(false) }
  }

  const 执行更改 = () => {
    modal.confirm({
      title: '确认执行数据库更改',
      content: '该 SQL 可能修改表结构或数据。Access 文件会被直接写入，请先确认已有备份。',
      okText: '执行更改',
      cancelText: '取消',
      onOk: async () => {
        const 结果 = await 桥接.database.invoke<{ affectedRows: number }>('execute', 请求输入({ SQL }))
        if (!结果.成功) { 显示失败('执行数据库更改失败', 结果); throw new Error(结果.错误) }
        message.success(`数据库更改已完成，影响 ${结果.数据?.affectedRows ?? 0} 行`)
        await 读取结构(数据库路径)
      },
    })
  }

  const 打开行弹窗 = (模式: 行模式) => {
    if (!当前表) return
    设行弹窗(模式)
    const 初始值: Record<string, string | number | boolean | undefined> = {}
    for (const 字段 of 当前表.columns) {
      const 值 = 模式.类型 === '编辑' ? 模式.原始行[字段.name] : undefined
      if (typeof 值 !== 'object') 初始值[字段.name] = 值 ?? undefined
    }
    行表单.setFieldsValue(初始值)
  }

  const 保存行 = async () => {
    if (!当前表 || !行弹窗) return
    const 表单值 = await 行表单.validateFields()
    const 值: Record<string, Access单元格值> = {}
    for (const 字段 of 当前表.columns) {
      if (是自动编号字段(字段) || typeof 表单值[字段.name] === 'object') continue
      if (行弹窗.类型 === '编辑' && 当前表.primaryKey.includes(字段.name)) continue
      if (表单值[字段.name] === undefined && 行弹窗.类型 === '新增') continue
      值[字段.name] = 表单值转数据库值(字段, 表单值[字段.name])
    }
    const 操作 = 行弹窗.类型 === '新增' ? 'insert' : 'update'
    const 主键 = 行弹窗.类型 === '编辑' ? Object.fromEntries(当前表.primaryKey.map((名称) => [名称, 行弹窗.原始行[名称]])) : undefined
    const 结果 = await 桥接.database.invoke<{ affectedRows: number }>(操作, 请求输入({ 表名: 当前表.name, 值, 主键 }))
    if (!结果.成功) { 显示失败(行弹窗.类型 === '新增' ? '新增记录失败' : '保存记录失败', 结果); return }
    message.success(行弹窗.类型 === '新增' ? '记录已新增' : '记录已保存')
    设行弹窗(null)
    行表单.resetFields()
    await 读取表(数据库路径, 当前表.name)
  }

  const 删除行 = () => {
    if (!当前表 || !选中行 || !主键可编辑) return
    modal.confirm({
      title: '删除所选记录',
      content: `将按主键 ${当前表.primaryKey.join('、')} 删除该记录。此操作会直接写入数据库。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const 主键 = Object.fromEntries(当前表.primaryKey.map((名称) => [名称, 选中行[名称]]))
        const 结果 = await 桥接.database.invoke<{ affectedRows: number }>('delete', 请求输入({ 表名: 当前表.name, 主键 }))
        if (!结果.成功) { 显示失败('删除记录失败', 结果); throw new Error(结果.错误) }
        message.success('记录已删除')
        await 读取表(数据库路径, 当前表.name)
      },
    })
  }

  const 创建数据表 = async () => {
    const 值 = await 建表表单.validateFields()
    const 定义 = 解析建表字段(值.字段)
    const 结果 = await 桥接.database.invoke<{ affectedRows: number }>('createTable', 请求输入({ 表名: 值.表名, ...定义 }))
    if (!结果.成功) { 显示失败('创建数据表失败', 结果); return }
    message.success(`数据表「${值.表名}」已创建`)
    设建表弹窗(false)
    建表表单.resetFields()
    await 读取结构(数据库路径)
  }

  const 删除当前表 = () => {
    if (!当前表) return
    modal.confirm({
      title: `删除数据表「${当前表.name}」`,
      content: '表结构和全部记录都会被永久删除，请确认已有备份。',
      okText: '删除数据表',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const 结果 = await 桥接.database.invoke<{ affectedRows: number }>('dropTable', 请求输入({ 表名: 当前表.name }))
        if (!结果.成功) { 显示失败('删除数据表失败', 结果); throw new Error(结果.错误) }
        message.success('数据表已删除')
        await 读取结构(数据库路径)
      },
    })
  }

  const 读取Csv = async (文件: File) => {
    try {
      const 数据源 = 解析邮件合并CSV(await 文件.text())
      设导入数据({ ...数据源, 文件名: 文件.name })
      导入表单.setFieldsValue({ 表名: 文件.name.replace(/\.csv$/i, '') || '导入数据', 新建表: true })
    } catch (错误) {
      modal.error({ title: '读取 CSV 失败', content: 错误 instanceof Error ? 错误.message : 'CSV 文件格式无效' })
    }
  }

  const 导入Csv = async () => {
    if (!导入数据) return
    const 表单值 = await 导入表单.validateFields()
    const 结果 = await 桥接.database.invoke<{ affectedRows: number }>('importRows', 请求输入({ 表名: 表单值.表名, 字段: 导入数据.字段, 记录: 导入数据.记录, 新建表: 表单值.新建表 }))
    if (!结果.成功) { 显示失败('导入 CSV 失败', 结果); return }
    message.success(`已导入 ${结果.数据?.affectedRows ?? 导入数据.记录.length} 行`)
    设导入数据(null)
    导入表单.resetFields()
    await 读取结构(数据库路径)
  }

  const 导出结果 = () => {
    if (!数据) return
    const 表头 = 数据.columns.map((列) => 转义Csv(列.name)).join(',')
    const 内容 = [表头, ...数据.rows.map((行) => 数据.columns.map((列) => 转义Csv(行[列.name])).join(','))].join('\r\n')
    下载本地内容(`${安全文件名(查询标题)}.csv`, `\uFEFF${内容}`, 'text/csv;charset=utf-8')
    message.success('查询结果已导出为 CSV')
  }

  const 数据区 = <div className="database-table-card ds-table-card-padded">
    <div className="database-table-toolbar">
      <strong>{查询标题}</strong>
      <Space wrap size={8}>
        <Button onClick={() => 当前表 && void 读取表(数据库路径, 当前表.name)} disabled={!当前表}>刷新</Button>
        <Button type="primary" onClick={() => 打开行弹窗({ 类型: '新增' })} disabled={!当前表}>新增记录</Button>
        <Button onClick={() => 选中行 && 打开行弹窗({ 类型: '编辑', 原始行: 选中行 })} disabled={!选中行 || !主键可编辑}>编辑记录</Button>
        <Button onClick={删除行} disabled={!选中行 || !主键可编辑}>删除记录</Button>
        <Button onClick={导出结果} disabled={!数据}>导出 CSV</Button>
      </Space>
    </div>
    {当前表 && !主键可编辑 ? <Alert type="info" showIcon message="该表没有可识别的主键，因此为避免误改，只开放新增和查询；添加主键后即可编辑、删除。" /> : null}
    {数据 ? <Table<数据行>
      aria-label={查询标题}
      columns={数据列(数据)}
      dataSource={数据.rows}
      rowKey={取得行键}
      rowSelection={是当前表数据 ? { type: 'radio', selectedRowKeys: 选中行 ? [取得行键(选中行)] : [], onSelect: (行) => 设选中行(行) } : undefined}
      pagination={{ pageSize: 25, showSizeChanger: false, showTotal: (总数) => `共 ${总数} 行` }}
      scroll={{ x: Math.max(760, 数据.columns.length * 160), y: 520 }}
      size="middle"
    /> : <Empty description="请选择数据表或执行查询" />}
    {数据?.truncated ? <Alert type="warning" showIcon message={`结果超过读取上限，当前显示前 ${数据.rowCount} 行；请增加 SQL 筛选条件后重试。`} /> : null}
  </div>

  const 结构区 = 当前表 ? <div className="database-schema-grid">
    <Card variant="borderless" title="字段">
      <Table<Access字段信息> size="small" pagination={false} rowKey="name" dataSource={当前表.columns} columns={[
        { title: '字段名', dataIndex: 'name', ellipsis: true },
        { title: '类型', dataIndex: 'type', width: 150 },
        { title: '可为空', dataIndex: 'nullable', width: 84, render: (值: boolean) => 值 ? '是' : '否' },
        { title: '主键', key: 'primary', width: 72, render: (_, 字段) => 当前表.primaryKey.includes(字段.name) ? <Tag color="processing">主键</Tag> : '—' },
      ]} />
    </Card>
    <Card variant="borderless" title="索引">
      <Table size="small" pagination={false} rowKey="name" dataSource={当前表.indexes} columns={[
        { title: '索引名', dataIndex: 'name', ellipsis: true },
        { title: '字段', dataIndex: 'columns', render: (值: string[]) => 值.join('、') },
        { title: '属性', key: 'flags', width: 140, render: (_, 索引) => <Space size={4}>{索引.primary ? <Tag color="processing">主键</Tag> : null}{索引.unique ? <Tag>唯一</Tag> : null}</Space> },
      ]} />
    </Card>
  </div> : <Empty description="请选择数据表" />

  const 关系区 = <Card variant="borderless" className="database-relations-card" title="表关系">
    <Table pagination={false} rowKey={(行, 索引) => `${行.name}-${索引}`} dataSource={结构?.relationships ?? []} columns={[
      { title: '关系名', dataIndex: 'name', ellipsis: true },
      { title: '主表', dataIndex: 'primaryTable' },
      { title: '主表字段', dataIndex: 'primaryColumn' },
      { title: '外表', dataIndex: 'foreignTable' },
      { title: '外表字段', dataIndex: 'foreignColumn' },
    ]} locale={{ emptyText: '当前数据库没有可识别的关系' }} />
  </Card>

  const SQL区 = <Card variant="borderless" className="database-sql-card" title="SQL 查询与结构操作">
    <label htmlFor="access-sql-editor">SQL 语句</label>
    <Input.TextArea id="access-sql-editor" value={SQL} onChange={(事件) => 设SQL(事件.target.value)} rows={10} spellCheck={false} aria-describedby="access-sql-help" />
    <p id="access-sql-help">“执行查询”仅允许 SELECT、TRANSFORM、TABLE 等读取语句；INSERT、UPDATE、DELETE、DDL 请使用“执行更改”并确认备份。</p>
    <Space wrap><Button type="primary" onClick={() => void 执行查询()}>执行查询</Button><Button onClick={执行更改}>执行更改</Button></Space>
  </Card>

  return <div className="local-page database-page">
    <header className="local-page__header">
      <div><h1>Access 数据库</h1><p>支持 Access 2003 MDB 到 Access 2024 / Microsoft 365 ACCDB；直接浏览结构、查询并维护数据。</p></div>
      <div className="local-page__actions"><Button onClick={() => void 打开数据库()}>打开数据库</Button><Button type="primary" onClick={() => void 创建数据库()}>新建 ACCDB</Button></div>
    </header>
    {状态 && !状态.平台支持 ? <Alert type="info" showIcon message="当前平台仅提供说明" description="Access 数据库编辑依赖 Windows OLE DB，只能在 Windows 桌面版使用。" /> : null}
    {状态?.平台支持 && !状态.可用 ? <Alert type="warning" showIcon message="未检测到 Access 数据库引擎" description={<span>请安装与本机 Office 位数匹配的 Microsoft 365 Access Runtime。<Button type="link" onClick={() => void 桥接.openExternal(状态.安装地址 || ACCESS_RUNTIME_URL)}>打开官方下载页</Button></span>} /> : null}
    {!数据库路径 ? <Card variant="borderless" className="database-welcome">
      <Empty description="打开 Access 2003–Microsoft 365 数据库，或新建 ACCDB" />
      <label htmlFor="access-database-password">数据库密码（如有）</label>
      <Input.Password id="access-database-password" value={数据库密码} onChange={(事件) => 设数据库密码(事件.target.value)} placeholder="密码只用于本次打开，不会保存" autoComplete="off" />
      <details className="database-advanced-connection">
        <summary>Access 2003 工作组安全（可选）</summary>
        <div className="database-advanced-connection__fields">
          <label htmlFor="access-workgroup-path">工作组信息文件（.mdw）</label>
          <Input id="access-workgroup-path" value={工作组文件} onChange={(事件) => 设工作组文件(事件.target.value)} placeholder="例如 C:\\数据\\安全.mdw" autoComplete="off" />
          <label htmlFor="access-user-name">用户名</label>
          <Input id="access-user-name" value={用户名} onChange={(事件) => 设用户名(事件.target.value)} autoComplete="off" />
          <label htmlFor="access-user-password">用户密码</label>
          <Input.Password id="access-user-password" value={用户密码} onChange={(事件) => 设用户密码(事件.target.value)} placeholder="只用于本次打开，不会保存" autoComplete="off" />
        </div>
      </details>
      <Descriptions size="small" column={1} title="兼容范围" items={[
        { key: 'direct', label: '直接读写', children: 'Access 2003、2007、2010、2013、2016、2019、2021、2024、Microsoft 365' },
        { key: 'formats', label: '文件格式', children: '.mdb、.accdb' },
        { key: 'old', label: '更早版本', children: 'Access 1.0–2002/XP 请先转换为 Access 2003 MDB 或 ACCDB' },
      ]} />
    </Card> : <Spin spinning={忙碌}>
      <div className="database-summary">
        <div><strong>{数据库路径.split(/[\\/]/).pop()}</strong><span title={数据库路径}>{数据库路径}</span></div>
        <Space wrap><Tag color="processing">{结构?.格式代际 || 'Access 数据库'}</Tag>{结构?.提供者 ? <Tag>{结构.提供者} · {结构.位数} 位</Tag> : null}<Button onClick={() => { 设数据库路径(''); 设结构(null); 设数据(null); 设当前表名('') }}>关闭数据库</Button></Space>
      </div>
      <div className="database-layout">
        <aside className="database-sidebar" aria-label="数据库对象">
          <div className="database-sidebar__header"><strong>数据表</strong><Button type="link" onClick={() => { 建表表单.setFieldsValue({ 字段: '编号 COUNTER PK\n名称 TEXT(255) NOT NULL' }); 设建表弹窗(true) }}>新建</Button></div>
          <div className="database-object-list">{结构?.tables.map((表) => <button key={表.name} type="button" className={表.name === 当前表名 ? 'is-active' : ''} onClick={() => void 选择表(表.name)} title={表.name}>{表.name}</button>)}</div>
          <div className="database-sidebar__header"><strong>保存查询</strong></div>
          <div className="database-object-list">{结构?.queries.length ? 结构.queries.map((查询) => <button key={查询.name} type="button" onClick={() => { 设SQL(`SELECT * FROM [${查询.name.replace(/]/g, ']]')}];`); 设活动页('sql') }} title={查询.name}>{查询.name}</button>) : <span>无</span>}</div>
          <div className="database-sidebar__footer"><Button block onClick={() => 导入引用.current?.click()}>导入 CSV</Button><Button block onClick={删除当前表} disabled={!当前表}>删除当前表</Button><input ref={导入引用} hidden type="file" accept=".csv,text/csv" onChange={(事件) => { const 文件 = 事件.target.files?.[0]; 事件.target.value = ''; if (文件) void 读取Csv(文件) }} /></div>
        </aside>
        <main className="database-main">
          <Tabs activeKey={活动页} onChange={设活动页} items={[
            { key: 'data', label: '数据', children: 数据区 },
            { key: 'schema', label: '表设计', children: 结构区 },
            { key: 'relations', label: '关系', children: 关系区 },
            { key: 'sql', label: 'SQL', children: SQL区 },
          ]} />
        </main>
      </div>
    </Spin>}

    <Modal title={行弹窗?.类型 === '新增' ? `新增「${当前表?.name || ''}」记录` : `编辑「${当前表?.name || ''}」记录`} open={行弹窗 !== null} centered width={720} okText="保存" cancelText="取消" onOk={() => void 保存行()} onCancel={() => { 设行弹窗(null); 行表单.resetFields() }} destroyOnHidden>
      <Form form={行表单} layout="vertical" className="database-row-form">
        {当前表?.columns.map((字段) => <Form.Item key={字段.name} name={字段.name} label={字段.name} extra={`${字段.type}${当前表.primaryKey.includes(字段.name) ? ' · 主键' : ''}`} rules={字段.nullable || 是自动编号字段(字段) ? [] : [{ required: true, message: `请输入${字段.name}` }]}>
          {/YESNO|BOOLEAN|BIT/i.test(字段.type) ? <Select disabled={是自动编号字段(字段) || (行弹窗?.类型 === '编辑' && 当前表.primaryKey.includes(字段.name))} allowClear options={[{ value: true, label: '是' }, { value: false, label: '否' }]} /> : <Input disabled={是自动编号字段(字段) || (行弹窗?.类型 === '编辑' && 当前表.primaryKey.includes(字段.name)) || /BINARY|OLE|ATTACH/i.test(字段.type)} />}
        </Form.Item>)}
      </Form>
    </Modal>

    <Modal title="新建数据表" open={建表弹窗} centered width={680} okText="创建" cancelText="取消" onOk={() => void 创建数据表()} onCancel={() => { 设建表弹窗(false); 建表表单.resetFields() }} destroyOnHidden>
      <Form form={建表表单} layout="vertical">
        <Form.Item name="表名" label="表名" rules={[{ required: true, message: '请输入表名' }]}><Input /></Form.Item>
        <Form.Item name="字段" label="字段定义" extra="每行一个字段：字段名 类型 [PK] [NOT NULL]。支持 TEXT(255)、LONGTEXT、INTEGER、DOUBLE、CURRENCY、DATETIME、YESNO、GUID、LONGBINARY、COUNTER。" rules={[{ required: true, message: '请输入字段定义' }]}><Input.TextArea rows={9} spellCheck={false} /></Form.Item>
      </Form>
    </Modal>

    <Modal title={`导入 CSV${导入数据 ? `：${导入数据.文件名}` : ''}`} open={导入数据 !== null} centered width={560} okText="开始导入" cancelText="取消" onOk={() => void 导入Csv()} onCancel={() => { 设导入数据(null); 导入表单.resetFields() }} destroyOnHidden>
      <Form form={导入表单} layout="vertical" initialValues={{ 新建表: true }}>
        <Form.Item name="表名" label="目标表名" rules={[{ required: true, message: '请输入目标表名' }]}><Input /></Form.Item>
        <Form.Item name="新建表" label="导入方式"><Select options={[{ value: true, label: '新建表（字段使用长文本）' }, { value: false, label: '追加到已有同字段表' }]} /></Form.Item>
        <p className="local-page__muted">{导入数据 ? `${导入数据.字段.length} 个字段，${导入数据.记录.length} 行。一次最多导入 10,000 行。` : ''}</p>
      </Form>
    </Modal>
  </div>
}
