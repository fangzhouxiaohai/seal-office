const ExcelJS = require('exceljs')
const JSZip = require('jszip')
const path = require('path')

const 单张图片字节上限 = 5 * 1024 * 1024
const 工作簿图片字节上限 = 20 * 1024 * 1024
const 图片尺寸上限 = 4096
const 图片行上限 = 500
const 图片列上限 = 50

function 识别图片格式(数据) {
  if (!Buffer.isBuffer(数据)) return null
  if (数据.length >= 45 && 数据.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    let 偏移 = 8
    let 有图像内容 = false
    while (偏移 + 12 <= 数据.length) {
      const 长度 = 数据.readUInt32BE(偏移)
      if (长度 > 数据.length - 偏移 - 12) return null
      const 类型 = 数据.toString('ascii', 偏移 + 4, 偏移 + 8)
      if (偏移 === 8 && (类型 !== 'IHDR' || 长度 !== 13 || 数据.readUInt32BE(偏移 + 8) === 0 || 数据.readUInt32BE(偏移 + 12) === 0)) return null
      if (类型 === 'IDAT') 有图像内容 = true
      偏移 += 长度 + 12
      if (类型 === 'IEND') return 长度 === 0 && 偏移 === 数据.length && 有图像内容 ? 'png' : null
    }
    return null
  }
  if (数据.length >= 16 && 数据[0] === 0xff && 数据[1] === 0xd8 &&
    数据[数据.length - 2] === 0xff && 数据[数据.length - 1] === 0xd9) {
    let 偏移 = 2
    let 有图像尺寸 = false
    while (偏移 < 数据.length - 2) {
      if (数据[偏移] !== 0xff) return null
      while (数据[偏移] === 0xff) 偏移 += 1
      const 标记 = 数据[偏移]
      偏移 += 1
      if (标记 === 0xd9 || 标记 === 0x00 || 偏移 + 2 > 数据.length - 2) return null
      if (标记 === 0x01 || (标记 >= 0xd0 && 标记 <= 0xd7)) continue
      const 长度 = 数据.readUInt16BE(偏移)
      if (长度 < 2 || 偏移 + 长度 > 数据.length - 2) return null
      if ((标记 >= 0xc0 && 标记 <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(标记)) &&
        长度 >= 8 && 数据.readUInt16BE(偏移 + 3) > 0 && 数据.readUInt16BE(偏移 + 5) > 0) 有图像尺寸 = true
      if (标记 === 0xda) return 有图像尺寸 && 偏移 + 长度 < 数据.length - 2 ? 'jpeg' : null
      偏移 += 长度
    }
  }
  return null
}

function 解码图片(图片, 状态) {
  if (!图片 || !['png', 'jpeg'].includes(图片.格式) || typeof 图片.数据 !== 'string' ||
    图片.数据.length === 0 || 图片.数据.length % 4 !== 0) {
    throw new Error('图片格式或数据无效')
  }
  const 预计字节 = 图片.数据.length * 3 / 4 - (图片.数据.endsWith('==') ? 2 : 图片.数据.endsWith('=') ? 1 : 0)
  if (预计字节 > 单张图片字节上限) throw new Error('单张图片超过五兆字节')
  if (状态.总字节 + 预计字节 > 工作簿图片字节上限) throw new Error('工作簿图片超过二十兆字节')
  const 数据 = Buffer.from(图片.数据, 'base64')
  if (数据.length === 0 || 数据.length > 单张图片字节上限 || 数据.toString('base64') !== 图片.数据 || 识别图片格式(数据) !== 图片.格式) {
    throw new Error('图片格式或数据无效')
  }
  if (!Number.isInteger(图片.行) || 图片.行 < 0 || 图片.行 >= 图片行上限 ||
    !Number.isInteger(图片.列) || 图片.列 < 0 || 图片.列 >= 图片列上限 ||
    !Number.isInteger(图片.宽) || 图片.宽 < 1 || 图片.宽 > 图片尺寸上限 ||
    !Number.isInteger(图片.高) || 图片.高 < 1 || 图片.高 > 图片尺寸上限) {
    throw new Error('图片位置或尺寸无效')
  }
  状态.总字节 += 数据.length
  if (状态.总字节 > 工作簿图片字节上限) throw new Error('工作簿图片超过二十兆字节')
  return 数据
}

function 锚点距离(工作表, 起始, 结束, 方向) {
  const 起始索引 = 方向 === '列' ? 起始.nativeCol : 起始.nativeRow
  const 结束索引 = 方向 === '列' ? 结束.nativeCol : 结束.nativeRow
  const 起始偏移 = 方向 === '列' ? 起始.nativeColOff : 起始.nativeRowOff
  const 结束偏移 = 方向 === '列' ? 结束.nativeColOff : 结束.nativeRowOff
  const 索引上限 = 方向 === '列' ? 16384 : 1048576
  if (!Number.isInteger(起始索引) || !Number.isInteger(结束索引) || 起始索引 < 0 || 结束索引 >= 索引上限 ||
    结束索引 < 起始索引 || 结束索引 - 起始索引 > 图片尺寸上限) return null
  let 距离 = (结束偏移 - 起始偏移) / 9525
  for (let 索引 = 起始索引; 索引 < 结束索引; 索引 += 1) {
    const 尺寸 = 方向 === '列' ? 工作表.getColumn(索引 + 1).width : 工作表.getRow(索引 + 1).height
    距离 += 方向 === '列' ? (Number.isFinite(尺寸) ? 尺寸 * 7 : 64) : (Number.isFinite(尺寸) ? 尺寸 * 4 / 3 : 20)
    if (距离 > 图片尺寸上限 + 1) return null
  }
  return Math.round(距离)
}

