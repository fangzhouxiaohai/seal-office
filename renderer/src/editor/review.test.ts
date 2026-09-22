import { describe, it, expect } from 'vitest'
import {
  删除批注,
  提取批注,
  接受修订,
  生成批注,
  生成删除标记,
  生成插入标记,
  统计修订,
  拒绝修订,
} from './review'

const 含批注文档 = [
  '<p>第一段内容',
  生成批注(1, '此处需要补充数据'),
  '</p>',
  '<p>第二段内容',
  生成批注(2, '措辞建议再斟酌'),
  '</p>',
].join('')

describe('批注', () => {
  it('生成带编号的批注标记', () => {
    const 标记 = 生成批注(1, '说明文字')
    expect(标记).toContain('class="wps-comment"')
    expect(标记).toContain('data-编号="1"')
    expect(标记).toContain('说明文字')
  })

  it('批注内容中的双引号被转义，不破坏属性', () => {
    const 标记 = 生成批注(1, '含有"引号"的说明')
    expect(标记).toContain('&quot;')
    expect(提取批注(标记)[0].内容).toBe('含有"引号"的说明')
  })

  it('提取文档中的全部批注', () => {
    const 批注列表 = 提取批注(含批注文档)
    expect(批注列表.map((项) => 项.编号)).toEqual([1, 2])
    expect(批注列表.map((项) => 项.内容)).toEqual(['此处需要补充数据', '措辞建议再斟酌'])
  })

  it('无批注时返回空数组', () => {
    expect(提取批注('<p>正文</p>')).toEqual([])
    expect(提取批注('')).toEqual([])
  })

  it('按编号删除批注', () => {
    const 结果 = 删除批注(含批注文档, 1)
    expect(结果.删除数).toBe(1)
    expect(结果.文本).not.toContain('此处需要补充数据')
    expect(结果.文本).toContain('措辞建议再斟酌')
  })

  it('删除不存在的编号时不改变内容', () => {
    const 结果 = 删除批注(含批注文档, 99)
    expect(结果.删除数).toBe(0)
    expect(结果.文本).toContain('此处需要补充数据')
  })
})

describe('修订', () => {
  it('生成插入与删除标记', () => {
    expect(生成插入标记('新增内容')).toBe('<span class="wps-insert">新增内容</span>')
    expect(生成删除标记('被删内容')).toBe('<span class="wps-delete">被删内容</span>')
  })

  it('统计插入与删除数量', () => {
    const 文档 = `<p>${生成插入标记('甲')}原内容${生成删除标记('乙')}</p>`
    const 统计 = 统计修订(文档)
    expect(统计.插入数).toBe(1)
    expect(统计.删除数).toBe(1)
  })

  it('无修订时统计为零', () => {
    expect(统计修订('<p>普通内容</p>')).toEqual({ 插入数: 0, 删除数: 0 })
  })

  it('接受修订时保留插入内容并移除删除内容', () => {
    const 文档 = `<p>${生成插入标记('新增')}保留${生成删除标记('废弃')}</p>`
    const 结果 = 接受修订(文档)
    expect(结果.修订数).toBe(2)
    expect(结果.文本).toContain('新增')
    expect(结果.文本).toContain('保留')
    expect(结果.文本).not.toContain('废弃')
    expect(结果.文本).not.toContain('wps-insert')
    expect(结果.文本).not.toContain('wps-delete')
  })

  it('拒绝修订时移除插入内容并保留删除内容', () => {
    const 文档 = `<p>${生成插入标记('新增')}保留${生成删除标记('废弃')}</p>`
    const 结果 = 拒绝修订(文档)
    expect(结果.修订数).toBe(2)
    expect(结果.文本).not.toContain('新增')
    expect(结果.文本).toContain('保留')
    expect(结果.文本).toContain('废弃')
    expect(结果.文本).not.toContain('wps-insert')
  })

  it('无修订时接受与拒绝均不改变实质内容', () => {
    const 文档 = '<p>普通内容</p>'
    expect(接受修订(文档).修订数).toBe(0)
    expect(接受修订(文档).文本).toContain('普通内容')
    expect(拒绝修订(文档).修订数).toBe(0)
    expect(拒绝修订(文档).文本).toContain('普通内容')
  })

  it('空文档不报错', () => {
    expect(接受修订('').修订数).toBe(0)
    expect(拒绝修订('').修订数).toBe(0)
  })
})
