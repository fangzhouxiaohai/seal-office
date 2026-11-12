import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, App as AntdApp, Button, Card, Descriptions, Empty, Form, Input, InputNumber, Modal, Select, Space, Spin, Switch, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { 桥接, type Access单元格值, type Access字段信息, type Access操作结果, type Access数据库结构, type Access数据库状态, type Access查询结果, type Access表信息 } from '../ipc/bridge'
import { 解析邮件合并CSV } from '../editor/mailMerge'
import { 下载本地内容 } from './download'
import {
  ACCESS命令模板, ACCESS常用字段, ACCESS常用查询, ACCESS建表模板, ACCESS筛选运算, 常用字段类型,
  新字段行, 模板转字段行, 校验字段名, 校验字段行, 生成建表定义, 生成常用查询SQL, 生成类型文本, 由表结构复制字段行,
  字段类型键, 字段录入控件, 读取类型定义, type 字段行, type 字段类型键值, type 常用查询键, type 筛选运算,
} from './accessSchema'
import './localTools.css'

type 数据行 = Record<string, Access单元格值>
type 行模式 = { 类型: '新增' } | { 类型: '编辑'; 原始行: 数据行 }
type 字段弹窗 = { 模式: '增加' } | { 模式: '修改'; 字段: Access字段信息 }

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

/** 数据库返回的日期为 ISO 文本；转成 datetime-local 输入框需要的本地时间格式。 */
function 日期转输入值(值: Access单元格值 | undefined): string | undefined {
  if (typeof 值 !== 'string' || !值) return undefined
  const 匹配 = 值.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  return 匹配 ? `${匹配[1]}T${匹配[2]}` : undefined
}