function 读取工作表图片(工作表, 工作簿, 状态) {
  const 图片列表 = []
  for (const 图片 of 工作表.getImages()) {
    const 媒体 = 工作簿.getImage(图片.imageId)
    const 格式 = 媒体?.extension?.toLowerCase() === 'jpg' ? 'jpeg' : 媒体?.extension?.toLowerCase()
    const 数据 = 媒体?.buffer
    const 起点 = 图片.range?.tl
    const 宽 = 图片.range?.ext?.width ?? (图片.range?.br && 起点 ? 锚点距离(工作表, 起点, 图片.range.br, '列') : null)
    const 高 = 图片.range?.ext?.height ?? (图片.range?.br && 起点 ? 锚点距离(工作表, 起点, 图片.range.br, '行') : null)
    const 行 = 起点?.nativeRow
    const 列 = 起点?.nativeCol
    const 尺寸宽 = Math.round(宽)
    const 尺寸高 = Math.round(高)
    if (!['png', 'jpeg'].includes(格式) || !Buffer.isBuffer(数据) || 数据.length === 0 ||
      数据.length > 单张图片字节上限 || 识别图片格式(数据) !== 格式 ||
      !Number.isInteger(行) || 行 < 0 || 行 >= 图片行上限 || !Number.isInteger(列) || 列 < 0 || 列 >= 图片列上限 ||
      !Number.isInteger(尺寸宽) || 尺寸宽 < 1 || 尺寸宽 > 图片尺寸上限 ||
      !Number.isInteger(尺寸高) || 尺寸高 < 1 || 尺寸高 > 图片尺寸上限 ||
      状态.总字节 + 数据.length > 工作簿图片字节上限) {
      状态.警告.add('图片或媒体未导入')
      状态.警告.add('绘图对象未导入')
      continue
    }
    状态.总字节 += 数据.length
    状态.已导入图片数 += 1
    if (typeof 媒体.name === 'string' && 媒体.name) 状态.已导入媒体.add(`${媒体.name}.${媒体.extension}`.toLowerCase())
    else 状态.无名媒体.push(数据)
    const 超链接 = 图片.range.hyperlinks
    const 有超链接 = 超链接 && typeof 超链接 === 'object' &&
      (typeof 超链接.hyperlink === 'string' && 超链接.hyperlink.length > 0 ||
        typeof 超链接.rId === 'string' && 超链接.rId.length > 0 ||
        typeof 超链接.tooltip === 'string' && 超链接.tooltip.length > 0)
    const 锚点规则不同 = 图片.range.editAs !== undefined && 图片.range.editAs !== 'oneCell'
    if (起点.nativeColOff || 起点.nativeRowOff || 图片.range.br?.nativeColOff || 图片.range.br?.nativeRowOff ||
      锚点规则不同 || 有超链接) 状态.警告.add('绘图对象未导入')
    图片列表.push({ 格式, 数据: 数据.toString('base64'), 行, 列, 宽: 尺寸宽, 高: 尺寸高 })
  }
  return 图片列表
}

function 读取批注文本(批注) {
  if (typeof 批注 === 'string') return 批注
  if (批注 && Array.isArray(批注.texts)) {
    return 批注.texts.map((片段) => typeof 片段.text === 'string' ? 片段.text : '').join('')
  }
  return null
}

const 页边距方案 = {
  常规: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  窄: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  适中: { left: 0.75, right: 0.75, top: 1, bottom: 1, header: 0.3, footer: 0.3 },
  宽: { left: 1, right: 1, top: 1, bottom: 1, header: 0.3, footer: 0.3 },
}
const 纸张编号 = { Letter: 1, A4: 9, A5: 11, B5: 13 }
const 基础数字格式 = { 常规: 'General', 货币: '"¥"#,##0.00', 百分比: '0.00%', 千位分隔: '#,##0' }

function 转写颜色(颜色) {
  if (typeof 颜色 !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(颜色)) throw new Error('单元格颜色格式无效')
  return { argb: `FF${颜色.slice(1).toUpperCase()}` }
}

function 读取颜色(颜色, 警告) {
  const 值 = 颜色?.argb
  if (typeof 值 === 'string' && /^FF[0-9a-fA-F]{6}$/.test(值)) return `#${值.slice(2).toUpperCase()}`
  if (颜色) 警告.add('部分主题色或透明颜色未导入')
  return undefined
}

