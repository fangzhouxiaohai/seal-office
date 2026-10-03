import { describe, expect, it } from 'vitest'
import { 分析邮件合并模板, 合并邮件记录, 解析邮件合并CSV, 生成邮件合并文档, 解码邮件合并字节 } from './mailMerge'

describe('邮件合并数据源', () => {
  it('识别本机常见的简体中文编码文件', () => {
    const 字节 = new Uint8Array([0xD0, 0xD5, 0xC3, 0xFB, 0x0A, 0xD5, 0xC5, 0xC8, 0xFD])
    expect(解码邮件合并字节(字节)).toBe('姓名\n张三')
  })
  it('解析带逗号、换行、双引号与文件头标记的数据', () => {
    const 数据 = 解析邮件合并CSV('\uFEFF姓名,地址,备注\r\n张三,"上海,浦东","第一行\n第二行"\r\n李四,北京,"他说""好"""')
    expect(数据.字段).toEqual(['姓名', '地址', '备注'])
    expect(数据.记录).toEqual([
      { 姓名: '张三', 地址: '上海,浦东', 备注: '第一行\n第二行' },
      { 姓名: '李四', 地址: '北京', 备注: '他说"好"' },
    ])
  })

  it.each([
    ['', '数据源为空'],
    ['姓名,姓名\n甲,乙', '字段名重复'],
    ['姓名, \n甲,乙', '字段名不能为空'],
    ['姓名,城市\n张三', '字段数量不一致'],
    ['姓名\n"张三', '双引号未闭合'],
    ['姓名\n张"三', '双引号位置无效'],
    ['姓名\n张三"后缀', '双引号位置无效'],
    ['姓名\n', '至少包含一条记录'],
  ])('拒绝错误的数据源：%s', (输入, 原因) => {
    expect(() => 解析邮件合并CSV(输入)).toThrow(原因)
  })
})

describe('邮件合并模板', () => {
  const 数据 = 解析邮件合并CSV('姓名,地址\n张三,上海\n李四,北京')

  it('只替换正文文本，保留文字格式与属性，并对数据中的标签转义', () => {
    const 模板 = '<p class="正文"><strong>您好，{{姓名}}</strong>，请到 <span style="color:red">{{地址}}</span>。</p>'
    const 结果 = 合并邮件记录(模板, { 姓名: '<张三>', 地址: '上海' }, 数据.字段)
    expect(结果).toContain('class="正文"')
    expect(结果).toContain('<strong>您好，&lt;张三&gt;</strong>')
    expect(结果).toContain('<span style="color:red">上海</span>')
  })

  it('可替换被不同格式文字节点拆开的占位符', () => {
    const 结果 = 合并邮件记录('<p><span>{{姓</span><em>名}}</em>您好</p>', 数据.记录[0], 数据.字段)
    expect(结果).toContain('<span>张三</span>')
    expect(结果).toContain('您好')
    expect(结果).not.toContain('{{')
  })

  it('指出模板中不存在于数据源的字段', () => {
    expect(() => 分析邮件合并模板('<p>{{邮箱}}</p>', 数据.字段)).toThrow('邮箱')
  })

  it('拒绝没有字段占位符的模板', () => {
    expect(() => 分析邮件合并模板('<p>普通文档</p>', 数据.字段)).toThrow('没有字段占位符')
  })

  it('将每条记录合并到同一份新文档并以分页符隔开', () => {
    const 模板 = '<p>致 {{姓名}}：{{地址}}</p>'
    const 结果 = 生成邮件合并文档(模板, 数据)
    expect(结果).toContain('致 张三：上海')
    expect(结果).toContain('致 李四：北京')
    expect(结果.match(/class="wps-page-break"/g)).toHaveLength(1)
    expect(模板).toBe('<p>致 {{姓名}}：{{地址}}</p>')
  })
})
