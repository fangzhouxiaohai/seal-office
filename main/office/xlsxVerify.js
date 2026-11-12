// 保存后回读校验：对写盘后重新读取的 xlsx 与保存时的编辑模型逐项比对。
// 复用 读取xlsx 的解析路径，避免两套解析器判据不一致；只报告差异，不修改任何文件。
const JSZip = require('jszip')
const { 读取xlsx, 工作表Xml路径列表, 转单元格值 } = require('./xlsxCodec')
const { 规范公式函数名 } = require('./xlsxFunctionNames')
const { 规范筛选, 解析筛选范围, 行满足筛选 } = require('./xlsxFilter')
const { 解码Xml实体 } = require('./xmlEntities')

const 抽样阈值行数 = 10000
const 差异上限 = 200
const 列宽容差 = 0.01
const 行高容差 = 0.05

function 列名(序号) {
  let 结果 = ''
  for (let 当前 = 序号 + 1; 当前 > 0; 当前 = Math.floor((当前 - 1) / 26)) 结果 = String.fromCharCode(65 + (当前 - 1) % 26) + 结果
  return 结果
}

/** 与 写入xlsx 相同的输入归一化：{ 工作表: [...] } 或旧版 { 行 }。 */
function 归一化表定义(模型) {
  if (模型 && Array.isArray(模型.工作表)) {
    const 列表 = 模型.工作表.map((表, 序号) => {
      if (!表 || !Array.isArray(表.数据)) return null
      const 名称 = typeof 表.名称 === 'string' && 表.名称.trim() !== '' ? 表.名称 : `工作表${序号 + 1}`
      return { ...表, 名称: 名称.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || '工作表' }
    }).filter(Boolean)
    return 列表.length ? 列表 : [{ 名称: '工作表', 数据: [] }]
  }
  if (模型 && Array.isArray(模型.行)) return [{ 名称: '工作表', 数据: 模型.行 }]
  return [{ 名称: '工作表', 数据: [] }]
}

