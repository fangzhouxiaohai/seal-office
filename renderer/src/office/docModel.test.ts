// 文档模型测试：把编辑区 HTML 转换为与文件格式无关的中间结构，
// 主进程据此生成真正的 docx 文件。
import { describe, expect, it } from 'vitest'
import { 解析文档, 颜色转十六进制, 长度转磅 } from './docModel'
import type { 文本段落, 表格段落 } from './docModel'

/** 把 HTML 片段解析成文档模型，测试中反复使用 */
function 解析(html: string) {
  return 解析文档(html)
}

/** 取第 n 个文本段落，类型不符时直接失败 */
function 取文本段(模型: ReturnType<typeof 解析>, 序号: number): 文本段落 {
  const 段 = 模型.段落[序号]
  if (段.类型 !== '段落') {
    throw new Error(`第 ${序号} 项不是文本段落`)
  }
  return 段
}

describe('颜色转十六进制', () => {
  it('rgb 形式转为六位十六进制', () => {
    expect(颜色转十六进制('rgb(255, 0, 0)')).toBe('FF0000')
    expect(颜色转十六进制('rgb(18, 52, 86)')).toBe('123456')
  })

  it('已是十六进制时去掉井号并补齐三位简写', () => {
    expect(颜色转十六进制('#1a2b3c')).toBe('1A2B3C')
    expect(颜色转十六进制('#f00')).toBe('FF0000')
  })

  it('透明与空值返回 undefined，避免写入无意义的黑色', () => {
    expect(颜色转十六进制('')).toBeUndefined()
    expect(颜色转十六进制('transparent')).toBeUndefined()
    expect(颜色转十六进制('rgba(0, 0, 0, 0)')).toBeUndefined()
  })
})

describe('长度转磅', () => {
  it('像素按 0.75 比例折算为磅', () => {
    expect(长度转磅('16px')).toBe(12)
    expect(长度转磅('24px')).toBe(18)
  })

  it('已是磅值时直接取用', () => {
    expect(长度转磅('14pt')).toBe(14)
  })

  it('无法识别时返回 undefined，由生成端使用默认字号', () => {
    expect(长度转磅('')).toBeUndefined()
    expect(长度转磅('inherit')).toBeUndefined()
  })
})

describe('解析文档 - 段落与标题', () => {
  it('普通段落级别为 0', () => {
    const 模型 = 解析('<p>海豹办公</p>')
    expect(模型.段落).toHaveLength(1)
    const 段 = 取文本段(模型, 0)
    expect(段.级别).toBe(0)
    expect(段.文字.map((片) => 片.文本).join('')).toBe('海豹办公')
  })

  it('标题标签映射为对应级别', () => {
    const 模型 = 解析('<h1>一级</h1><h2>二级</h2><h3>三级</h3>')
    expect(模型.段落.map((段) => (段 as 文本段落).级别)).toEqual([1, 2, 3])
  })

  it('连续多个段落按文档顺序输出', () => {
    const 模型 = 解析('<p>第一段</p><p>第二段</p><p>第三段</p>')
    const 文本 = 模型.段落.map((段) => (段 as 文本段落).文字.map((片) => 片.文本).join(''))
    expect(文本).toEqual(['第一段', '第二段', '第三段'])
  })

  it('空段落保留为空行，维持原有排版节奏', () => {
    const 模型 = 解析('<p>上文</p><p><br></p><p>下文</p>')
    expect(模型.段落).toHaveLength(3)
    expect(取文本段(模型, 1).文字.map((片) => 片.文本).join('')).toBe('')
  })

  it('div 也作为段落处理，编辑区换行会产生 div', () => {
    const 模型 = 解析('<div>换行产生的段落</div>')
    expect(取文本段(模型, 0).文字.map((片) => 片.文本).join('')).toBe('换行产生的段落')
  })

  it('br 拆分为两个段落，换行在 docx 中即为新段落', () => {
    const 模型 = 解析('<p>上半行<br>下半行</p>')
    expect(模型.段落).toHaveLength(2)
    expect(取文本段(模型, 0).文字.map((片) => 片.文本).join('')).toBe('上半行')
    expect(取文本段(模型, 1).文字.map((片) => 片.文本).join('')).toBe('下半行')
  })

  it('裸文本节点包装为段落，不丢内容', () => {
    const 模型 = 解析('直接写在根下的文字')
    expect(模型.段落).toHaveLength(1)
    expect(取文本段(模型, 0).文字.map((片) => 片.文本).join('')).toBe('直接写在根下的文字')
  })

  it('空 HTML 返回一个空段落，保证文件可打开', () => {
    const 模型 = 解析('')
    expect(模型.段落).toHaveLength(1)
    expect(取文本段(模型, 0).文字).toEqual([])
  })
})