function 写入基础格式(单元格, 格式) {
  if (!格式 || Object.keys(格式).length === 0) return
  const 字体 = {}
  if (格式.字体 !== undefined) 字体.name = 格式.字体
  if (格式.字号 !== undefined) 字体.size = 格式.字号
  if (格式.加粗 !== undefined) 字体.bold = 格式.加粗
  if (格式.斜体 !== undefined) 字体.italic = 格式.斜体
  if (格式.下划线 !== undefined) 字体.underline = 格式.下划线
  if (格式.字体颜色) 字体.color = 转写颜色(格式.字体颜色)
  if (Object.keys(字体).length > 0) 单元格.font = 字体
  if (格式.填充颜色) 单元格.fill = { type: 'pattern', pattern: 'solid', fgColor: 转写颜色(格式.填充颜色) }
  const 对齐 = {}
  if (格式.水平对齐) 对齐.horizontal = 格式.水平对齐
  if (格式.垂直对齐) 对齐.vertical = 格式.垂直对齐
  if (格式.自动换行 !== undefined) 对齐.wrapText = 格式.自动换行
  if (Object.keys(对齐).length > 0) 单元格.alignment = 对齐
  if (格式.数字格式) {
    if (格式.数字格式 === '数值') 单元格.numFmt = `0.${'0'.repeat(格式.小数位 ?? 2)}`
    else 单元格.numFmt = 基础数字格式[格式.数字格式]
  }
  if (格式.边框) {
    const 边框 = {}
    for (const [中文, 英文] of [['上', 'top'], ['下', 'bottom'], ['左', 'left'], ['右', 'right']]) {
      if (格式.边框[中文]) 边框[英文] = { style: 'thin' }
    }
    单元格.border = 边框
  }
}

function 读取基础格式(单元格, 警告) {
  const 原格式 = 单元格.style ?? {}
  const 格式 = {}
  const 字体 = 原格式.font
  if (字体) {
    if (字体.name) 格式.字体 = 字体.name
    if (typeof 字体.size === 'number') 格式.字号 = 字体.size
    if (字体.bold !== undefined) 格式.加粗 = !!字体.bold
    if (字体.italic !== undefined) 格式.斜体 = !!字体.italic
    if (字体.underline !== undefined) {
      格式.下划线 = !!字体.underline
      if (字体.underline !== true && 字体.underline !== false && 字体.underline !== 'single') 警告.add('部分下划线样式未导入')
    }
    if (字体.color) 格式.字体颜色 = 读取颜色(字体.color, 警告)
    if (Object.keys(字体).some((字段) => !['name', 'size', 'bold', 'italic', 'underline', 'color', 'family', 'scheme'].includes(字段))) 警告.add('部分字体样式未导入')
  }
  if (原格式.fill) {
    if (原格式.fill.type === 'pattern' && 原格式.fill.pattern === 'solid') 格式.填充颜色 = 读取颜色(原格式.fill.fgColor, 警告)
    else if (原格式.fill.type !== 'pattern' || 原格式.fill.pattern !== 'none') 警告.add('部分单元格填充样式未导入')
  }
  const 对齐 = 原格式.alignment
  if (对齐) {
    if (对齐.horizontal) {
      if (['left', 'center', 'right'].includes(对齐.horizontal)) 格式.水平对齐 = 对齐.horizontal
      else 警告.add('部分水平对齐样式未导入')
    }
    if (对齐.vertical) {
      if (['top', 'middle', 'bottom'].includes(对齐.vertical)) 格式.垂直对齐 = 对齐.vertical
      else 警告.add('部分垂直对齐样式未导入')
    }
    if (对齐.wrapText !== undefined) 格式.自动换行 = !!对齐.wrapText
    if (Object.keys(对齐).some((字段) => !['horizontal', 'vertical', 'wrapText'].includes(字段))) 警告.add('部分对齐样式未导入')
  }
  if (原格式.numFmt && 原格式.numFmt !== 'General') {
    if (原格式.numFmt === 基础数字格式.货币) 格式.数字格式 = '货币'
    else if (原格式.numFmt === 基础数字格式.百分比) 格式.数字格式 = '百分比'
    else if (原格式.numFmt === 基础数字格式.千位分隔) 格式.数字格式 = '千位分隔'
    else if (/^0\.[0]{1,10}$/.test(原格式.numFmt)) {
      格式.数字格式 = '数值'
      格式.小数位 = 原格式.numFmt.length - 2
    } else 警告.add('部分数字格式未导入')
  }
  if (原格式.border) {
    const 边框 = {}
    for (const [中文, 英文] of [['上', 'top'], ['下', 'bottom'], ['左', 'left'], ['右', 'right']]) {
      if (原格式.border[英文]) {
        边框[中文] = true
        if (原格式.border[英文].style !== 'thin') 警告.add('部分边框样式未导入')
        if (原格式.border[英文].color) 警告.add('部分边框样式未导入')
      }
    }
    if (Object.keys(边框).length > 0) 格式.边框 = 边框
    if (Object.keys(原格式.border).some((字段) => !['top', 'bottom', 'left', 'right'].includes(字段))) 警告.add('部分边框样式未导入')
  }
  if (Object.keys(原格式).some((字段) => !['font', 'fill', 'alignment', 'numFmt', 'border', 'protection'].includes(字段))) 警告.add('部分单元格样式未导入')
  if (原格式.protection) 警告.add('单元格保护属性未导入')
  return 格式
}

