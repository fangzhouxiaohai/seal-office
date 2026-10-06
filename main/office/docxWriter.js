// docx 生成模块：把渲染进程传来的文档模型写成真正的 Word 文件。
//
// 模型结构定义见 renderer/src/office/docModel.ts，两端必须保持一致。
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  LevelFormat,
  BorderStyle,
  Column,
  PageOrientation,
  PageTextDirectionType,
  PageBreak,
  ImageRun,
  Header,
  Footer,
} = require('docx')
const JSZip = require('jszip')
const { 验证段落属性 } = require('./paragraphProperties')
const { 解码图片数据, 文档最大图片字节 } = require('./imageData')
const { 修正图片媒体 } = require('./docxImages')

const 纸张尺寸 = { A4: [11906, 16838], A5: [8391, 11906], B5: [9979, 14173], Letter: [12240, 15840] }
const 页边距 = {
  常规: [1440, 1350], 窄: [540, 540], 适中: [1440, 1080], 宽: [1440, 2160],
}

function 构建页面属性(设置) {
  if (!设置) return {}
  const 尺寸 = 设置.纸张 === '自定义'
    ? [设置.原始纸张?.宽, 设置.原始纸张?.高] : 纸张尺寸[设置.纸张]
  const 边距 = 设置.页边距 === '自定义'
    ? [设置.原始页边距?.上, 设置.原始页边距?.右, 设置.原始页边距?.下, 设置.原始页边距?.左]
    : 页边距[设置.页边距]
  if (!尺寸 || 尺寸.some((值) => !Number.isInteger(值) || 值 <= 0 || 值 > 50000) ||
      !边距 || 边距.some((值) => !Number.isInteger(值) || 值 < 0 || 值 > 20000)) {
    throw new Error('纸张尺寸或页边距无效，无法保存文字文档')
  }
  if (!['纵向', '横向'].includes(设置.纸张方向)) throw new Error('纸张方向无效，无法保存文字文档')
  if (!['一栏', '两栏', '三栏', '偏左', '偏右'].includes(设置.分栏)) throw new Error('分栏设置无效，无法保存文字文档')
  if (!['无', '方框', '阴影', '三维'].includes(设置.页面边框)) throw new Error('页面边框无效，无法保存文字文档')
  if (!['横排', '竖排'].includes(设置.文字方向)) throw new Error('文字方向无效，无法保存文字文档')
  if (设置.水印 !== '无') throw new Error('当前版本暂不能将水印写入 DOCX，请先取消水印再保存')

  const 横向 = 设置.纸张方向 === '横向'
  const 自定义纸张 = 设置.纸张 === '自定义'
  const 页面 = {
    size: {
      width: 自定义纸张 && 横向 ? 尺寸[1] : 尺寸[0],
      height: 自定义纸张 && 横向 ? 尺寸[0] : 尺寸[1],
      orientation: 横向 ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
    },
    margin: { top: 边距[0], right: 边距[1], bottom: 边距[2] ?? 边距[0], left: 边距[3] ?? 边距[1] },
    textDirection: 设置.文字方向 === '竖排' ? PageTextDirectionType.TOP_TO_BOTTOM_RIGHT_TO_LEFT : PageTextDirectionType.LEFT_TO_RIGHT_TOP_TO_BOTTOM,
  }
  if (设置.页面边框 !== '无') {
    const 样式 = 设置.页面边框 === '三维' ? BorderStyle.THREE_D_EMBOSS
      : 设置.页面边框 === '阴影' ? BorderStyle.OUTSET : BorderStyle.SINGLE
    const 边 = { style: 样式, color: '4A4A4A', size: 设置.页面边框 === '三维' ? 24 : 12 }
    页面.borders = { pageBorderTop: 边, pageBorderRight: 边, pageBorderBottom: 边, pageBorderLeft: 边 }
  }
  const 属性 = { page: 页面 }
  if (设置.分栏 !== '一栏') {
    const 数量 = 设置.分栏 === '三栏' ? 3 : 2
    if (设置.分栏 === '偏左' || 设置.分栏 === '偏右') {
      const 纸宽 = 自定义纸张 ? 尺寸[0] : 横向 ? 尺寸[1] : 尺寸[0]
      const 可用 = 纸宽 - 边距[1] - (边距[3] ?? 边距[1]) - 360
      const 小栏 = Math.round(可用 / 3)
      const 大栏 = 可用 - 小栏
      属性.column = { count: 2, equalWidth: false, children: 设置.分栏 === '偏左'
        ? [new Column({ width: 小栏, space: 360 }), new Column({ width: 大栏 })]
        : [new Column({ width: 大栏, space: 360 }), new Column({ width: 小栏 })] }
    } else {
      属性.column = { count: 数量, space: 360 }
    }
  }
  return 属性
}

