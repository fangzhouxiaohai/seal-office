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
} = require('docx')

/** 级别到 docx 标题样式的映射，0 表示正文 */
const 标题样式 = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
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
function 建文字(片段) {
  const 配置 = {
    text: 片段.文本 || '',
    bold: 片段.加粗 === true,
    italics: 片段.倾斜 === true,
    strike: 片段.删除线 === true,
  }
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
function 建段落(段) {
  const 配置 = {
    children: (段.文字 || []).map(建文字),
    alignment: 对齐映射[段.对齐] || AlignmentType.LEFT,
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
function 建表格(表) {
  const 行数据 = 表.行 || []
  const 列数 = 行数据.reduce((最大, 行) => Math.max(最大, 行.length), 0)

  const 行 = 行数据.map((行单元) => {
    const 单元列表 = []
    for (let 序号 = 0; 序号 < 列数; 序号 += 1) {
      const 单元 = 行单元[序号]
      单元列表.push(
        new TableCell({
          children: [
            new Paragraph({
              children: (单元 && 单元.文字 ? 单元.文字 : []).map((片段) =>
                // 表头文字统一加粗，与常见排版习惯一致
                建文字(单元 && 单元.表头 ? { ...片段, 加粗: true } : 片段)
              ),
            }),
          ],
        })
      )
    }
    return new TableRow({ children: 单元列表 })
  })

  return new Table({ rows: 行, width: { size: 100, type: WidthType.PERCENTAGE } })
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
  段落列表.forEach((项) => {
    if (项.类型 === '表格') {
      子元素.push(建表格(项))
      // Word 要求表格之后跟随段落，否则相邻表格会被合并
      子元素.push(new Paragraph({ children: [] }))
    } else {
      子元素.push(建段落(项))
    }
  })

  // 完全没有内容时补一个空段落，否则生成的文件结构非法
  if (子元素.length === 0) {
    子元素.push(new Paragraph({ children: [] }))
  }

  const 文档 = new Document({
    numbering: 编号配置,
    sections: [{ properties: {}, children: 子元素 }],
  })

  return await Packer.toBuffer(文档)
}