function 写入数据验证(单元格, 规则) {
  if (!规则) return
  if (规则.类型 === '列表') {
    if (!Array.isArray(规则.选项) || 规则.选项.length === 0 || 规则.选项.some((值) => typeof 值 !== 'string' || !值.trim() || 值.includes(',')) || `"${规则.选项.join(',')}"`.length > 255) throw new Error('数据验证列表选项无效')
    单元格.dataValidation = { type: 'list', allowBlank: 规则.允许空白 === true, showErrorMessage: true, errorStyle: 'error', errorTitle: '输入不符合规则', error: '请从下拉列表选择有效项目', formulae: [`"${规则.选项.join(',')}"`] }
    return
  }
  if (!['整数', '小数'].includes(规则.类型) || !Number.isFinite(规则.最小值) || !Number.isFinite(规则.最大值) || 规则.最小值 > 规则.最大值 || (规则.类型 === '整数' && (!Number.isInteger(规则.最小值) || !Number.isInteger(规则.最大值)))) throw new Error('数据验证数值范围无效')
  单元格.dataValidation = { type: 规则.类型 === '整数' ? 'whole' : 'decimal', operator: 'between', allowBlank: 规则.允许空白 === true, showErrorMessage: true, errorStyle: 'error', errorTitle: '输入不符合规则', error: '请输入限定范围内的数值', formulae: [规则.最小值, 规则.最大值] }
}

function 读取数据验证规则(原规则, 警告) {
  if (!原规则 || typeof 原规则 !== 'object') return null
  const 允许空白 = 原规则.allowBlank === true
  if (原规则.showErrorMessage === false || (原规则.errorStyle && 原规则.errorStyle !== 'error')) {
    警告.add('数据验证规则未导入')
    return null
  }
  if (原规则.type === 'list' && Array.isArray(原规则.formulae) && 原规则.formulae.length === 1) {
    const 来源 = 原规则.formulae[0]
    if (typeof 来源 === 'string' && /^"[^"]+"$/.test(来源)) {
      const 选项 = 来源.slice(1, -1).split(',')
      if (选项.every((值) => 值.trim() !== '')) return { 类型: '列表', 选项, 允许空白 }
    }
  }
  if ((原规则.type === 'whole' || 原规则.type === 'decimal') && 原规则.operator === 'between' && Array.isArray(原规则.formulae) && 原规则.formulae.length === 2) {
    const 最小值 = Number(原规则.formulae[0])
    const 最大值 = Number(原规则.formulae[1])
    if (Number.isFinite(最小值) && Number.isFinite(最大值) && 最小值 <= 最大值 && (原规则.type !== 'whole' || (Number.isInteger(最小值) && Number.isInteger(最大值)))) {
      return { 类型: 原规则.type === 'whole' ? '整数' : '小数', 最小值, 最大值, 允许空白 }
    }
  }
  警告.add('数据验证规则未导入')
  return null
}

function 展开验证区域(区域) {
  const 匹配 = 区域.match(/^([A-Z]+)([1-9]\d*)(?::([A-Z]+)([1-9]\d*))?$/)
  if (!匹配) return null
  const 列号 = (字母) => [...字母].reduce((值, 字符) => 值 * 26 + 字符.charCodeAt(0) - 64, 0)
  const 转列名 = (序号) => {
    let 结果 = ''
    for (let 当前 = 序号; 当前 > 0; 当前 = Math.floor((当前 - 1) / 26)) 结果 = String.fromCharCode(65 + (当前 - 1) % 26) + 结果
    return 结果
  }
  const 起始列 = 列号(匹配[1])
  const 结束列 = 匹配[3] ? 列号(匹配[3]) : 起始列
  const 起始行 = Number(匹配[2])
  const 结束行 = 匹配[4] ? Number(匹配[4]) : 起始行
  if (结束列 < 起始列 || 结束行 < 起始行 || (结束列 - 起始列 + 1) * (结束行 - 起始行 + 1) > 10000) return null
  const 地址 = []
  for (let 行 = 起始行; 行 <= 结束行; 行 += 1) for (let 列 = 起始列; 列 <= 结束列; 列 += 1) 地址.push(`${转列名(列)}${行}`)
  return 地址
}

function 读取工作表验证(工作表, 警告) {
  const 单元格验证 = {}
  for (const [区域, 原规则] of Object.entries(工作表.dataValidations?.model ?? {})) {
    const 地址列表 = 展开验证区域(区域)
    const 规则 = 读取数据验证规则(原规则, 警告)
    if (!地址列表 || !规则) {
      警告.add('数据验证规则未导入')
      continue
    }
    地址列表.forEach((地址) => { 单元格验证[地址] = 规则 })
    if (原规则.showInputMessage || (原规则.errorTitle && 原规则.errorTitle !== '输入不符合规则') || (原规则.error && !['请从下拉列表选择有效项目', '请输入限定范围内的数值'].includes(原规则.error))) 警告.add('数据验证提示文字未导入')
  }
  return 单元格验证
}

