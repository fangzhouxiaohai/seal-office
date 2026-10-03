// 表格导入：把主进程 xlsx 读取产出的 HTML 表格标记解析为工作表模型。
// 缺少 <table> 标记时返回 null；合法空工作表仍可打开。
import { 创建工作表, 重算工作表, type Sheet } from './model'
import { 生成地址 } from './address'

/** 从 HTML 表格标记构建工作表；内容写入后统一重算公式 */
export function 从Html表格构建工作表(html: string, 名称 = 'Sheet1'): Sheet | null {
  const 解析器 = new DOMParser()
  const 文档 = 解析器.parseFromString(html, 'text/html')
  const 表格 = 文档.querySelector('table')
  if (表格 === null) {
    return null
  }
  const 行集合 = Array.from(表格.querySelectorAll('tr'))
  if (行集合.length === 0) return 创建工作表(名称, 10, 6)
  const 行值列表 = 行集合.map((行) => Array.from(行.querySelectorAll('th, td')).map((格) => {
    const 显示值 = 格.textContent ?? ''
    const 公式 = 格.getAttribute('data-formula')
    return { 原始值: 公式 ? (公式.startsWith('=') ? 公式 : `=${公式}`) : 显示值, 显示值 }
  }))
  const 最大列数 = 行值列表.reduce((最大, 行) => Math.max(最大, 行.length), 0)
  if (最大列数 === 0) return 创建工作表(名称, Math.max(行集合.length + 5, 10), 6)
  // 在数据区外留出编辑余量，工作表尺寸必须覆盖全部已导入数据。
  const 行数 = Math.max(行值列表.length + 5, 10)
  const 列数 = Math.max(最大列数 + 3, 6)
  const 工作表: Sheet = 创建工作表(名称, 行数, 列数)
  行值列表.forEach((行值, 行) => {
    行值.forEach((单元, 列) => {
      if (单元.原始值 !== '') {
        工作表.单元格[生成地址(行, 列)] = { 原始值: 单元.原始值, 显示值: 单元.显示值, 格式: {} }
      }
    })
  })
  return 重算工作表(工作表)
}