function 页面底色(设置) {
  const 颜色 = 设置?.页面颜色
  if (!颜色 || 颜色 === '无') return undefined
  if (!/^#[0-9A-Fa-f]{6}$/.test(颜色)) throw new Error('页面颜色无效，无法保存文字文档')
  return { color: 颜色.slice(1).toUpperCase() }
}

/** 级别到 docx 标题样式的映射，0 表示正文 */
const 标题样式 = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
}

// 标题使用自动文字颜色，显式设置的文字颜色仍由片段覆盖。
// 保留保存库原有字号和字形，避免移除蓝色时连带改变其他排版。
const 标题默认样式 = {
  heading1: { run: { color: 'auto', size: 32 } },
  heading2: { run: { color: 'auto', size: 26 } },
  heading3: { run: { color: 'auto', size: 24 } },
  heading4: { run: { color: 'auto', italics: true } },
  heading5: { run: { color: 'auto' } },
  heading6: { run: { color: 'auto' } },
}

/** 对齐方式到 docx 常量的映射 */
const 对齐映射 = {
  左: AlignmentType.LEFT,
  中: AlignmentType.CENTER,
  右: AlignmentType.RIGHT,
  两端: AlignmentType.JUSTIFIED,
}

/** 编号列表使用的编号定义标识 */
const 编号标识 = '海豹编号'

/** 把一个文字片段转为 docx 的 TextRun */
function 建文字(片段, 图片预算) {
  if (片段.图片) {
    const 图片 = 片段.图片
    const 信息 = 解码图片数据(图片.数据)
    if (信息.格式 !== 图片.格式 || ![图片.宽, 图片.高].every((值) => typeof 值 === 'number' && Number.isFinite(值) && 值 > 0 && 值 <= 32768) ||
        typeof 图片.说明 !== 'string' || 图片.说明.length > 32768) throw new Error('图片格式、尺寸或说明无效，无法保存')
    图片预算.字节数 += 信息.字节.length
    if (图片预算.字节数 > 文档最大图片字节) throw new Error('文档图片累计超过 100 MB，无法保存')
    return new ImageRun({ data: 信息.字节, transformation: { width: 图片.宽, height: 图片.高 },
      altText: { title: 图片.说明, description: 图片.说明, name: 图片.说明 || '图片' } })
  }
  const 配置 = {
    text: 片段.文本 || '',
    bold: 片段.加粗 === true,
    italics: 片段.倾斜 === true,
    strike: 片段.删除线 === true,
  }
  if (片段.换行 === true) 配置.break = 1
  if (片段.基线 === '上标') 配置.superScript = true
  else if (片段.基线 === '下标') 配置.subScript = true
  if (片段.下划线 === true) {
    配置.underline = {}
  }
  if (片段.颜色) {
    配置.color = 片段.颜色
  }
  if (片段.底纹) {
    // docx 的底纹通过 shading 表达，fill 为背景色
    配置.shading = { fill: 片段.底纹 }
  }
  if (typeof 片段.字号 === 'number' && 片段.字号 > 0) {
    // docx 的 size 单位是半磅
    配置.size = Math.round(片段.字号 * 2)
  }
  if (片段.字体) {
    配置.font = 片段.字体
  }
  return new TextRun(配置)
}