function 读取工作表元数据(工作表, 警告, 筛选, 保护) {
  const 单元格格式 = {}
  工作表.eachRow({ includeEmpty: true }, (行) => {
    行.eachCell({ includeEmpty: true }, (单元格) => {
      const 格式 = 读取基础格式(单元格, 警告)
      if (Object.keys(格式).length > 0) 单元格格式[单元格.address] = 格式
    })
  })
  const 列宽 = {}
  ;(工作表.columns ?? []).forEach((列, 索引) => {
    if (typeof 列.width === 'number') 列宽[索引] = Math.round(列.width * 7)
  })
  const 行高 = {}
  工作表.eachRow({ includeEmpty: true }, (行) => {
    if (typeof 行.height === 'number') 行高[行.number - 1] = Math.round(行.height * 4 / 3)
  })
  const 视图 = 工作表.views?.[0]
  let 冻结
  if (视图?.state === 'frozen' && Number.isInteger(视图.xSplit) && Number.isInteger(视图.ySplit)) {
    冻结 = { 行: 视图.ySplit, 列: 视图.xSplit }
  } else if (工作表.views?.length > 0) 警告.add('部分工作表视图设置未导入')
  return {
    单元格格式,
    单元格验证: 读取工作表验证(工作表, 警告),
    合并区域: [...(工作表.model.merges ?? [])],
    列宽, 行高,
    ...(冻结 ? { 冻结 } : {}),
    ...(筛选 ? { 筛选 } : {}),
    ...(保护 ? { 保护 } : {}),
  }
}

function 读取Xml属性(标记, 名称) {
  const 安全名称 = 名称.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return 标记.match(new RegExp(`(?:^|\\s)${安全名称}="([^"]*)"`, 'i'))?.[1]
}

function 反转义Xml(文本) {
  return 文本.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (实体) => {
    const 固定 = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }
    if (固定[实体]) return 固定[实体]
    const 十六进制 = 实体.startsWith('&#x')
    const 数值 = parseInt(实体.slice(十六进制 ? 3 : 2, -1), 十六进制 ? 16 : 10)
    return Number.isInteger(数值) && 数值 >= 0 && 数值 <= 0x10ffff ? String.fromCodePoint(数值) : 实体
  })
}

async function 工作表Xml路径列表(压缩包) {
  const 工作簿部件 = 压缩包.file('xl/workbook.xml')
  const 关系部件 = 压缩包.file('xl/_rels/workbook.xml.rels')
  if (!工作簿部件 || !关系部件) return []
  const 工作簿Xml = await 工作簿部件.async('string')
  const 关系Xml = await 关系部件.async('string')
  const 关系 = new Map()
  for (const 匹配 of 关系Xml.matchAll(/<Relationship\b[^>]*\/?\s*>/g)) {
    const 标识 = 读取Xml属性(匹配[0], 'Id')
    const 目标 = 读取Xml属性(匹配[0], 'Target')
    if (标识 && 目标) 关系.set(标识, 目标)
  }
  return [...工作簿Xml.matchAll(/<sheet\b[^>]*\/?\s*>/g)].map((匹配) => {
    const 目标 = 关系.get(读取Xml属性(匹配[0], 'r:id'))
    if (!目标) return null
    return 目标.startsWith('/') ? 目标.slice(1) : path.posix.normalize(`xl/${目标}`)
  })
}

function 从Xml读取筛选(工作表Xml) {
  const 匹配 = 工作表Xml.match(/<autoFilter\b([^>]*?)(?:\/>|>([\s\S]*?)<\/autoFilter>)/i)
  if (!匹配) return undefined
  const 范围 = 读取Xml属性(匹配[1], 'ref')
  if (!范围 || !/^A1:[A-Z]+[1-9]\d*$/.test(范围) || !匹配[2]) return null
  const 列列表 = [...匹配[2].matchAll(/<filterColumn\b([^>]*)>([\s\S]*?)<\/filterColumn>/g)]
  if (列列表.length !== 1) return null
  if (匹配[2].replace(列列表[0][0], '').trim() !== '') return null
  const 列 = Number(读取Xml属性(列列表[0][1], 'colId'))
  if (!Number.isInteger(列) || 列 < 0) return null
  const 过滤器 = 列列表[0][2].trim().match(/^<filters\b([^>]*?)(?:\/>|>([\s\S]*?)<\/filters>)$/)
  if (!过滤器) return null
  const 空白 = 读取Xml属性(过滤器[1], 'blank') === '1'
  const 过滤器内容 = (过滤器[2] ?? '').trim()
  if (空白 && 过滤器内容 === '') return { 列, 值: '' }
  if (空白) return null
  const 值列表 = [...过滤器内容.matchAll(/<filter\b([^>]*)\/>/g)]
  if (值列表.length !== 1) return null
  if (过滤器内容.replace(值列表[0][0], '').trim() !== '') return null
  const 值 = 读取Xml属性(值列表[0][1], 'val')
  return 值 === undefined ? null : { 列, 值: 反转义Xml(值) }
}

async function 读取筛选列表(压缩包, 工作表数) {
  const 路径列表 = await 工作表Xml路径列表(压缩包)
  const 结果 = []
  for (let 索引 = 0; 索引 < 工作表数; 索引 += 1) {
    const 部件 = 压缩包.file(路径列表[索引] ?? '')
    结果.push(部件 ? 从Xml读取筛选(await 部件.async('string')) : undefined)
  }
  return 结果
}

async function 读取保护列表(压缩包, 工作表数) {
  const 路径列表 = await 工作表Xml路径列表(压缩包)
  const 结果 = []
  for (let 索引 = 0; 索引 < 工作表数; 索引 += 1) {
    const 部件 = 压缩包.file(路径列表[索引] ?? '')
    const Xml = 部件 ? await 部件.async('string') : ''
    const 匹配 = Xml.match(/<sheetProtection\b([^>]*?)\/>/i)
    if (!匹配) { 结果.push(undefined); continue }
    const 余下属性 = 匹配[1].replace(/\bsheet="1"/, '').trim()
    结果.push(余下属性 === '' ? '本机' : '外部')
  }
  return 结果
}

