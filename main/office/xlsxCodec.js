const ExcelJS = require('exceljs')
const JSZip = require('jszip')

/** 仅对实际存在、但当前表格模型不会写回的内容发出保真提示。 */
async function 收集保真警告(工作簿, 原始数据) {
  const 警告 = new Set()
  const 压缩包 = await JSZip.loadAsync(原始数据)
  const 文件名 = Object.keys(压缩包.files).filter((名称) => !压缩包.files[名称].dir)
  const 存在部件 = (表达式) => 文件名.some((名称) => 表达式.test(名称))
  if (存在部件(/^xl\/charts\/[^/]+\.xml$/i)) 警告.add('图表未导入')
  if (存在部件(/^xl\/media\//i)) 警告.add('图片或媒体未导入')
  if (存在部件(/^xl\/drawings\/drawing[^/]*\.xml$/i)) 警告.add('绘图对象未导入')
  if (存在部件(/^xl\/(?:pivotTables|pivotCache)\//i)) 警告.add('数据透视表未导入')
  if (存在部件(/^xl\/tables\//i)) 警告.add('结构化表格未导入')
  if (存在部件(/^xl\/(?:comments|threadedComments)\//i)) 警告.add('批注未导入')
  if (存在部件(/^xl\/(?:externalLinks|connections|queryTables)\//i)) 警告.add('外部数据连接未导入')
  if (工作簿.definedNames?.model?.length > 0) 警告.add('命名区域未导入')

  for (const 工作表 of 工作簿.worksheets) {
    const 模型 = 工作表.model
    if (模型.merges?.length > 0) 警告.add('合并单元格未导入')
    if (模型.cols?.length > 0 || 模型.rows?.some((行) => 行 && (行.height || 行.hidden || 行.outlineLevel))) {
      警告.add('行高、列宽或隐藏状态未导入')
    }
    if (工作表.views?.length > 0 || 工作表.autoFilter) 警告.add('筛选或视图设置未导入')
    if (Object.keys(工作表.dataValidations?.model ?? {}).length > 0) 警告.add('数据验证规则未导入')
    if (工作表.conditionalFormattings?.length > 0) 警告.add('条件格式未导入')
    if (工作表.sheetProtection) 警告.add('工作表保护设置未导入')
    工作表.eachRow({ includeEmpty: true }, (行) => {
      行.eachCell({ includeEmpty: true }, (单元格) => {
        if (Object.keys(单元格.style ?? {}).length > 0) 警告.add('单元格样式或数字格式未导入')
        if (单元格.hyperlink) 警告.add('超链接未导入')
        if (单元格.note) 警告.add('批注未导入')
        const 值 = 单元格.value
        if (值 instanceof Date || typeof 值 === 'boolean' || (值 && typeof 值 === 'object' && 值.richText)) {
          警告.add('日期、布尔值或富文本单元格类型未保留')
        }
        if (typeof 值 === 'string' && 值.trim() !== '' && /^-?\d+(\.\d+)?$/.test(值.trim())) {
          警告.add('文本型数字保存后可能转为数值')
        }
      })
    })
  }
  return Array.from(警告)
}

/** 把一张工作表渲染为 HTML 表格标记（供文字模块展示与表格模块导入解析） */
function 工作表转Html(工作表) {
  const 行 = []
  工作表.eachRow({ includeEmpty: true }, (行数据) => {
    const 单元格 = []
    行数据.eachCell({ includeEmpty: true }, (单元) => {
      const 公式 = typeof 单元.formula === 'string' && 单元.formula.length > 0
        ? ` data-formula="${转义(`=${单元.formula}`)}"`
        : ''
      单元格.push(`<td${公式}>${转义(String(单元.text || ''))}</td>`)
    })
    行.push(`<tr>${单元格.join('')}</tr>`)
  })
  return `<table><tbody>${行.join('')}</tbody></table>`
}

async function 读取xlsx(数据) {
  const 原始数据 = Buffer.from(数据)
  const 工作簿 = new ExcelJS.Workbook()
  await 工作簿.xlsx.load(原始数据)
  const 警告 = await 收集保真警告(工作簿, 原始数据)
  if (!工作簿.worksheets || 工作簿.worksheets.length === 0) {
    return { html: '<p><br></p>', 警告 }
  }
  // 返回全部工作表：html 为首个工作表（兼容旧消费方），工作表列表供表格模块逐表导入
  const 工作表列表 = 工作簿.worksheets.map((工作表) => ({
    名称: 工作表.name || 'Sheet1',
    html: 工作表转Html(工作表),
  }))
  return { html: 工作表列表[0].html, 工作表列表, 警告 }
}

/** 纯数字文本写为数值单元格，保证在 Excel/WPS 中可直接求和排序；其余按文本写入 */
function 转单元格值(值) {
  if (值 == null) return ''
  const 文本 = String(值)
  if (文本.trim() !== '' && /^-?\d+(\.\d+)?$/.test(文本.trim())) {
    const 数值 = Number(文本.trim())
    if (Number.isFinite(数值)) return 数值
  }
  return 文本
}

async function 写入xlsx(模型) {
  const 工作簿 = new ExcelJS.Workbook()
  // 归一化输入为 [{ 名称, 数据: 二维数组 }]：
  // 渲染层契约为 { 工作表: [{ 名称, 数据 }] }，旧契约为 { 行: 二维数组 }（单表）。
  let 表定义列表 = []
  if (模型 && Array.isArray(模型.工作表)) {
    表定义列表 = 模型.工作表
      .map((表, 序号) => {
        if (!表 || !Array.isArray(表.数据)) return null
        const 名称 = typeof 表.名称 === 'string' && 表.名称.trim() !== '' ? 表.名称 : `工作表${序号 + 1}`
        return { 名称, 数据: 表.数据 }
      })
      .filter((表) => 表 !== null)
  } else if (模型 && Array.isArray(模型.行)) {
    表定义列表 = [{ 名称: '工作表', 数据: 模型.行 }]
  }
  if (表定义列表.length === 0) {
    表定义列表 = [{ 名称: '工作表', 数据: [] }]
  }
  表定义列表.forEach((表定义) => {
    // 工作表名禁止 : \ / ? * [ ]，先清洗再截断到 Excel 的 31 字符上限
    const 安全名称 = 表定义.名称.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || '工作表'
    const 工作表 = 工作簿.addWorksheet(安全名称)
    表定义.数据.forEach((行数据, 行号) => {
      const 单元格列表 = Array.isArray(行数据) ? 行数据 : [行数据]
      单元格列表.forEach((单元, 列号) => {
        if (单元 && typeof 单元 === 'object' && typeof 单元.公式 === 'string') {
          if (单元.公式.trim() === '') throw new Error('单元格公式不能为空')
          工作表.getCell(行号 + 1, 列号 + 1).value = { formula: 单元.公式, result: 单元.结果 }
          return
        }
        let 文本
        if (单元 == null) 文本 = ''
        else if (typeof 单元 === 'object' && 单元.文字 && Array.isArray(单元.文字)) {
          文本 = 单元.文字.map((片段) => (片段 && 片段.文本) || '').join('')
        } else {
          文本 = String(单元)
        }
        工作表.getCell(行号 + 1, 列号 + 1).value = 转单元格值(文本)
      })
    })
  })
  return 工作簿.xlsx.writeBuffer()
}

function 转义(文本) {
  return 文本.replace(/[&<>"']/g, (字符) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[字符]))
}

module.exports = { 读取xlsx, 写入xlsx }
