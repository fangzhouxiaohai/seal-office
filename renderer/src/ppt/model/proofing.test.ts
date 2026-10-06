import { expect, it } from 'vitest'
import { 创建文本框, 创建演示文稿, 更新幻灯片 } from '../deck'
import { 应用检查修正, 执行本机检查, 忽略检查项, 类型清单 } from './proofing'

const 单页稿 = (文本: string, 字号 = 24) => {
  const 文稿 = 创建演示文稿()
  const 框 = { ...创建文本框(80, 60, 400, 120, 文本, 字号), id: '文字' }
  return 更新幻灯片(文稿, 文稿.幻灯片列表[0].id, { 文本框列表: [框] })
}

const 类型集 = (文稿: ReturnType<typeof 单页稿>) => new Set(执行本机检查(文稿).map(项 => 项.类型))

it('重复词、常见错字、标点与空白都能给出可解释结果', () => {
  const 重复 = 执行本机检查(单页稿('我们需要需要重新确认这个方案'))
  expect(重复.map(项 => 项.类型)).toContain('重复词')
  expect(重复.find(项 => 项.类型 === '重复词')).toMatchObject({ 起始: 4, 长度: 2, 原文: '需要', 建议: '' })
  expect(执行本机检查(单页稿('请按装好新的打印驱动'))[0]).toMatchObject({ 类型: '常见错字', 原文: '按装', 建议: '安装' })
  expect(类型集(单页稿('第一点,第二点。'))).toContain('标点')
  expect(类型集(单页稿('完成。。'))).toContain('标点')
  expect(类型集(单页稿('  前后都有空白  '))).toContain('空白')
  expect(类型集(单页稿('中间有  连续空格'))).toContain('空白')
  expect(类型集(单页稿('正常文本'))).toEqual(new Set())
})

it('字号异常、文字溢出、缺失资源与非法链接分别登记', () => {
  expect(类型集(单页稿('小字', 10))).toContain('格式')
  expect(类型集(单页稿('这一行文字很长很长很长很长很长很长很长很长很长很长', 24))).toContain('文字溢出')
  const 文稿 = 创建演示文稿()
  const 带对象 = 更新幻灯片(文稿, 文稿.幻灯片列表[0].id, { 对象列表: [{ id: '图片', 类型: '图片', x: 0, y: 0, width: 100, height: 80, 资源标识: 'a'.repeat(64) }] })
  expect(类型集(带对象)).toContain('缺失资源')
  expect(执行本机检查(带对象).find(项 => 项.类型 === '缺失资源')).toMatchObject({ 对象标识: '图片' })
  expect(类型集(单页稿('详情见 javascript:alert(1)'))).toContain('链接')
  expect(类型集(单页稿('详情见 https://example.com/doc'))).not.toContain('链接')
})

it('应用修正只替换命中片段并保留其他片段格式', () => {
  const 文稿 = 单页稿('请按装好驱动')
  const 页 = 文稿.幻灯片列表[0]
  const 带片段 = 更新幻灯片(文稿, 页.id, {
    文本框列表: [{
      ...页.文本框列表[0],
      片段列表: [
        { 文本: '请按装', 加粗: true },
        { 文本: '好驱动', 颜色: '#E34D59' },
      ],
    }],
  })
  const 项 = 执行本机检查(带片段).find(候选 => 候选.类型 === '常见错字')!
  const 修正后 = 应用检查修正(带片段, 项)
  const 框 = 修正后.幻灯片列表[0].文本框列表[0]
  expect(框.text).toBe('请安装好驱动')
  expect(框.片段列表?.map(片段 => 片段.文本).join('')).toBe('请安装好驱动')
  expect(框.片段列表?.find(片段 => 片段.文本.includes('驱动'))?.颜色).toBe('#E34D59')
  expect(框.片段列表?.find(片段 => 片段.文本.includes('安装'))?.加粗).toBe(true)
})

it('忽略的检查项不再出现，且修正后检查结果为空', () => {
  const 文稿 = 单页稿('完成。。')
  const 项 = 执行本机检查(文稿).find(候选 => 候选.类型 === '标点')!
  const 忽略集 = 忽略检查项(new Set<string>(), 项)
  expect(执行本机检查(文稿, { 忽略: 忽略集 })).toEqual([])
  expect(执行本机检查(文稿)).toHaveLength(1)
  expect(执行本机检查(应用检查修正(文稿, 项))).toEqual([])
})

it('检查类型清单固定，供面板与文档使用', () => {
  expect(类型清单).toEqual(['重复词', '常见错字', '标点', '空白', '格式', '文字溢出', '缺失资源', '链接'])
})