async function 写入筛选Xml(原数据, 筛选列表) {
  if (!筛选列表.some(Boolean)) return 原数据
  const 压缩包 = await JSZip.loadAsync(原数据)
  const 路径列表 = await 工作表Xml路径列表(压缩包)
  for (let 索引 = 0; 索引 < 筛选列表.length; 索引 += 1) {
    const 筛选 = 筛选列表[索引]
    if (!筛选) continue
    const 路径 = 路径列表[索引]
    const 部件 = 路径 && 压缩包.file(路径)
    if (!部件) throw new Error('无法定位工作表筛选数据')
    const 原Xml = await 部件.async('string')
    const 原筛选 = 原Xml.match(/<autoFilter\b[^>]*\/>/)
    if (!原筛选) throw new Error('无法写入工作表筛选条件')
    const ref = 读取Xml属性(原筛选[0], 'ref')
    const 内容 = 筛选.值 === '' ? '<filters blank="1"/>' : `<filters><filter val="${转义(筛选.值)}"/></filters>`
    const 新筛选 = `<autoFilter ref="${ref}"><filterColumn colId="${筛选.列}">${内容}</filterColumn></autoFilter>`
    压缩包.file(路径, 原Xml.replace(原筛选[0], 新筛选))
  }
  return 压缩包.generateAsync({ type: 'nodebuffer' })
}

function 读取页面设置(工作表, 警告) {
  const 原设置 = 工作表.pageSetup ?? {}
  const 页边距 = Object.entries(页边距方案).find(([, 预设]) =>
    Object.entries(预设).every(([字段, 值]) => Math.abs((原设置.margins?.[字段] ?? 值) - 值) < 0.001)
  )?.[0]
  if (!页边距) 警告.add('自定义页边距未导入')
  const 纸张大小 = 原设置.paperSize === undefined
    ? '跟随打印机'
    : Object.entries(纸张编号).find(([, 编号]) => 编号 === 原设置.paperSize)?.[0]
  if (!纸张大小) 警告.add('当前纸张规格未导入')
  if (原设置.orientation !== 'portrait' && 原设置.orientation !== 'landscape') 警告.add('纸张方向未导入')
  if (原设置.fitToPage || (typeof 原设置.scale === 'number' && 原设置.scale !== 100)) {
    警告.add('打印缩放和分页设置未导入')
  }
  return {
    页边距: 页边距 ?? '常规',
    方向: 原设置.orientation === 'landscape' ? '横向' : '纵向',
    纸张大小: 纸张大小 ?? '跟随打印机',
  }
}

function 写入页面设置(工作表, 页面) {
  if (!页面) return
  const 页边距 = 页边距方案[页面.页边距]
  const 纸张 = 纸张编号[页面.纸张大小]
  if (!页边距 || (页面.纸张大小 !== '跟随打印机' && !纸张) || !['纵向', '横向'].includes(页面.方向)) {
    throw new Error('页面设置选项无效')
  }
  工作表.pageSetup.orientation = 页面.方向 === '横向' ? 'landscape' : 'portrait'
  工作表.pageSetup.margins = { ...页边距 }
  if (纸张) 工作表.pageSetup.paperSize = 纸张
}

