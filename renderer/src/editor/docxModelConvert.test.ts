// docx 模型转换回归：保存链路必须把编辑区的样式完整带进模型（此前重复实现丢失全部格式）
import { describe, expect, it } from 'vitest'
import { htmlToDocxModel } from './commands'

const 取首段文字 = (html: string) => {
  const 模型 = htmlToDocxModel(html)
  const 段 = 模型.段落[0]
  if (段.类型 !== '段落') throw new Error('首段不是文本段落')
  return { 段, 片段: 段.文字![0] }
}

describe('htmlToDocxModel 样式保真', () => {
  it('增加缩进产生的引用容器转换为正文缩进，不多出空段或丢失缩进', () => {
    const 模型 = htmlToDocxModel('<blockquote style="margin:0 0 0 40px;border:none;padding:0"><p>缩进正文</p></blockquote>')
    expect(模型.未覆盖).toEqual([])
    expect(模型.段落).toHaveLength(1)
    expect(模型.段落[0]).toMatchObject({ 缩进: { 左: 600 }, 文字: [expect.objectContaining({ 文本: '缩进正文' })] })
  })

  it('粘贴内容的外层容器行距继承到正文，子段落可覆盖，不增加空段', () => {
    const 模型 = htmlToDocxModel('<div style="font-size:16pt;line-height:1.5;margin-top:6pt;margin-bottom:12pt"><p>第一段</p><p style="line-height:2">第二段</p></div>')
    expect(模型.未覆盖).toEqual([])
    expect(模型.段落).toHaveLength(2)
    expect(模型.段落[0]).toMatchObject({ 间距: { 段前: 120, 行距: 360, 行距规则: 'auto' } })
    expect(模型.段落[1]).toMatchObject({ 间距: { 段后: 240, 行距: 480, 行距规则: 'auto' } })
  })

  it('常规段落缩进、段前段后和行距进入可保存模型', () => {
    const 模型 = htmlToDocxModel('<p style="font-size:16pt;margin-left:24px;margin-right:12pt;text-indent:2em;margin-top:0;margin-bottom:6pt;line-height:1.5">备案正文</p>')
    expect(模型.未覆盖).toEqual([])
    expect(模型.段落[0]).toMatchObject({
      缩进: { 左: 360, 右: 240, 首行: 640 },
      间距: { 段前: 0, 段后: 120, 行距: 360, 行距规则: 'auto' },
    })
  })

  it('悬挂缩进和固定行距按实际单位转换，保留负边距与零值', () => {
    const 模型 = htmlToDocxModel('<p style="margin-left:-4px;margin-right:0;text-indent:-18pt;line-height:24px">正文</p>')
    expect(模型.未覆盖).toEqual([])
    expect(模型.段落[0]).toMatchObject({ 缩进: { 左: -60, 右: 0, 悬挂: 360 }, 间距: { 行距: 360, 行距规则: 'exact' } })
  })

  it('导入的最小行距规则在保存模型中保留', () => {
    const 模型 = htmlToDocxModel('<p data-seal-line-rule="atLeast" style="line-height:18pt">正文</p>')
    expect(模型.未覆盖).toEqual([])
    expect(模型.段落[0]).toMatchObject({ 间距: { 行距: 360, 行距规则: 'atLeast' } })
  })

  it('百分比行高与厘米缩进可以保存，不把相对宽度缩进误写成绝对尺寸', () => {
    expect(htmlToDocxModel('<p style="margin-left:1cm;line-height:150%">正文</p>').段落[0]).toMatchObject({
      缩进: { 左: 567 }, 间距: { 行距: 360, 行距规则: 'auto' },
    })
    expect(htmlToDocxModel('<p style="margin-left:10%">正文</p>').未覆盖).toContain('段落缩进或间距')
  })

  it('标题、列表项和空行同样保留段落格式', () => {
    const 模型 = htmlToDocxModel('<h2 style="margin-bottom:12pt">标题</h2><ul><li style="line-height:2">条目</li></ul><p style="margin-top:18pt"><br></p>')
    expect(模型.未覆盖).toEqual([])
    expect(模型.段落).toHaveLength(3)
    expect(模型.段落[0]).toMatchObject({ 级别: 2, 间距: { 段后: 240 } })
    expect(模型.段落[1]).toMatchObject({ 列表: '项目符号', 间距: { 行距: 480, 行距规则: 'auto' } })
    expect(模型.段落[2]).toMatchObject({ 文字: [], 间距: { 段前: 360 } })
  })

  it('无法写回的图形与链接仍提示风险，普通缩进不再被误拦截', () => {
    const 模型 = htmlToDocxModel('<div class="wps-chart" contenteditable="false"><svg></svg></div><p style="margin-left:24px"><a href="https://example.com">官网</a></p>')
    expect(模型.未覆盖).toContain('图表')
    expect(模型.未覆盖).not.toContain('段落缩进或间距')
    expect(模型.未覆盖).toContain('超链接目标')
  })

  it('上标、下标与段内换行是可保存的常规文字格式', () => {
    const 模型 = htmlToDocxModel('<p style="line-height:1.5">面积 m<sup>2</sup><br>水 H<sub>2</sub>O</p>')
    expect(模型.未覆盖).toEqual([])
    expect(模型.段落).toHaveLength(1)
    expect(模型.段落[0]).toMatchObject({ 文字: expect.arrayContaining([
      expect.objectContaining({ 文本: '2', 基线: '上标' }), expect.objectContaining({ 文本: '2', 基线: '下标' }),
      expect.objectContaining({ 换行: true }),
    ]) })
  })

  it('表格单元格内各段的对齐与排版可以保存', () => {
    const 模型 = htmlToDocxModel('<table><tr><td><p style="text-indent:24pt;line-height:1.5">第一段</p><p style="text-align:right;margin-top:12pt">第二段</p></td></tr></table>')
    expect(模型.未覆盖).toEqual([])
    expect(模型.段落[0]).toMatchObject({ 行: [[{ 段落: [
      expect.objectContaining({ 缩进: { 首行: 480 }, 间距: { 行距: 360, 行距规则: 'auto' } }),
      expect.objectContaining({ 对齐: '右', 间距: { 段前: 240, 行距: 420, 行距规则: 'auto' } }),
    ] }]] })
  })

  it('文本框内边距也进入保存前损失清单', () => {
    const 模型 = htmlToDocxModel('<div style="padding:12px">文本框</div>')
    expect(模型.未覆盖).toContain('图形或文本框布局')
  })

  it('分页符成为独立文档节点，而非丢失的空段落', () => {
    const 模型 = htmlToDocxModel('<p>第一页</p><div class="wps-page-break"></div><p>第二页</p>')
    expect(模型.段落.map((项) => 项.类型)).toEqual(['段落', '分页符', '段落'])
    expect(模型.未覆盖).not.toContain('分页符')
  })
  it('紫色大字（用户场景）的颜色与字号进入模型', () => {
    const { 片段 } = 取首段文字('<p><span style="color:#8A2BE2;font-size:36pt">威锋威锋威锋威锋网</span></p>')
    expect(片段.颜色).toBe('8A2BE2')
    expect(片段.字号).toBe(36)
  })

  it('rgb 颜色被规范化为十六进制，绝不能把 rgb() 串传给写入器', () => {
    const { 片段 } = 取首段文字('<p><span style="color: rgb(138, 43, 226);">紫色</span></p>')
    expect(片段.颜色).toBe('8A2BE2')
  })

  it('加粗斜体下划线删除线随 span 样式保留', () => {
    const { 片段 } = 取首段文字('<p><span style="font-weight:bold;font-style:italic;text-decoration:underline;">样式文字</span></p>')
    expect(片段.加粗).toBe(true)
    expect(片段.倾斜).toBe(true)
    expect(片段.下划线).toBe(true)
  })

  it('显式普通格式覆盖父级的加粗、斜体和删除线', () => {
    const { 片段 } = 取首段文字(
      '<p><strong><em><del><span style="font-weight:normal;font-style:normal;text-decoration:none">普通文字</span></del></em></strong></p>'
    )
    expect(片段.加粗).toBe(false)
    expect(片段.倾斜).toBe(false)
    expect(片段.删除线).toBe(false)
  })

  it('对齐与标题级别保留', () => {
    const 模型 = htmlToDocxModel('<h1 style="text-align:center">标题</h1>')
    const 段 = 模型.段落[0]
    expect(段.类型 === '段落' && 段.对齐).toBe('中')
    expect(段.类型 === '段落' && 段.级别).toBe(1)
  })

  it('列表结构保留', () => {
    const 模型 = htmlToDocxModel('<ul><li>甲</li><li>乙</li></ul>')
    expect(模型.段落.length).toBeGreaterThanOrEqual(2)
    const 首 = 模型.段落[0]
    expect(首.类型 === '段落' && 首.列表).toBe('项目符号')
  })

  it('表格转为表格段落而非压平文本', () => {
    const 模型 = htmlToDocxModel('<table><tbody><tr><th>表头</th><td>单元格</td></tr></tbody></table>')
    const 表 = 模型.段落[0]
    expect(表.类型).toBe('表格')
    if (表.类型 === '表格') {
      expect(表.行![0][0].表头).toBe(true)
      expect(表.行![0][0].文字[0].文本).toBe('表头')
      expect(表.行![0][1].文字[0].文本).toBe('单元格')
    }
  })
})