function 表单值转数据库值(字段: Access字段信息, 值: unknown): Access单元格值 {
  if (值 === undefined || 值 === null || 值 === '') return null
  const 控件 = 字段录入控件(字段)
  if (控件 === '开关') return 值 === true
  if (控件 === '数字') {
    const 数字 = Number(值)
    if (!Number.isFinite(数字)) throw new Error(`字段「${字段.name}」必须是有效数字`)
    return 数字
  }
  // Access 接受“yyyy-mm-dd hh:mm:ss”文本作为日期参数
  if (控件 === '日期') return String(值).replace('T', ' ') + (String(值).length === 16 ? ':00' : '')
  return String(值)
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

const 类型选项 = (禁用自动编号 = false) => 常用字段类型.map((项) => ({
  value: 项.键,
  label: 项.名称,
  title: 项.说明,
  disabled: 禁用自动编号 && 项.键 === 'COUNTER',
}))

function 新建表初始行(): 字段行[] {
  return [新字段行({ 名称: '编号', 类型: 'COUNTER', 主键: true })]
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
  const [SQL展开, 设SQL展开] = useState(false)
  const [查询标题, 设查询标题] = useState('数据记录')
  const [行弹窗, 设行弹窗] = useState<行模式 | null>(null)
  const [建表弹窗, 设建表弹窗] = useState(false)
  const [新表名, 设新表名] = useState('')
  const [字段行列表, 设字段行列表] = useState<字段行[]>(新建表初始行)
  const [复制来源, 设复制来源] = useState<string | undefined>(undefined)
  const [字段编辑, 设字段编辑] = useState<字段弹窗 | null>(null)
  const [字段草稿, 设字段草稿] = useState<字段行>(() => 新字段行())
  const [主键弹窗, 设主键弹窗] = useState(false)
  const [主键草稿, 设主键草稿] = useState<string[]>([])
  const [筛选展开, 设筛选展开] = useState(false)
  const [筛选字段, 设筛选字段] = useState<string | undefined>(undefined)
  const [筛选方式, 设筛选方式] = useState<筛选运算>('eq')
  const [筛选值, 设筛选值] = useState('')
  const [导入数据, 设导入数据] = useState<{ 字段: string[]; 记录: Record<string, string>[]; 文件名: string } | null>(null)
  const [行表单] = Form.useForm<Record<string, string | number | boolean | undefined>>()
  const [导入表单] = Form.useForm<{ 表名: string; 新建表: boolean }>()
  const 导入引用 = useRef<HTMLInputElement>(null)
  const 已处理初始新建请求 = useRef<number | undefined>(undefined)

  const 当前表 = useMemo(() => 结构?.tables.find((表) => 表.name === 当前表名) ?? null, [结构, 当前表名])
  const 是当前表数据 = Boolean(当前表 && 查询标题 === `${当前表.name} 数据`)
  const 主键可编辑 = Boolean(是当前表数据 && 当前表 && 当前表.primaryKey.length > 0)
  const 取得行键 = (行: 数据行): string => 当前表?.primaryKey.length
    ? JSON.stringify(当前表.primaryKey.map((名称) => 行[名称]))
    : `row-${数据?.rows.indexOf(行) ?? -1}`
  // 状态未返回前视为未知，新建按钮保持禁用，避免用户在驱动缺失时进入保存对话框。
  const 驱动可用 = 状态?.可用 === true
  const 字段错误 = useMemo(() => 校验字段行(字段行列表), [字段行列表])
  const 建表可提交 = 新表名.trim() !== '' && 字段行列表.length > 0 && Object.keys(字段错误).length === 0

  useEffect(() => {
    void 桥接.database.status().then(设状态).catch(() => 设状态({ 成功: false, 可用: false, 平台支持: true, 错误: '无法检测 Access 数据库引擎' }))
  }, [])

  const 请求输入 = (额外: Record<string, unknown> = {}) => ({ 路径: 数据库路径, 数据库密码, 工作组文件, 用户名, 用户密码, ...额外 })

  const 显示失败 = (标题: string, 结果: Pick<Access操作结果, '错误' | '安装地址' | '需要旧版转换' | '错误类别' | '原因' | '详情'>) => {
    const 需要安装 = 结果.错误类别 === '驱动未安装' || (结果.安装地址 && !结果.错误类别 && !结果.需要旧版转换)
    modal.error({
      title: 标题,
      okText: '知道了',
      content: <div>
        <p>{结果.错误 || '数据库操作失败'}</p>
        {结果.原因 ? <p>{结果.原因}</p> : null}
        {结果.详情 && 结果.错误类别 && 结果.错误类别 !== '其他' ? <Typography.Text type="secondary" data-ui-language-ignore="true">{结果.详情}</Typography.Text> : null}
        {需要安装 ? <Button type="link" onClick={() => void 桥接.openExternal(结果.安装地址 || ACCESS_RUNTIME_URL)}>下载 Microsoft 365 Access Runtime</Button> : null}
      </div>,
    })
  }

  const 读取表 = async (路径: string, 表名: string, 密码 = 数据库密码) => {
    const 结果 = await 桥接.database.invoke<Access查询结果>('readTable', { 路径, 数据库密码: 密码, 工作组文件, 用户名, 用户密码, 表名, 最大行数: 1000 })
    if (!结果.成功 || !结果.数据) { 显示失败('读取数据表失败', 结果); return }
    设数据(结果.数据)
    设查询标题(`${表名} 数据`)
    设选中行(null)
  }

  /** 应用已读取的结构；保留当前表（若仍存在），否则切到首张表。 */
  const 应用结构 = async (路径: string, 新结构: Access数据库结构, 密码 = 数据库密码, 优先表 = '') => {
    设数据库路径(路径)
    设结构(新结构)
    const 目标 = 新结构.tables.find((表) => 表.name === 优先表)?.name || 新结构.tables[0]?.name || ''
    设当前表名(目标)
    设数据(null)
    设选中行(null)
    设查询标题(目标 ? `${目标} 数据` : '数据记录')
    if (目标) await 读取表(路径, 目标, 密码)
  }

  const 读取结构 = async (路径: string, 密码 = 数据库密码, 优先表 = ''): Promise<boolean> => {
    设忙碌(true)
    try {
      const 结果 = await 桥接.database.invoke<Access数据库结构>('inspect', { 路径, 数据库密码: 密码, 工作组文件, 用户名, 用户密码 })
      if (!结果.成功 || !结果.数据) { 显示失败('打开 Access 数据库失败', 结果); return false }
      await 应用结构(路径, 结果.数据, 密码, 优先表)
      return true
    } finally {
      设忙碌(false)
    }
  }

  const 打开数据库 = async () => {
    const 选择 = await 桥接.database.pick()
    if (!选择.成功) { 显示失败('选择数据库失败', 选择); return }
    if (选择.已取消 || !选择.路径) return
    await 读取结构(选择.路径)
  }

  const 创建数据库 = async () => {
    if (!驱动可用) return
    const 结果 = await 桥接.database.create('新建数据库.accdb') as unknown as Access操作结果<Access数据库结构>
    if (!结果.成功) {
      显示失败(结果.已创建 ? '数据库已创建但无法打开' : '无法创建数据库', 结果)
      return
    }
    if (结果.已取消 || !结果.路径) return
    message.success('Access 数据库已创建')
    // 主进程创建后已立即回读并验证，直接使用回读结构；旧版主进程未返回结构时再读取一次。
    if (结果.数据) {
      设忙碌(true)
      try { await 应用结构(结果.路径, 结果.数据, '') } finally { 设忙碌(false) }
    } else {
      await 读取结构(结果.路径, '')
    }
  }

  useEffect(() => {
    if (初始新建请求 === undefined || 已处理初始新建请求.current === 初始新建请求) return
    if (状态 === null) return
    已处理初始新建请求.current = 初始新建请求
    on初始新建已处理?.()
    if (!驱动可用) return
    void 创建数据库()
  }, [初始新建请求, on初始新建已处理, 状态])

  const 选择表 = async (表名: string) => {
    设当前表名(表名)
    设活动页('data')
    设忙碌(true)
    try { await 读取表(数据库路径, 表名) } finally { 设忙碌(false) }
  }

  const 运行查询 = async (语句: string, 参数: Array<string | number | boolean | null>, 标题: string) => {
    设忙碌(true)
    try {
      const 结果 = await 桥接.database.invoke<Access查询结果>('query', 请求输入({ SQL: 语句, 参数, 最大行数: 5000 }))
      if (!结果.成功 || !结果.数据) { 显示失败('执行查询失败', 结果); return }
      设数据(结果.数据)
      设查询标题(标题)
      设活动页('data')
      设选中行(null)
      message.success(`查询完成，共读取 ${结果.数据.rowCount} 行`)
    } finally { 设忙碌(false) }
  }

  const 执行查询 = () => 运行查询(SQL, [], 'SQL 查询结果')

  const 执行常用查询 = async (键: 常用查询键) => {
    if (!当前表) return
    if (键 === 'filter') {
      设筛选展开(true)
      if (!筛选字段) 设筛选字段(当前表.columns[0]?.name)
      return
    }
    const 名称 = ACCESS常用查询.find((项) => 项.键 === 键)?.名称 ?? ''
    const { SQL: 语句, 参数 } = 生成常用查询SQL(键, 当前表)
    设SQL(语句)
    await 运行查询(语句, 参数, `${当前表.name} · ${名称}`)
  }

  const 执行筛选 = async () => {
    if (!当前表 || !筛选字段) return
    const 字段 = 当前表.columns.find((项) => 项.name === 筛选字段)
    const 需要值 = ACCESS筛选运算.find((项) => 项.键 === 筛选方式)?.需要值 !== false
    let 值: string | number | boolean | null = 筛选值
    if (需要值 && 字段 && 筛选方式 !== 'contains') {
      try {
        const 转换 = 表单值转数据库值(字段, 字段录入控件(字段) === '开关' ? /^(是|true|1|yes)$/i.test(筛选值) : 筛选值)
        值 = typeof 转换 === 'object' && 转换 !== null ? null : 转换
      } catch (错误) {
        modal.error({ title: '筛选条件无效', okText: '知道了', content: 错误 instanceof Error ? 错误.message : '筛选值无效' })
        return
      }
    }
    const { SQL: 语句, 参数 } = 生成常用查询SQL('filter', 当前表, { 字段: 筛选字段, 运算: 筛选方式, 值 })
    设SQL(语句)
    await 运行查询(语句, 参数, `${当前表.name} · 筛选结果`)
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
        await 读取结构(数据库路径, 数据库密码, 当前表名)
      },
    })
  }

  const 插入命令模板 = (键: string) => {
    const 模板 = ACCESS命令模板.find((项) => 项.键 === 键)
    if (!模板) return
    设SQL(模板.生成(当前表))
    设SQL展开(true)
  }

  const 打开行弹窗 = (模式: 行模式) => {
    if (!当前表) return
    设行弹窗(模式)
    const 初始值: Record<string, string | number | boolean | undefined> = {}
    for (const 字段 of 当前表.columns) {
      const 值 = 模式.类型 === '编辑' ? 模式.原始行[字段.name] : undefined
      const 控件 = 字段录入控件(字段)
      if (控件 === '日期') 初始值[字段.name] = 日期转输入值(值)
      else if (控件 === '开关') 初始值[字段.name] = 值 === true
      else if (typeof 值 !== 'object') 初始值[字段.name] = 值 ?? undefined
    }
    行表单.setFieldsValue(初始值)
  }

  const 保存行 = async () => {
    if (!当前表 || !行弹窗) return
    const 表单值 = await 行表单.validateFields()
    const 值: Record<string, Access单元格值> = {}
    try {
      for (const 字段 of 当前表.columns) {
        const 控件 = 字段录入控件(字段)
        if (控件 === '自动编号' || 控件 === '只读' || typeof 表单值[字段.name] === 'object') continue
        if (行弹窗.类型 === '编辑' && 当前表.primaryKey.includes(字段.name)) continue
        if ((表单值[字段.name] === undefined || 表单值[字段.name] === '') && 行弹窗.类型 === '新增' && 控件 !== '开关') continue
        值[字段.name] = 表单值转数据库值(字段, 表单值[字段.name])
      }
    } catch (错误) {
      modal.error({ title: '记录内容无效', okText: '知道了', content: 错误 instanceof Error ? 错误.message : '记录内容无效' })
      return
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

  // —— 建表：字段行编辑器 ——
  const 打开建表弹窗 = () => {
    设新表名('')
    设字段行列表(新建表初始行())
    设复制来源(undefined)
    设建表弹窗(true)
  }

  const 关闭建表弹窗 = () => {
    设建表弹窗(false)
  }

  const 更新字段行 = (序号: number, 局部: Partial<字段行>) => {
    设字段行列表((列表) => 列表.map((行, 下标) => {
      if (下标 !== 序号) return 行
      const 新行 = { ...行, ...局部 }
      // 自动编号不需要“必填”；切换到自动编号时自动清除必填
      if (新行.类型 === 'COUNTER') 新行.必填 = false
      return 新行
    }))
  }

  const 移动字段行 = (序号: number, 偏移: number) => {
    设字段行列表((列表) => {
      const 目标 = 序号 + 偏移
      if (目标 < 0 || 目标 >= 列表.length) return 列表
      const 副本 = [...列表]
      ;[副本[序号], 副本[目标]] = [副本[目标], 副本[序号]]
      return 副本
    })
  }

  const 应用模板 = (键: string) => {
    const 模板 = ACCESS建表模板.find((项) => 项.键 === 键)
    if (!模板) return
    设字段行列表(模板.字段.map(模板转字段行))
    设复制来源(undefined)
    if (!新表名.trim() || ACCESS建表模板.some((项) => 项.名称 === 新表名) || 结构?.tables.some((表) => `${表.name}副本` === 新表名)) 设新表名(模板.名称)
  }

  const 追加常用字段 = (键: string) => {
    const 预设 = ACCESS常用字段.find((项) => 项.键 === 键)
    if (!预设) return
    设字段行列表((列表) => [...列表, 模板转字段行(预设.字段)])
  }

  const 复制表结构 = (表名: string) => {
    const 来源 = 结构?.tables.find((表) => 表.name === 表名)
    if (!来源) return
    设复制来源(表名)
    设字段行列表(由表结构复制字段行(来源))
    if (!新表名.trim()) 设新表名(`${表名}副本`)
  }

  const 创建数据表 = async () => {
    if (!建表可提交) return
    const 表名 = 新表名.trim()
    const 定义 = 生成建表定义(字段行列表)
    const 结果 = await 桥接.database.invoke<{ affectedRows: number }>('createTable', 请求输入({ 表名, ...定义 }))
    if (!结果.成功) { 显示失败('创建数据表失败', 结果); return }
    message.success(`数据表「${表名}」已创建`)
    设建表弹窗(false)
    await 读取结构(数据库路径, 数据库密码, 表名)
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

  // —— 编辑表结构 ——
  const 改表 = async (表: Access表信息, 输入: Record<string, unknown>, 失败标题: string): Promise<boolean> => {
    const 结果 = await 桥接.database.invoke<{ affectedRows: number }>('alterTable', 请求输入({ 表名: 表.name, ...输入 }))
    if (!结果.成功) { 显示失败(失败标题, 结果); return false }
    return true
  }

  const 打开字段弹窗 = (模式: 字段弹窗) => {
    if (模式.模式 === '修改') {
      const 类型 = 字段类型键(模式.字段)
      设字段草稿(新字段行({
        名称: 模式.字段.name,
        类型,
        长度: 类型 === 'TEXT' && typeof 模式.字段.maxLength === 'number' && 模式.字段.maxLength > 0 ? 模式.字段.maxLength : 255,
        必填: 类型 !== 'COUNTER' && 类型 !== 'YESNO' && !模式.字段.nullable,
      }))
    } else {
      设字段草稿(新字段行())
    }
    设字段编辑(模式)
  }

  const 字段草稿错误 = useMemo(() => {
    if (!字段编辑 || !当前表) return null
    const 原名 = 字段编辑.模式 === '修改' ? 字段编辑.字段.name : ''
    return 校验字段名(字段草稿.名称, 当前表.columns.map((项) => 项.name).filter((名称) => 名称 !== 原名))
  }, [字段编辑, 字段草稿.名称, 当前表])

  const 保存字段 = async () => {
    if (!当前表 || !字段编辑 || 字段草稿错误) return
    const 新名称 = 字段草稿.名称.trim()
    const 字段定义 = { 名称: 新名称, 类型: 生成类型文本(字段草稿), 必填: 字段草稿.类型 === 'COUNTER' ? false : 字段草稿.必填 }
    if (字段编辑.模式 === '增加') {
      if (!(await 改表(当前表, { 操作: 'addColumn', 字段: 字段定义 }, '增加字段失败'))) return
      message.success(`已增加字段「${新名称}」`)
    } else {
      const 原字段 = 字段编辑.字段
      const 原类型 = 字段类型键(原字段)
      const 原长度 = 原类型 === 'TEXT' && typeof 原字段.maxLength === 'number' && 原字段.maxLength > 0 ? 原字段.maxLength : 255
      const 原必填 = 原类型 !== 'COUNTER' && 原类型 !== 'YESNO' && !原字段.nullable
      const 类型已变 = 原类型 !== 字段草稿.类型 || (字段草稿.类型 === 'TEXT' && 原长度 !== (字段草稿.长度 ?? 255)) || 原必填 !== 字段定义.必填
      // 先改类型再改名：类型被 Access 拒绝时不执行改名，避免只改了一半。
      if (类型已变 && !(await 改表(当前表, { 操作: 'alterColumn', 字段: { ...字段定义, 名称: 原字段.name } }, '修改字段类型失败'))) return
      if (新名称 !== 原字段.name && !(await 改表(当前表, { 操作: 'renameColumn', 字段名: 原字段.name, 新名称 }, '重命名字段失败'))) {
        if (类型已变) await 读取结构(数据库路径, 数据库密码, 当前表.name)
        return
      }
      message.success('字段已更新')
    }
    设字段编辑(null)
    await 读取结构(数据库路径, 数据库密码, 当前表.name)
    设活动页('schema')
  }

  const 删除字段 = (字段: Access字段信息) => {
    if (!当前表) return
    const 是主键 = 当前表.primaryKey.includes(字段.name)
    modal.confirm({
      title: `删除字段「${字段.name}」`,
      content: <div>
        <p>该列在全部记录中的数据会被永久删除，且无法撤销。请确认已备份数据库。</p>
        {是主键 ? <p>该字段属于主键，Access 不允许直接删除，请先在“调整主键”中取消。</p> : null}
      </div>,
      okText: '删除字段',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (!(await 改表(当前表, { 操作: 'dropColumn', 字段名: 字段.name }, '删除字段失败'))) throw new Error('删除字段失败')
        message.success(`字段「${字段.name}」已删除`)
        await 读取结构(数据库路径, 数据库密码, 当前表.name)
        设活动页('schema')
      },
    })
  }

  const 打开主键弹窗 = () => {
    if (!当前表) return
    设主键草稿([...当前表.primaryKey])
    设主键弹窗(true)
  }

  const 提交主键 = () => {
    if (!当前表) return
    const 新主键 = 当前表.columns.map((字段) => 字段.name).filter((名称) => 主键草稿.includes(名称))
    if (新主键.join('\u0000') === 当前表.primaryKey.join('\u0000')) { 设主键弹窗(false); return }
    modal.confirm({
      title: '确认变更主键',
      content: <div>
        <p>{新主键.length ? `新主键：${新主键.join('、')}。` : '将取消该表的主键。'}</p>
        <p>如果已有记录中存在重复值或空值，Access 会拒绝变更并保留原主键。取消主键后，该表的记录将不能在本程序中编辑或删除。</p>
      </div>,
      okText: '变更主键',
      cancelText: '取消',
      onOk: async () => {
        if (!(await 改表(当前表, { 操作: 'setPrimaryKey', 主键: 新主键 }, '变更主键失败'))) throw new Error('变更主键失败')
        message.success('主键已更新')
        设主键弹窗(false)
        await 读取结构(数据库路径, 数据库密码, 当前表.name)
        设活动页('schema')
      },
    })
  }

  const 读取Csv = async (文件: File) => {
    try {
      const 数据源 = 解析邮件合并CSV(await 文件.text())
      设导入数据({ ...数据源, 文件名: 文件.name })
      导入表单.setFieldsValue({ 表名: 文件.name.replace(/\.csv$/i, '') || '导入数据', 新建表: true })
    } catch (错误) {
      modal.error({ title: '读取 CSV 失败', okText: '知道了', content: 错误 instanceof Error ? 错误.message : 'CSV 文件格式无效' })
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
    {当前表 && !主键可编辑 && 是当前表数据 ? <Alert type="info" showIcon message="该表没有可识别的主键，因此为避免误改，只开放新增和查询；添加主键后即可编辑、删除。" /> : null}
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
    <Card variant="borderless" title="字段" extra={<Space wrap size={8}>
      <Button onClick={() => 打开字段弹窗({ 模式: '增加' })}>增加字段</Button>
      <Button onClick={打开主键弹窗}>调整主键</Button>
    </Space>}>
      <Table<Access字段信息> size="small" pagination={false} rowKey="name" dataSource={当前表.columns} scroll={{ x: 560 }} columns={[
        { title: '字段名', dataIndex: 'name', ellipsis: true },
        { title: '类型', key: 'type', width: 120, render: (_, 字段) => { const 键 = 字段类型键(字段); return 键 === 'TEXT' && 字段.maxLength ? `${读取类型定义(键).名称}（${字段.maxLength}）` : 读取类型定义(键).名称 } },
        { title: '必填', key: 'required', width: 64, render: (_, 字段) => 字段.nullable ? '否' : '是' },
        { title: '主键', key: 'primary', width: 72, render: (_, 字段) => 当前表.primaryKey.includes(字段.name) ? <Tag color="processing">主键</Tag> : '—' },
        { title: '操作', key: 'actions', width: 132, render: (_, 字段) => <Space size={4}>
          <Button size="small" type="link" aria-label={`修改字段 ${字段.name}`} onClick={() => 打开字段弹窗({ 模式: '修改', 字段 })}>修改</Button>
          <Button size="small" type="link" danger aria-label={`删除字段 ${字段.name}`} onClick={() => 删除字段(字段)} disabled={当前表.columns.length <= 1}>删除</Button>
        </Space> },
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

  const 筛选需要值 = ACCESS筛选运算.find((项) => 项.键 === 筛选方式)?.需要值 !== false
  const 查询区 = <Card variant="borderless" className="database-sql-card" title="查询与命令">
    <span className="database-field-label">常用查询{当前表 ? `（${当前表.name}）` : ''}</span>
    <div className="database-chip-row">
      {ACCESS常用查询.map((项) => <Button key={项.键} onClick={() => void 执行常用查询(项.键)} disabled={!当前表}>{项.名称}</Button>)}
    </div>
    {筛选展开 && 当前表 ? <div className="database-filter-row">
      <Select aria-label="筛选字段" value={筛选字段} onChange={设筛选字段} options={当前表.columns.map((字段) => ({ value: 字段.name, label: 字段.name }))} />
      <Select aria-label="筛选方式" value={筛选方式} onChange={设筛选方式} options={ACCESS筛选运算.map((项) => ({ value: 项.键, label: 项.名称 }))} />
      {筛选需要值 ? <Input aria-label="筛选值" value={筛选值} onChange={(事件) => 设筛选值(事件.target.value)} onPressEnter={() => void 执行筛选()} placeholder="输入要匹配的值" /> : null}
      <Button type="primary" onClick={() => void 执行筛选()} disabled={!筛选字段}>筛选</Button>
    </div> : null}
    <div className="database-sql-tools">
      <Select aria-label="插入命令模板" placeholder="插入命令模板" value={null} onChange={(值: string) => 插入命令模板(值)} options={ACCESS命令模板.map((项) => ({ value: 项.键, label: 项.名称 }))} />
      <Button aria-expanded={SQL展开} onClick={() => 设SQL展开((当前) => !当前)}>{SQL展开 ? '收起手写 SQL' : '手写 SQL（高级）'}</Button>
    </div>
    {SQL展开 ? <>
      <label htmlFor="access-sql-editor">SQL 语句</label>
      <Input.TextArea id="access-sql-editor" value={SQL} onChange={(事件) => 设SQL(事件.target.value)} rows={10} spellCheck={false} aria-describedby="access-sql-help" />
      <p id="access-sql-help">“执行查询”仅允许 SELECT、TRANSFORM、TABLE 等读取语句；INSERT、UPDATE、DELETE、DDL 请使用“执行更改”并确认备份。</p>
      <Space wrap><Button type="primary" onClick={() => void 执行查询()}>执行查询</Button><Button onClick={执行更改}>执行更改</Button></Space>
    </> : null}
  </Card>

  const 渲染录入控件 = (字段: Access字段信息) => {
    const 控件 = 字段录入控件(字段)
    const 锁定主键 = 行弹窗?.类型 === '编辑' && Boolean(当前表?.primaryKey.includes(字段.name))
    if (控件 === '自动编号') return <Input disabled placeholder="自动生成" />
    if (控件 === '只读') return <Input disabled placeholder="二进制内容不可在此编辑" />
    if (控件 === '开关') return <Switch disabled={锁定主键} />
    if (控件 === '日期') return <Input type="datetime-local" disabled={锁定主键} />
    if (控件 === '数字') return <InputNumber disabled={锁定主键} style={{ width: '100%' }} addonAfter={字段类型键(字段) === 'CURRENCY' ? '¥' : undefined} />
    if (控件 === '长文本') return <Input.TextArea disabled={锁定主键} autoSize={{ minRows: 2, maxRows: 6 }} />
    return <Input disabled={锁定主键} maxLength={typeof 字段.maxLength === 'number' && 字段.maxLength > 0 ? 字段.maxLength : undefined} />
  }

  return <div className="local-page database-page">
    <header className="local-page__header">
      <div><h1>Access 数据库</h1><p>支持 Access 2003 MDB 到 Access 2024 / Microsoft 365 ACCDB；直接浏览结构、查询并维护数据。</p></div>
      <div className="local-page__actions">
        <Button onClick={() => void 打开数据库()}>打开数据库</Button>
        <Button type="primary" onClick={() => void 创建数据库()} disabled={!驱动可用}>新建 ACCDB</Button>
      </div>
    </header>
    {状态 && 状态.平台支持 === false ? <Alert type="info" showIcon message="当前平台仅提供说明" description="Access 数据库编辑依赖 Windows OLE DB，只能在 Windows 桌面版使用。" /> : null}
    {状态 && 状态.平台支持 !== false && !状态.可用 ? <Alert type="warning" showIcon message="未检测到 Access 数据库引擎" description={<span>当前无法新建 Access 数据库。请安装与本机 Office 位数匹配的 Microsoft 365 Access Runtime，安装后重新进入本页即可使用。<Button type="link" onClick={() => void 桥接.openExternal(状态.安装地址 || ACCESS_RUNTIME_URL)}>打开官方下载页</Button></span>} /> : null}
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
          <div className="database-sidebar__header"><strong>数据表</strong><Button type="link" aria-label="新建数据表" onClick={打开建表弹窗}>新建</Button></div>
          <div className="database-object-list">{结构?.tables.map((表) => <button key={表.name} type="button" className={表.name === 当前表名 ? 'is-active' : ''} onClick={() => void 选择表(表.name)} title={表.name}>{表.name}</button>)}</div>
          <div className="database-sidebar__header"><strong>保存查询</strong></div>
          <div className="database-object-list">{结构?.queries.length ? 结构.queries.map((查询) => <button key={查询.name} type="button" onClick={() => { 设SQL(`SELECT * FROM [${查询.name.replace(/]/g, ']]')}];`); 设SQL展开(true); 设活动页('sql') }} title={查询.name}>{查询.name}</button>) : <span>无</span>}</div>
          <div className="database-sidebar__footer"><Button block onClick={() => 导入引用.current?.click()}>导入 CSV</Button><Button block onClick={删除当前表} disabled={!当前表}>删除当前表</Button><input ref={导入引用} hidden type="file" accept=".csv,text/csv" onChange={(事件) => { const 文件 = 事件.target.files?.[0]; 事件.target.value = ''; if (文件) void 读取Csv(文件) }} /></div>
        </aside>
        <main className="database-main">
          <Tabs activeKey={活动页} onChange={设活动页} items={[
            { key: 'data', label: '数据', children: 数据区 },
            { key: 'schema', label: '表设计', children: 结构区 },
            { key: 'relations', label: '关系', children: 关系区 },
            { key: 'sql', label: '查询', children: 查询区 },
          ]} />
        </main>
      </div>
    </Spin>}

    <Modal title={行弹窗?.类型 === '新增' ? `新增「${当前表?.name || ''}」记录` : `编辑「${当前表?.name || ''}」记录`} open={行弹窗 !== null} centered width={720} okText="保存" cancelText="取消" onOk={() => void 保存行()} onCancel={() => { 设行弹窗(null); 行表单.resetFields() }} destroyOnHidden>
      <Form form={行表单} layout="vertical" className="database-row-form">
        {当前表?.columns.map((字段) => {
          const 控件 = 字段录入控件(字段)
          const 类型名 = 读取类型定义(字段类型键(字段)).名称
          return <Form.Item key={字段.name} name={字段.name} label={字段.name} valuePropName={控件 === '开关' ? 'checked' : 'value'} extra={`${类型名}${当前表.primaryKey.includes(字段.name) ? ' · 主键' : ''}`} rules={字段.nullable || 控件 === '自动编号' || 控件 === '开关' || 控件 === '只读' ? [] : [{ required: true, message: `请输入${字段.name}` }]}>
            {渲染录入控件(字段)}
          </Form.Item>
        })}
      </Form>
    </Modal>

    <Modal title="新建数据表" open={建表弹窗} centered width={760} okText="创建" cancelText="取消" okButtonProps={{ disabled: !建表可提交 }} onOk={() => void 创建数据表()} onCancel={关闭建表弹窗} destroyOnHidden>
      <div className="database-table-builder">
        <label className="database-field-label" htmlFor="access-new-table-name">表名</label>
        <Input id="access-new-table-name" value={新表名} onChange={(事件) => 设新表名(事件.target.value)} placeholder="例如：客户" status={新表名.trim() ? undefined : 'warning'} />
        <span className="database-field-label">快捷模板</span>
        <div className="database-chip-row">{ACCESS建表模板.map((项) => <Button key={项.键} size="small" onClick={() => 应用模板(项.键)}>{项.名称}</Button>)}</div>
        {结构?.tables.length ? <>
          <span className="database-field-label">从已有表复制结构</span>
          <Select aria-label="从已有表复制结构" placeholder="选择要复制结构的数据表" value={复制来源} onChange={复制表结构} options={结构.tables.map((表) => ({ value: 表.name, label: 表.name }))} />
        </> : null}
        <span className="database-field-label">字段</span>
        <div className="database-field-rows" role="list" aria-label="字段列表">
          {字段行列表.map((行, 序号) => {
            const 编号 = 序号 + 1
            const 定义 = 读取类型定义(行.类型)
            const 错误 = 字段错误[序号]
            return <div className="database-field-row" role="listitem" key={行.标识}>
              <div className="database-field-row__name">
                <Input aria-label={`第 ${编号} 个字段名`} value={行.名称} onChange={(事件) => 更新字段行(序号, { 名称: 事件.target.value })} placeholder="字段名" status={错误 ? 'error' : undefined} aria-invalid={错误 ? 'true' : 'false'} />
                {错误 ? <span className="database-field-row__error" role="alert">{错误}</span> : null}
              </div>
              <Select aria-label={`第 ${编号} 个字段类型`} className="database-field-row__type" value={行.类型} onChange={(值: 字段类型键值) => 更新字段行(序号, { 类型: 值 })} options={类型选项()} popupMatchSelectWidth={false} />
              {定义.有长度 ? <InputNumber aria-label={`第 ${编号} 个字段长度`} className="database-field-row__length" min={1} max={255} value={行.长度} onChange={(值) => 更新字段行(序号, { 长度: typeof 值 === 'number' ? 值 : null })} placeholder="255" /> : <span className="database-field-row__length" aria-hidden="true" />}
              <label className="database-field-row__switch"><Switch size="small" aria-label={`第 ${编号} 个字段主键`} checked={行.主键} onChange={(值) => 更新字段行(序号, { 主键: 值 })} /><span>主键</span></label>
              <label className="database-field-row__switch"><Switch size="small" aria-label={`第 ${编号} 个字段必填`} checked={行.类型 === 'COUNTER' ? false : 行.必填} disabled={行.类型 === 'COUNTER'} onChange={(值) => 更新字段行(序号, { 必填: 值 })} /><span>必填</span></label>
              <Space size={0} className="database-field-row__actions">
                <Button size="small" type="text" aria-label={`上移第 ${编号} 个字段`} disabled={序号 === 0} onClick={() => 移动字段行(序号, -1)}>上移</Button>
                <Button size="small" type="text" aria-label={`下移第 ${编号} 个字段`} disabled={序号 === 字段行列表.length - 1} onClick={() => 移动字段行(序号, 1)}>下移</Button>
                <Button size="small" type="text" danger aria-label={`移除第 ${编号} 个字段`} disabled={字段行列表.length <= 1} onClick={() => 设字段行列表((列表) => 列表.filter((_, 下标) => 下标 !== 序号))}>移除</Button>
              </Space>
            </div>
          })}
        </div>
        <div className="database-chip-row">
          <Button onClick={() => 设字段行列表((列表) => [...列表, 新字段行()])}>添加字段</Button>
          {ACCESS常用字段.map((项) => <Button key={项.键} type="dashed" onClick={() => 追加常用字段(项.键)}>{`+ ${项.名称}`}</Button>)}
        </div>
        <p className="local-page__muted">类型选“自动编号”的字段会在新增记录时自动递增，通常与“主键”一起使用；长度只对短文本有效，留空按 255 处理。</p>
      </div>
    </Modal>

    <Modal title={字段编辑?.模式 === '修改' ? `修改字段「${字段编辑.字段.name}」` : '增加字段'} open={字段编辑 !== null} centered width={520} okText="保存" cancelText="取消" okButtonProps={{ disabled: Boolean(字段草稿错误) }} onOk={() => void 保存字段()} onCancel={() => 设字段编辑(null)} destroyOnHidden>
      <div className="database-table-builder">
        <label className="database-field-label" htmlFor="access-field-name">字段名</label>
        <Input id="access-field-name" value={字段草稿.名称} onChange={(事件) => 设字段草稿({ ...字段草稿, 名称: 事件.target.value })} status={字段草稿错误 ? 'error' : undefined} aria-invalid={字段草稿错误 ? 'true' : 'false'} />
        {字段草稿错误 ? <span className="database-field-row__error" role="alert">{字段草稿错误}</span> : null}
        <span className="database-field-label">字段类型</span>
        <Select aria-label="字段类型" value={字段草稿.类型} onChange={(值: 字段类型键值) => 设字段草稿({ ...字段草稿, 类型: 值, 必填: 值 === 'COUNTER' ? false : 字段草稿.必填 })} options={类型选项(字段编辑?.模式 === '修改' && 字段类型键(字段编辑.字段) !== 'COUNTER')} disabled={字段编辑?.模式 === '修改' && 字段类型键(字段编辑.字段) === 'COUNTER'} />
        {读取类型定义(字段草稿.类型).有长度 ? <>
          <label className="database-field-label" htmlFor="access-field-length">文本长度</label>
          <InputNumber id="access-field-length" min={1} max={255} value={字段草稿.长度} onChange={(值) => 设字段草稿({ ...字段草稿, 长度: typeof 值 === 'number' ? 值 : null })} placeholder="255" style={{ width: '100%' }} />
        </> : null}
        <label className="database-field-row__switch"><Switch size="small" aria-label="必填" checked={字段草稿.类型 === 'COUNTER' ? false : 字段草稿.必填} disabled={字段草稿.类型 === 'COUNTER'} onChange={(值) => 设字段草稿({ ...字段草稿, 必填: 值 })} /><span>必填</span></label>
        <p className="local-page__muted">{字段编辑?.模式 === '修改'
          ? '修改类型时，Access 会尝试转换现有数据；无法转换或缩短长度导致截断风险时会拒绝修改，原数据保持不变。已有字段不能改为自动编号。'
          : '对已有记录的表新增必填字段时，Access 可能拒绝；建议先不设必填，补齐数据后再修改。'}</p>
      </div>
    </Modal>

    <Modal title="调整主键" open={主键弹窗} centered width={480} okText="确认更改" cancelText="取消" onOk={提交主键} onCancel={() => 设主键弹窗(false)} destroyOnHidden>
      <div className="database-table-builder">
        <p className="local-page__muted">打开开关的字段将组成新主键；全部关闭表示取消主键。</p>
        {当前表?.columns.map((字段) => <label key={字段.name} className="database-field-row__switch">
          <Switch size="small" aria-label={`${字段.name} 设为主键`} checked={主键草稿.includes(字段.name)} onChange={(值) => 设主键草稿((当前) => 值 ? [...当前, 字段.name] : 当前.filter((名称) => 名称 !== 字段.name))} />
          <span data-ui-language-ignore="true">{字段.name}</span>
        </label>)}
      </div>
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