/** 把一个文本段落转为 docx 的 Paragraph */
function 建段落(段, 原生排版列表, 图片预算) {
  const 原生排版 = 验证段落属性(段)
  原生排版列表.push(原生排版)
  const 配置 = {
    children: (段.文字 || []).map((片段) => 建文字(片段, 图片预算)),
    alignment: 对齐映射[段.对齐] || AlignmentType.LEFT,
  }
  const 验证尺寸 = (值, 名称, 最小值) => {
    if (!Number.isSafeInteger(值) || 值 < 最小值 || 值 > 2147483647) throw new Error(`段落${名称}数值无效，无法保存`)
    return 值
  }
  if (段.缩进) {
    配置.indent = {}
    for (const [字段, 属性] of [['左', 'left'], ['右', 'right'], ['首行', 'firstLine'], ['悬挂', 'hanging']]) {
      if (段.缩进[字段] !== undefined) 配置.indent[属性] = 验证尺寸(段.缩进[字段], 字段 + '缩进', 字段 === '左' || 字段 === '右' ? -2147483648 : 0)
    }
    if (段.缩进.首行 !== undefined && 段.缩进.悬挂 !== undefined) throw new Error('段落首行与悬挂缩进不能同时设置')
  }
  if (段.间距) {
    配置.spacing = {}
    for (const [字段, 属性] of [['段前', 'before'], ['段后', 'after'], ['行距', 'line']]) {
      if (段.间距[字段] !== undefined) 配置.spacing[属性] = 验证尺寸(段.间距[字段], 字段, 字段 === '行距' ? 1 : 0)
    }
    if (段.间距.行距规则 !== undefined) {
      if (!['auto', 'exact', 'atLeast'].includes(段.间距.行距规则)) throw new Error('段落行距规则无效，无法保存')
      配置.spacing.lineRule = 段.间距.行距规则
    }
  }

  const 样式 = 标题样式[段.级别]
  if (样式 !== undefined) {
    配置.heading = 样式
  }

  if (段.列表 === '项目符号') {
    配置.bullet = { level: 0 }
  } else if (段.列表 === '编号') {
    配置.numbering = { reference: 编号标识, level: 0 }
  }

  return new Paragraph(配置)
}

/** 把一个表格模型转为 docx 的 Table，行列数不齐时按最宽行补齐 */
function 建表格(表, 原生排版列表, 图片预算) {
  const 行数据 = 表.行 || []
  const 列数 = 行数据.reduce((最大, 行) => Math.max(最大, 行.length), 0)

  const 行 = 行数据.map((行单元) => {
    const 单元列表 = []
    for (let 序号 = 0; 序号 < 列数; 序号 += 1) {
      const 单元 = 行单元[序号]
      单元列表.push(
        new TableCell({
          children: (单元?.段落?.length ? 单元.段落 : [{ 文字: 单元?.文字 || [] }]).map((段) => 建段落({
            ...段,
            文字: (段.文字 || []).map((片段) => 单元?.表头 ? { ...片段, 加粗: true } : 片段),
          }, 原生排版列表, 图片预算)),
        })
      )
    }
    return new TableRow({ children: 单元列表 })
  })

  return new Table({ rows: 行, width: { size: 100, type: WidthType.PERCENTAGE } })
}