describe('解析文档 - 文字格式', () => {
  it('加粗标签与 font-weight 均识别为加粗', () => {
    const 模型 = 解析('<p><b>粗一</b><span style="font-weight:700">粗二</span></p>')
    expect(取文本段(模型, 0).文字.every((片) => 片.加粗)).toBe(true)
  })

  it('倾斜、下划线、删除线分别识别', () => {
    const 模型 = 解析('<p><i>斜</i><u>下</u><s>删</s></p>')
    const 片段 = 取文本段(模型, 0).文字
    expect(片段[0].倾斜).toBe(true)
    expect(片段[1].下划线).toBe(true)
    expect(片段[2].删除线).toBe(true)
  })

  it('前景色转为十六进制，这是改变选中文字颜色后必须保留的信息', () => {
    const 模型 = 解析('<p><span style="color: rgb(255, 0, 0)">红字</span></p>')
    expect(取文本段(模型, 0).文字[0].颜色).toBe('FF0000')
  })

  it('底纹色同样保留', () => {
    const 模型 = 解析('<p><span style="background-color: rgb(255, 255, 0)">高亮</span></p>')
    expect(取文本段(模型, 0).文字[0].底纹).toBe('FFFF00')
  })

  it('字体与字号写入片段', () => {
    const 模型 = 解析('<p><span style="font-family: 宋体; font-size: 24px">大字</span></p>')
    const 片 = 取文本段(模型, 0).文字[0]
    expect(片.字体).toBe('宋体')
    expect(片.字号).toBe(18)
  })

  it('嵌套标签的格式向下继承', () => {
    const 模型 = 解析('<p><b><i>又粗又斜</i></b></p>')
    const 片 = 取文本段(模型, 0).文字[0]
    expect(片.加粗).toBe(true)
    expect(片.倾斜).toBe(true)
  })

  it('同一段落中不同格式拆成多个片段', () => {
    const 模型 = 解析('<p>普通<b>加粗</b>普通</p>')
    const 片段 = 取文本段(模型, 0).文字
    expect(片段).toHaveLength(3)
    expect(片段[1].加粗).toBe(true)
    expect(片段[0].加粗).toBe(false)
  })

  it('字体名去掉引号与备选字体，docx 只接受单一字体名', () => {
    const 模型 = 解析('<p><span style=\'font-family: "Microsoft YaHei", sans-serif\'>文字</span></p>')
    expect(取文本段(模型, 0).文字[0].字体).toBe('Microsoft YaHei')
  })
})

describe('解析文档 - 段落属性', () => {
  it('text-align 映射为对齐方式', () => {
    const 模型 = 解析(
      '<p style="text-align:center">中</p>' +
        '<p style="text-align:right">右</p>' +
        '<p style="text-align:justify">两端</p>'
    )
    expect(模型.段落.map((段) => (段 as 文本段落).对齐)).toEqual(['中', '右', '两端'])
  })

  it('未设置对齐时默认为左对齐', () => {
    expect(取文本段(解析('<p>文字</p>'), 0).对齐).toBe('左')
  })

  it('align 属性同样生效，旧版 execCommand 会写入该属性', () => {
    expect(取文本段(解析('<p align="center">居中</p>'), 0).对齐).toBe('中')
  })
})