/** 仅对实际存在、但当前表格模型不会写回的内容发出保真提示。 */
async function 收集保真警告(工作簿, 压缩包, 筛选列表, 保护列表, 图片状态) {
  const 警告 = new Set()
  const 文件名 = Object.keys(压缩包.files).filter((名称) => !压缩包.files[名称].dir)
  const 存在部件 = (表达式) => 文件名.some((名称) => 表达式.test(名称))
  if (存在部件(/^xl\/charts\/[^/]+\.xml$/i)) 警告.add('图表未导入')
  const 未匹配媒体 = 文件名.filter((名称) => /^xl\/media\//i.test(名称) && !图片状态.已导入媒体.has(path.posix.basename(名称).toLowerCase()))
  for (const 名称 of 未匹配媒体) {
    const 部件 = 压缩包.file(名称)
    if (!图片状态.无名媒体.length || !部件 || 部件._data?.uncompressedSize > 单张图片字节上限) {
      警告.add('图片或媒体未导入')
      break
    }
    const 原始数据 = await 部件.async('nodebuffer')
    if (!图片状态.无名媒体.some((数据) => 数据.equals(原始数据))) {
      警告.add('图片或媒体未导入')
      break
    }
  }
  const 绘图路径 = 文件名.filter((名称) => /^xl\/drawings\/drawing[^/]*\.xml$/i.test(名称))
  const 绘图内容 = await Promise.all(绘图路径.map((名称) => 压缩包.file(名称).async('string')))
  const 图片节点数 = 绘图内容.reduce((数量, 内容) => 数量 + [...内容.matchAll(/<xdr:pic(?=[\s/>])/g)].length, 0)
  if (绘图内容.some((内容) => /<xdr:(?:sp|graphicFrame|grpSp|cxnSp|contentPart|absoluteAnchor)(?=[\s/>])/i.test(内容) ||
    /<a:xfrm\b[^>]*\b(?:rot|flipH|flipV)\s*=/i.test(内容) ||
    /<a:(?:srcRect|tile|effectLst|effectDag|alphaModFix|alphaRepl|grayscl|duotone|blur|lum|tint|biLevel|clrChange|clrRepl|softEdge|outerShdw|innerShdw|glow|reflection|hlinkClick)(?=[\s/>])/i.test(内容) ||
    /<xdr:cNvPr\b[^>]*\bdescr\s*=/i.test(内容)) ||
    图片节点数 !== 图片状态.已导入图片数 || (绘图路径.length > 0 && 图片节点数 === 0)) 警告.add('绘图对象未导入')
  for (const 提示 of 图片状态.警告) 警告.add(提示)
  if (存在部件(/^xl\/(?:pivotTables|pivotCache)\//i)) 警告.add('数据透视表未导入')
  if (存在部件(/^xl\/tables\//i)) 警告.add('结构化表格未导入')
  if (存在部件(/^xl\/threadedComments\//i)) 警告.add('线程批注未导入')
  if (存在部件(/^xl\/(?:externalLinks|connections|queryTables)\//i)) 警告.add('外部数据连接未导入')
  if (工作簿.definedNames?.model?.length > 0) 警告.add('命名区域未导入')

  for (const [索引, 工作表] of 工作簿.worksheets.entries()) {
    const 模型 = 工作表.model
    const 筛选 = 筛选列表[索引]
    const 隐藏行异常 = 模型.rows?.some((行) => 行 && (行.outlineLevel || 行.collapsed ||
      (行.hidden && (!筛选 || 行.number <= 1 || 工作表.getCell(行.number, 筛选.列 + 1).text === 筛选.值))))
    if (模型.cols?.some((列) => 列 && (列.hidden || 列.outlineLevel || 列.collapsed)) || 隐藏行异常) {
      警告.add('隐藏行列或分组状态未导入')
    }
    if (工作表.autoFilter && !筛选) 警告.add('筛选条件未导入')
    if (工作表.conditionalFormattings?.length > 0) 警告.add('条件格式未导入')
    if (保护列表[索引] === '外部') 警告.add('工作表保护设置未导入')
    工作表.eachRow({ includeEmpty: true }, (行) => {
      行.eachCell({ includeEmpty: true }, (单元格) => {
        if (单元格.hyperlink) 警告.add('超链接未导入')
        if (单元格.note && 读取批注文本(单元格.note) === null) 警告.add('批注未导入')
        else if (单元格.note && typeof 单元格.note !== 'string') 警告.add('批注格式未导入')
        const 值 = 单元格.value
        if (值 instanceof Date || typeof 值 === 'boolean' || (值 && typeof 值 === 'object' && 值.richText)) {
          警告.add('日期、布尔值或富文本单元格类型未保留')
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
      const 从属合并格 = 单元.isMerged && 单元.master?.address !== 单元.address
      const 公式 = !从属合并格 && typeof 单元.formula === 'string' && 单元.formula.length > 0
        ? ` data-formula="${转义(`=${单元.formula}`)}"`
        : ''
      const 值类型 = !从属合并格 && typeof 单元.value === 'string' ? ' data-value-type="text"' : ''
      const 批注文本 = 从属合并格 ? null : 读取批注文本(单元.note)
      const 批注 = 批注文本 !== null && 批注文本 !== '' ? ` data-comment="${转义(批注文本)}"` : ''
      单元格.push(`<td${公式}${值类型}${批注}>${转义(从属合并格 ? '' : String(单元.text || ''))}</td>`)
    })
    行.push(`<tr>${单元格.join('')}</tr>`)
  })
  return `<table><tbody>${行.join('')}</tbody></table>`
}

async function 读取xlsx(数据) {
  const 原始数据 = Buffer.from(数据)
  const 压缩包 = await JSZip.loadAsync(原始数据)
  const 工作簿 = new ExcelJS.Workbook()
  await 工作簿.xlsx.load(原始数据)
  const 筛选列表 = await 读取筛选列表(压缩包, 工作簿.worksheets.length)
  const 保护列表 = await 读取保护列表(压缩包, 工作簿.worksheets.length)
  const 图片状态 = { 总字节: 0, 已导入图片数: 0, 已导入媒体: new Set(), 无名媒体: [], 警告: new Set() }
  const 图片列表 = 工作簿.worksheets.map((工作表) => 读取工作表图片(工作表, 工作簿, 图片状态))
  const 警告 = await 收集保真警告(工作簿, 压缩包, 筛选列表, 保护列表, 图片状态)
  const 页面警告 = new Set(警告)
  if (!工作簿.worksheets || 工作簿.worksheets.length === 0) {
    return { html: '<p><br></p>', 警告 }
  }
  // 返回全部工作表：html 为首个工作表（兼容旧消费方），工作表列表供表格模块逐表导入
  const 工作表列表 = 工作簿.worksheets.map((工作表, 索引) => ({
    名称: 工作表.name || 'Sheet1',
    html: 工作表转Html(工作表),
    页面设置: 读取页面设置(工作表, 页面警告),
    元数据: { ...读取工作表元数据(工作表, 页面警告, 筛选列表[索引], 保护列表[索引]), 图片: 图片列表[索引] },
  }))
  return { html: 工作表列表[0].html, 工作表列表, 警告: Array.from(页面警告) }
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
  const 图片状态 = { 总字节: 0 }
  // 归一化输入为 [{ 名称, 数据: 二维数组 }]：
  // 渲染层契约为 { 工作表: [{ 名称, 数据 }] }，旧契约为 { 行: 二维数组 }（单表）。
  let 表定义列表 = []
  if (模型 && Array.isArray(模型.工作表)) {
    表定义列表 = 模型.工作表
      .map((表, 序号) => {
        if (!表 || !Array.isArray(表.数据)) return null
        const 名称 = typeof 表.名称 === 'string' && 表.名称.trim() !== '' ? 表.名称 : `工作表${序号 + 1}`
        return { 名称, 数据: 表.数据, 页面设置: 表.页面设置,
          图片: 表.图片 !== undefined ? 表.图片 : 表.元数据?.图片,
          合并区域: 表.合并区域, 列宽: 表.列宽, 行高: 表.行高, 冻结: 表.冻结, 筛选: 表.筛选, 保护: 表.保护 }
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
    if (表定义.保护 === true) 工作表.sheetProtection = { sheet: true }
    写入页面设置(工作表, 表定义.页面设置)
    if (Array.isArray(表定义.列宽)) 表定义.列宽.forEach((宽, 索引) => {
      if (Number.isFinite(宽) && 宽 > 0) 工作表.getColumn(索引 + 1).width = 宽 / 7
    })
    if (Array.isArray(表定义.行高)) 表定义.行高.forEach((高, 索引) => {
      if (Number.isFinite(高) && 高 > 0) 工作表.getRow(索引 + 1).height = 高 * 3 / 4
    })
    if (表定义.冻结 && (表定义.冻结.行 > 0 || 表定义.冻结.列 > 0)) {
      工作表.views = [{ state: 'frozen', xSplit: 表定义.冻结.列, ySplit: 表定义.冻结.行 }]
    }
    表定义.数据.forEach((行数据, 行号) => {
      const 单元格列表 = Array.isArray(行数据) ? 行数据 : [行数据]
      单元格列表.forEach((单元, 列号) => {
        const 目标单元 = 工作表.getCell(行号 + 1, 列号 + 1)
        if (单元 && typeof 单元 === 'object' && typeof 单元.公式 === 'string') {
          if (单元.公式.trim() === '') throw new Error('单元格公式不能为空')
          目标单元.value = { formula: 单元.公式, result: 单元.结果 }
          if (typeof 单元.批注 === 'string' && 单元.批注.trim()) 目标单元.note = 单元.批注
          写入基础格式(目标单元, 单元.格式)
          写入数据验证(目标单元, 单元.数据验证)
          return
        }
        let 文本
        if (单元 == null) 文本 = ''
        else if (typeof 单元 === 'object' && 单元.文字 && Array.isArray(单元.文字)) {
          文本 = 单元.文字.map((片段) => (片段 && 片段.文本) || '').join('')
        } else {
          文本 = String(单元)
        }
        目标单元.value = 单元 && typeof 单元 === 'object' && 单元.类型 === '文本' ? 文本 : 转单元格值(文本)
        if (单元 && typeof 单元 === 'object' && typeof 单元.批注 === 'string' && 单元.批注.trim()) {
          目标单元.note = 单元.批注
        }
        if (单元 && typeof 单元 === 'object') 写入基础格式(目标单元, 单元.格式)
        if (单元 && typeof 单元 === 'object') 写入数据验证(目标单元, 单元.数据验证)
      })
    })
    if (Array.isArray(表定义.合并区域)) 表定义.合并区域.forEach((区域) => 工作表.mergeCells(区域))
    if (表定义.筛选) {
      const { 列, 值 } = 表定义.筛选
      if (!Number.isInteger(列) || 列 < 0 || typeof 值 !== 'string') throw new Error('工作表筛选条件无效')
      const 最后行 = Math.max(2, 表定义.数据.length)
      const 最后列 = Math.max(列 + 1, ...表定义.数据.map((行) => Array.isArray(行) ? 行.length : 1))
      工作表.autoFilter = `A1:${工作表.getCell(最后行, 最后列).address}`
      for (let 行 = 2; 行 <= 表定义.数据.length; 行 += 1) {
        工作表.getRow(行).hidden = 工作表.getCell(行, 列 + 1).text !== 值
      }
    }
    if (表定义.图片 !== undefined && !Array.isArray(表定义.图片)) throw new Error('工作表图片列表无效')
    for (const 图片 of 表定义.图片 ?? []) {
      const 数据 = 解码图片(图片, 图片状态)
      const 图片编号 = 工作簿.addImage({ buffer: 数据, extension: 图片.格式 })
      工作表.addImage(图片编号, { tl: { col: 图片.列, row: 图片.行 }, ext: { width: 图片.宽, height: 图片.高 } })
    }
  })
  const 原数据 = await 工作簿.xlsx.writeBuffer()
  return 写入筛选Xml(原数据, 表定义列表.map((表) => 表.筛选))
}

function 转义(文本) {
  return 文本.replace(/[&<>"']/g, (字符) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[字符]))
}

module.exports = { 读取xlsx, 写入xlsx }