/** 解析 读取xlsx 产出的 HTML 表格为 [行][列] = { 文本, 公式 }。 */
function 解析Html表格(html) {
  return [...String(html).matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((行) =>
    [...行[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map((格) => {
      const 公式 = 格[1].match(/\bdata-formula="([^"]*)"/)?.[1]
      return { 文本: 解码Xml实体(格[2], '电子表格'), ...(公式 !== undefined ? { 公式: 解码Xml实体(公式, '电子表格') } : {}) }
    }))
}

/** 期望单元格：{ 类型: '空' | '数值' | '文本' | '公式', 值, 公式? , 格式? } */
function 期望单元格(单元) {
  if (单元 === '' || 单元 === null || 单元 === undefined) return { 类型: '空', 值: '' }
  if (typeof 单元 !== 'object') {
    const 值 = 转单元格值(String(单元))
    return typeof 值 === 'number' ? { 类型: '数值', 值 } : { 类型: '文本', 值 }
  }
  const 格式 = 单元.格式
  if (typeof 单元.公式 === 'string') {
    return { 类型: '公式', 公式: 单元.保留公式拼写 ? 单元.公式 : 规范公式函数名(单元.公式), 值: 单元.结果, 格式 }
  }
  if (Object.prototype.hasOwnProperty.call(单元, '值')) {
    const 值 = 单元.值
    if (typeof 值 === 'number') return { 类型: '数值', 值, 格式 }
    if (值 && typeof 值 === 'object') return { 类型: '文本', 值: String(值.error), 格式 }
    return { 类型: '文本', 值: String(值), 格式 }
  }
  const 文本 = Array.isArray(单元.文字) ? 单元.文字.map((片段) => (片段 && 片段.文本) || '').join('') : String(单元)
  if (单元.超链接 !== undefined || 单元.富文本 || 单元.类型 === '文本') return { 类型: 文本 === '' ? '空' : '文本', 值: 文本, 格式 }
  const 值 = 转单元格值(文本)
  if (值 === '') return { 类型: '空', 值: '', 格式 }
  return typeof 值 === 'number' ? { 类型: '数值', 值, 格式 } : { 类型: '文本', 值, 格式 }
}

/** 忽略 Excel 未来函数前缀与空白差异后的公式比较，避免把等价写法误报为差异。 */
function 公式相同(期望, 实际) {
  const 去等号 = (文本) => String(文本 ?? '').replace(/^=/, '')
  const 宽松 = (文本) => 去等号(文本).replace(/_xlfn\._xlws\.|_xlfn\.|_xlws\./gi, '').replace(/\s+/g, '')
  return 去等号(期望) === 去等号(实际) || 宽松(期望) === 宽松(实际)
}

function 内容相同(期望, 实际文本) {
  if (期望.类型 === '空') return 实际文本 === ''
  if (期望.类型 === '数值') return 实际文本.trim() !== '' && Number(实际文本) === 期望.值
  return 实际文本 === 期望.值
}

function 规范颜色(颜色) {
  return typeof 颜色 === 'string' && 颜色 ? 颜色.toUpperCase() : ''
}

function 规范引用(文本) {
  return typeof 文本 === 'string' ? 文本.replace(/\$/g, '').replace(/\s+/g, '').toUpperCase() : ''
}

/** 读取每张工作表实际隐藏的行号（0 起始），直接解析写盘后的 XML。 */
async function 读取隐藏行(压缩包, 工作表数) {
  const 路径列表 = await 工作表Xml路径列表(压缩包)
  const 结果 = []
  for (let 索引 = 0; 索引 < 工作表数; 索引 += 1) {
    const 部件 = 压缩包.file(路径列表[索引] ?? '')
    const 隐藏 = new Set()
    if (部件) {
      const xml = await 部件.async('string')
      for (const 匹配 of xml.matchAll(/<row\b([^>]*)>/g)) {
        if (!/\bhidden\s*=\s*"(?:1|true)"/.test(匹配[1])) continue
        const 行号 = Number(匹配[1].match(/\br\s*=\s*"(\d+)"/)?.[1])
        if (Number.isInteger(行号)) 隐藏.add(行号 - 1)
      }
    }
    结果.push(隐藏)
  }
  return 结果
}

/** 选取需要比对的行：不超过阈值时全量；否则取首尾各 500 行与均匀抽样行。 */
function 选取比对行(总行数) {
  if (总行数 <= 抽样阈值行数) return { 行列表: Array.from({ length: 总行数 }, (_, 行) => 行), 已抽样: false }
  const 集合 = new Set()
  for (let 行 = 0; 行 < Math.min(500, 总行数); 行 += 1) 集合.add(行)
  for (let 行 = Math.max(0, 总行数 - 500); 行 < 总行数; 行 += 1) 集合.add(行)
  const 步长 = Math.ceil(总行数 / 2000)
  for (let 行 = 0; 行 < 总行数; 行 += 步长) 集合.add(行)
  return { 行列表: [...集合].sort((左, 右) => 左 - 右), 已抽样: true }
}

function 显示值(值) {
  if (值 === undefined || 值 === null || 值 === '') return '（空）'
  return String(值).length > 60 ? `${String(值).slice(0, 60)}…` : String(值)
}

/** 生成一条差异的中文说明；固定前缀便于渲染层翻译。 */
function 格式化差异(项) {
  const 位置 = 项.位置 ? ` ${项.位置}` : ''
  return `工作表“${项.表}”${位置}：${项.项目}不一致（期望：${显示值(项.期望)}；实际：${显示值(项.实际)}）`
}

/**
 * 回读校验。数据为写盘后从磁盘重新读取的字节，期望模型为保存时传给 写入xlsx 的模型。
 * 返回 { 一致, 失败: 差异[], 警告: 差异[], 已抽样, 失败总数, 警告总数 }；
 * 差异项：{ 表, 位置?, 项目, 期望, 实际, 说明 }。
 */
async function 校验xlsx回读(数据, 期望模型) {
  const 失败 = []
  const 警告 = []
  let 失败总数 = 0
  let 警告总数 = 0
  const 记录 = (列表, 项) => {
    if (列表 === 失败) 失败总数 += 1
    else 警告总数 += 1
    if (列表.length < 差异上限) 列表.push({ ...项, 说明: 格式化差异(项) })
  }
  const 缓冲 = Buffer.from(数据)
  let 读回
  try {
    读回 = await 读取xlsx(缓冲)
  } catch (错误) {
    记录(失败, { 表: '工作簿', 项目: '文件结构', 期望: '可正常读取', 实际: 错误.message || '无法读取' })
    return { 一致: false, 失败, 警告, 已抽样: false, 失败总数, 警告总数 }
  }
  const 期望表列表 = 归一化表定义(期望模型)
  const 实际表列表 = 读回.工作表列表 ?? []
  if (实际表列表.length !== 期望表列表.length) {
    记录(失败, { 表: '工作簿', 项目: '工作表数量', 期望: 期望表列表.length, 实际: 实际表列表.length })
  }
  const 隐藏行列表 = await 读取隐藏行(await JSZip.loadAsync(缓冲), 实际表列表.length)
  let 已抽样 = false
  期望表列表.forEach((期望表, 索引) => {
    const 实际表 = 实际表列表[索引]
    if (!实际表) return
    const 表 = 期望表.名称
    if (实际表.名称 !== 表) 记录(失败, { 表, 项目: '工作表名称', 期望: 表, 实际: 实际表.名称 })
    const 元数据 = 实际表.元数据 ?? {}
    const 格子 = 解析Html表格(实际表.html)
    const 实际文本 = (行, 列) => 格子[行]?.[列]?.文本 ?? ''
    const 数据 = 期望表.数据.map((行) => Array.isArray(行) ? 行 : [行])
    const { 行列表, 已抽样: 本表抽样 } = 选取比对行(Math.max(数据.length, 格子.length))
    已抽样 = 已抽样 || 本表抽样
    for (const 行 of 行列表) {
      const 列数 = Math.max(数据[行]?.length ?? 0, 格子[行]?.length ?? 0)
      for (let 列 = 0; 列 < 列数; 列 += 1) {
        const 位置 = `${列名(列)}${行 + 1}`
        const 期望 = 期望单元格(数据[行]?.[列])
        const 实际 = 格子[行]?.[列] ?? { 文本: '' }
        if (期望.类型 === '公式') {
          if (!公式相同(期望.公式, 实际.公式)) 记录(失败, { 表, 位置, 项目: '公式', 期望: `=${期望.公式}`, 实际: 实际.公式 ?? '' })
        } else {
          if (实际.公式 !== undefined) 记录(失败, { 表, 位置, 项目: '公式', 期望: '', 实际: 实际.公式 })
          else if (!内容相同(期望, 实际.文本)) 记录(失败, { 表, 位置, 项目: '单元格内容', 期望: 期望.值, 实际: 实际.文本 })
        }
        const 实际格式 = 元数据.单元格格式?.[位置] ?? {}
        for (const [字段, 项目] of [['字体颜色', '字体颜色'], ['填充颜色', '填充颜色']]) {
          const 期望色 = 规范颜色(期望.格式?.[字段])
          if (期望色 && 期望色 !== 规范颜色(实际格式[字段])) 记录(失败, { 表, 位置, 项目, 期望: 期望色, 实际: 规范颜色(实际格式[字段]) })
        }
      }
    }
    // 合并区域按集合比对
    const 期望合并 = new Set((期望表.合并区域 ?? []).map(规范引用))
    const 实际合并 = new Set((元数据.合并区域 ?? []).map(规范引用))
    for (const 区域 of 期望合并) if (!实际合并.has(区域)) 记录(失败, { 表, 位置: 区域, 项目: '合并区域', 期望: '已合并', 实际: '未合并' })
    for (const 区域 of 实际合并) if (!期望合并.has(区域)) 记录(失败, { 表, 位置: 区域, 项目: '合并区域', 期望: '未合并', 实际: '已合并' })
    // 筛选条件：列号、值集合、自定义运算符、范围与排序状态
    let 期望筛选
    try { 期望筛选 = 期望表.筛选 ? 规范筛选(期望表.筛选, 数据) : undefined } catch { 期望筛选 = 期望表.筛选 }
    const 实际筛选 = 元数据.筛选
    if (JSON.stringify(期望筛选 ?? null) !== JSON.stringify(实际筛选 ?? null)) {
      记录(失败, { 表, 项目: '筛选条件', 期望: 期望筛选 ? 筛选摘要(期望筛选) : '', 实际: 实际筛选 ? 筛选摘要(实际筛选) : '' })
    }
    // 隐藏行：按期望筛选在回读内容上的结果比对（警告级）
    const 范围 = 期望筛选 ? 解析筛选范围(期望筛选.范围) : null
    const 实际隐藏 = 隐藏行列表[索引] ?? new Set()
    const 期望隐藏 = new Set()
    if (范围 && Array.isArray(期望筛选.列条件)) {
      for (let 行 = 范围.起行 + 1; 行 <= Math.min(范围.止行, 数据.length - 1); 行 += 1) {
        if (!行满足筛选(期望筛选, 行, 实际文本)) 期望隐藏.add(行)
      }
    }
    const 隐藏差异 = [...new Set([...期望隐藏, ...实际隐藏])].filter((行) => 期望隐藏.has(行) !== 实际隐藏.has(行))
    if (隐藏差异.length) 记录(警告, { 表, 位置: 隐藏差异.slice(0, 5).map((行) => `第 ${行 + 1} 行`).join('、'), 项目: '隐藏行', 期望: '与筛选条件一致', 实际: '隐藏状态不同' })
    // 打印区域与标题（警告级）
    const 期望页面 = 期望表.页面设置 ?? {}
    const 实际页面 = 实际表.页面设置 ?? {}
    for (const [字段, 项目] of [['打印区域', '打印区域'], ['打印标题行', '打印标题行'], ['打印标题列', '打印标题列']]) {
      if (规范引用(期望页面[字段]) !== 规范引用(实际页面[字段])) 记录(警告, { 表, 项目, 期望: 期望页面[字段] ?? '', 实际: 实际页面[字段] ?? '' })
    }
    // 列宽与行高（警告级，列宽容差 ±0.01 字符）
    const 实际列宽 = (列) => 元数据.列布局?.find((项) => 列 >= 项.起列 && 列 <= 项.止列)?.宽度 ?? 元数据.列宽?.[列]
    const 期望列宽 = (列) => {
      const 宽 = 期望表.列宽?.[列]
      if (Number.isFinite(宽) && 宽 > 0) return 宽
      return 期望表.列布局?.find((项) => 列 >= 项.起列 && 列 <= 项.止列)?.宽度
    }
    const 最大列 = Math.max(期望表.列宽?.length ?? 0, ...(期望表.列布局 ?? []).map((项) => Math.min(项.止列 + 1, 16384)))
    for (let 列 = 0; 列 < Math.min(最大列, 16384); 列 += 1) {
      const 期望宽 = 期望列宽(列)
      if (!Number.isFinite(期望宽) || 期望宽 <= 0) continue
      const 实际宽 = 实际列宽(列)
      if (!Number.isFinite(实际宽) || Math.abs(期望宽 / 7 - 实际宽 / 7) > 列宽容差) {
        记录(警告, { 表, 位置: `${列名(列)} 列`, 项目: '列宽', 期望: (期望宽 / 7).toFixed(2), 实际: Number.isFinite(实际宽) ? (实际宽 / 7).toFixed(2) : '' })
      }
    }
    ;(期望表.行高 ?? []).forEach((高, 行) => {
      if (!Number.isFinite(高) || 高 <= 0) return
      const 实际高 = 元数据.行高?.[行]
      if (!Number.isFinite(实际高) || Math.abs(高 - 实际高) > 行高容差) {
        记录(警告, { 表, 位置: `第 ${行 + 1} 行`, 项目: '行高', 期望: (高 * 3 / 4).toFixed(2), 实际: Number.isFinite(实际高) ? (实际高 * 3 / 4).toFixed(2) : '' })
      }
    })
  })
  return { 一致: 失败总数 === 0, 失败, 警告, 已抽样, 失败总数, 警告总数 }
}

/** 筛选的简短中文摘要，用于差异说明。 */
function 筛选摘要(筛选) {
  if (!Array.isArray(筛选?.列条件)) return JSON.stringify(筛选)
  const 条件 = 筛选.列条件.map((项) => {
    const 列 = `${列名(项.列)} 列`
    if (项.原始Xml) return `${列}原样保留条件`
    if (项.自定义) return `${列}${项.自定义.条件.map((子项) => `${子项.运算符} ${子项.值}`).join(项.自定义.且 ? ' 且 ' : ' 或 ')}`
    return `${列}${[...(项.值列表 ?? []), ...(项.空白 ? ['（空白）'] : [])].join('/')}`
  })
  return `${筛选.范围} ${条件.join('；')}${筛选.排序状态Xml ? '；含排序状态' : ''}`
}

module.exports = { 校验xlsx回读, 格式化差异 }