/** 当前 docx 库未暴露字符缩进和行单位段距选项，按实际正文段落顺序补入受控属性。 */
async function 补充原生排版(数据, 原生排版列表, 有图片) {
  if (!有图片 && !原生排版列表.some((项) => Object.keys(项?.ind || {}).length || Object.keys(项?.spacing || {}).length)) return 数据
  const 压缩包 = await JSZip.loadAsync(数据)
  const 文件 = 压缩包.file('word/document.xml')
  if (!文件) throw new Error('保存文档缺少正文，无法写入段落格式')
  const xml = await 文件.async('string')
  let 序号 = 0
  const 正文 = xml.replace(/<w:p(?=[\s/>])[^>]*\/>|<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>/g, (段落Xml) => {
    const 格式 = 原生排版列表[序号++]
    if (!格式) return 段落Xml
    let 属性 = 段落Xml.match(/<w:pPr(?=[\s>])[^>]*>([\s\S]*?)<\/w:pPr>/)?.[1] || ''
    for (const 标签 of ['ind', 'spacing']) {
      const 扩展 = Object.entries(格式[标签]).map(([键, 值]) => ` w:${键}="${值}"`).join('')
      if (!扩展) continue
      const 正则 = new RegExp(`<w:${标签}(?=[\\s/>])[^>]*\\/>`)
      属性 = 正则.test(属性) ? 属性.replace(正则, (片段) => 片段.replace(/\/>$/, `${扩展}/>`)) : 属性 + `<w:${标签}${扩展}/>`
    }
    if (!Object.keys(格式.ind).length && !Object.keys(格式.spacing).length) return 段落Xml
    const 段属性 = `<w:pPr>${属性}</w:pPr>`
    if (/<w:pPr\s*\/>/.test(段落Xml)) return 段落Xml.replace(/<w:pPr\s*\/>/, 段属性)
    if (/<w:pPr(?=[\s>])/.test(段落Xml)) return 段落Xml.replace(/<w:pPr(?=[\s>])[^>]*>[\s\S]*?<\/w:pPr>/, 段属性)
    if (/\/>$/.test(段落Xml)) return 段落Xml.replace(/\/>$/, `>${段属性}</w:p>`)
    return 段落Xml.replace(/^(<w:p(?=[\s>])[^>]*>)/, `$1${段属性}`)
  })
  if (序号 !== 原生排版列表.length) throw new Error('保存文档段落顺序不一致，无法写入段落格式')
  压缩包.file('word/document.xml', 正文)
  if (有图片) await 修正图片媒体(压缩包)
  return 压缩包.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/** 编号列表的定义，docx 要求显式声明编号格式 */
const 编号配置 = {
  config: [
    {
      reference: 编号标识,
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        },
      ],
    },
  ],
}

/**
 * 依据文档模型生成 docx 文件数据。
 * @param 文档模型 - 形如 { 段落: [...], 未覆盖: [...] }
 * @returns docx 文件的 Buffer
 */
exports.生成docx = async (文档模型) => {
  const 段落列表 = (文档模型 && 文档模型.段落) || []

  const 子元素 = []
  const 原生排版列表 = []
  const 图片预算 = { 字节数: 0 }
  const 构建页眉页脚 = (段落) => {
    const 局部排版 = []
    const children = (段落 || []).map((项) => {
      if (项.类型 === '表格') return 建表格(项, 局部排版, 图片预算)
      if (项.类型 === '分页符') return new Paragraph({ children: [new PageBreak()] })
      if (项.类型 === '水平线') return new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '777777' } } })
      return 建段落(项, 局部排版, 图片预算)
    })
    return children.length ? children : [new Paragraph({ children: [] })]
  }
  段落列表.forEach((项) => {
    if (项.类型 === '表格') {
      子元素.push(建表格(项, 原生排版列表, 图片预算))
      // Word 要求表格之后跟随段落，否则相邻表格会被合并
      子元素.push(new Paragraph({ children: [] }))
      原生排版列表.push({ ind: {}, spacing: {} })
    } else if (项.类型 === '分页符') {
      子元素.push(new Paragraph({ children: [new PageBreak()] }))
      原生排版列表.push({ ind: {}, spacing: {} })
    } else if (项.类型 === '水平线') {
      子元素.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '777777' } } }))
      原生排版列表.push({ ind: {}, spacing: {} })
    } else {
      子元素.push(建段落(项, 原生排版列表, 图片预算))
    }
  })

  // 完全没有内容时补一个空段落，否则生成的文件结构非法
  if (子元素.length === 0) {
    子元素.push(new Paragraph({ children: [] }))
    原生排版列表.push({ ind: {}, spacing: {} })
  }

  const 文档 = new Document({
    styles: { default: 标题默认样式 },
    numbering: 编号配置,
    background: 页面底色(文档模型?.页面设置),
    sections: [{
      properties: 构建页面属性(文档模型?.页面设置),
      children: 子元素,
      ...(文档模型?.页眉?.length ? { headers: { default: new Header({ children: 构建页眉页脚(文档模型.页眉) }) } } : {}),
      ...(文档模型?.页脚?.length ? { footers: { default: new Footer({ children: 构建页眉页脚(文档模型.页脚) }) } } : {}),
    }],
  })

  return 补充原生排版(await Packer.toBuffer(文档), 原生排版列表, 图片预算.字节数 > 0)
}