describe('解析文档 - 列表', () => {
  it('无序列表项标记为项目符号', () => {
    const 模型 = 解析('<ul><li>甲</li><li>乙</li></ul>')
    expect(模型.段落).toHaveLength(2)
    expect(模型.段落.every((段) => (段 as 文本段落).列表 === '项目符号')).toBe(true)
  })

  it('有序列表项标记为编号', () => {
    const 模型 = 解析('<ol><li>一</li><li>二</li></ol>')
    expect(模型.段落.every((段) => (段 as 文本段落).列表 === '编号')).toBe(true)
  })

  it('列表项保留自身文字格式', () => {
    const 模型 = 解析('<ul><li><b>粗项</b></li></ul>')
    expect(取文本段(模型, 0).文字[0].加粗).toBe(true)
  })
})

describe('解析文档 - 表格', () => {
  it('表格解析为行列结构', () => {
    const 模型 = 解析('<table><tr><td>甲</td><td>乙</td></tr><tr><td>丙</td><td>丁</td></tr></table>')
    expect(模型.段落).toHaveLength(1)
    const 表 = 模型.段落[0] as 表格段落
    expect(表.类型).toBe('表格')
    expect(表.行).toHaveLength(2)
    expect(表.行[0]).toHaveLength(2)
    expect(表.行[0][0].文字.map((片) => 片.文本).join('')).toBe('甲')
  })

  it('表头单元格与普通单元格一并纳入', () => {
    const 模型 = 解析('<table><thead><tr><th>标题</th></tr></thead><tbody><tr><td>数据</td></tr></tbody></table>')
    const 表 = 模型.段落[0] as 表格段落
    expect(表.行).toHaveLength(2)
    expect(表.行[0][0].表头).toBe(true)
    expect(表.行[1][0].表头).toBe(false)
  })

  it('单元格内的文字格式保留', () => {
    const 模型 = 解析('<table><tr><td><span style="color:#ff0000">红</span></td></tr></table>')
    const 表 = 模型.段落[0] as 表格段落
    expect(表.行[0][0].文字[0].颜色).toBe('FF0000')
  })

  it('空表格不产出表格节点，避免生成非法文件', () => {
    const 模型 = 解析('<table></table>')
    expect(模型.段落.some((段) => 段.类型 === '表格')).toBe(false)
  })
})

describe('解析文档 - 丢失内容报告', () => {
  it('图片记入未覆盖清单，便于如实告知用户', () => {
    const 模型 = 解析('<p>文字</p><p><img src="a.png"></p>')
    expect(模型.未覆盖).toContain('图片')
  })

  it('没有未覆盖内容时清单为空', () => {
    expect(解析('<p>纯文字</p>').未覆盖).toEqual([])
  })

  it('同类内容只记录一次，避免重复刷屏', () => {
    const 模型 = 解析('<p><img src="a.png"></p><p><img src="b.png"></p>')
    expect(模型.未覆盖.filter((项) => 项 === '图片')).toHaveLength(1)
  })
})

describe('格式保真：font 标签与 CSS 尺寸关键字', () => {
  it('旧式 <font> 标签的颜色、字号档位与 face 属性被解析', () => {
    const 模型 = 解析('<p><font color="#FF0000" size="5" face="黑体">红字</font></p>')
    const 段 = 取文本段(模型, 0)
    expect(段.文字[0].颜色).toBe('FF0000')
    expect(段.文字[0].字号).toBe(18)
    expect(段.文字[0].字体).toBe('黑体')
  })

  it('CSS 绝对尺寸关键字映射为磅值', () => {
    expect(长度转磅('x-large')).toBe(24)
    expect(长度转磅('large')).toBe(18)
    expect(长度转磅('xx-large')).toBe(36)
  })

  it('内联样式 span 的颜色字号在模型中保留', () => {
    const 模型 = 解析('<p><span style="color:#2B6CF6;font-size:20px">蓝色</span></p>')
    const 段 = 取文本段(模型, 0)
    expect(段.文字[0].颜色).toBe('2B6CF6')
    expect(段.文字[0].字号).toBe(15)
  })
})
