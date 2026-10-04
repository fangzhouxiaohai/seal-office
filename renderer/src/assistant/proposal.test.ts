import { describe, expect, it } from 'vitest'
import { 解析助手回复, 预览文字修改, 预览表格修改, 预览演示修改 } from './proposal'
import { 创建工作表, 写入单元格 } from '../sheet/model'
import { 创建演示文稿 } from '../ppt/deck'

describe('智能助手修改预览', () => {
  it('长原文与长替换内容不因字符上限中止', () => {
    const 原文 = '正文'.repeat(7000), 新文 = '改写'.repeat(8000)
    const 回复 = 解析助手回复(JSON.stringify({ 回复: '已生成完整候选', 修改: [{ 种类: '文字替换', 段落标识: '段落-1', 查找: 原文, 替换为: 新文 }] }))
    expect(预览文字修改(`<p>${原文}</p>`, 回复.修改 as Parameters<typeof 预览文字修改>[1])).toBe(`<p>${新文}</p>`)
  })

  it('超过两百处段落修改完整解析并按原始段落定位', () => {
    const 修改 = Array.from({ length: 240 }, (_, 索引) => ({ 种类: '文字替换', 段落标识: `段落-${索引 + 1}`, 查找: '重复正文', 替换为: `段落正文${索引 + 1}` }))
    const 回复 = 解析助手回复(JSON.stringify({ 回复: '批量调整', 修改 }))
    const 根 = document.createElement('div')
    根.innerHTML = 预览文字修改('<p>重复正文</p>'.repeat(240), 回复.修改 as Parameters<typeof 预览文字修改>[1])
    expect(根.querySelectorAll('p')).toHaveLength(240)
    expect(根.lastElementChild?.textContent).toBe('段落正文240')
  })

  it('有效长总结可解析，同时保留文字修改和排版候选', () => {
    const 总结 = '完整总结。'.repeat(4000)
    const 修改 = [{ 种类: '段落排版', 段落标识: '段落-1', 原文: '原始标题', 格式: { 标题级别: 1, 对齐: 'center', 颜色: '#000000' } }]
    const 回复 = 解析助手回复(JSON.stringify({ 回复: 总结, 修改 }))
    expect(回复.回复).toBe(总结)
    const 候选 = 预览文字修改('<p>原始标题</p>', 回复.修改 as Parameters<typeof 预览文字修改>[1])
    expect(候选).toContain('<h1')
    expect(候选).toContain('text-align: center')
    expect(解析助手回复(总结)).toEqual({ 回复: 总结, 修改: [] })
  })

  it('同一段落跨加粗与颜色片段可精确替换且保留图片与邻近格式', () => {
    const 结果 = 预览文字修改('<p>开始<strong>旧标题</strong><span style="color:red">后半</span>结尾<img src="data:image/png;base64,AA=="></p>', [{ 种类: '文字替换', 查找: '旧标题后半', 替换为: '新标题' }])
    const 根 = document.createElement('div'); 根.innerHTML = 结果
    expect(根.textContent).toBe('开始新标题结尾')
    expect(根.querySelector('strong')?.textContent).toBe('新标题')
    expect(根.querySelector('img')).not.toBeNull()
  })
  it('段落标识可以消除重复文字歧义并支持重新排版', () => {
    const 回复 = 解析助手回复(JSON.stringify({ 回复: '调整第二段', 修改: [
      { 种类: '文字替换', 段落标识: '段落-2', 查找: '重复', 替换为: '标题' },
      { 种类: '段落排版', 段落标识: '段落-2', 原文: '重复', 格式: { 标题级别: 2, 对齐: 'center', 字号: 20, 颜色: '#000000', 行距: 1.5 } },
    ] }))
    const 结果 = 预览文字修改('<p>重复</p><p>重复<img src="data:image/png;base64,AA=="></p>', 回复.修改 as Parameters<typeof 预览文字修改>[1])
    const 根 = document.createElement('div'); 根.innerHTML = 结果
    expect(根.querySelector('p')?.textContent).toBe('重复')
    expect(根.querySelector('h2')?.textContent).toBe('标题')
    expect(根.querySelector('h2')?.style.textAlign).toBe('center')
    expect(根.querySelector('img')).not.toBeNull()
  })
  it('禁止跨段落拼接匹配以及无效排版参数', () => {
    expect(() => 预览文字修改('<p>甲</p><p>乙</p>', [{ 种类: '文字替换', 查找: '甲乙', 替换为: '错' }])).toThrow('未找到')
    expect(() => 解析助手回复(JSON.stringify({ 回复: '排版', 修改: [{ 种类: '段落排版', 段落标识: '段落-1', 原文: '甲', 格式: { 颜色: 'url(javascript:1)' } }] }))).toThrow('颜色')
  })
  it('仅将唯一命中的文字替换写入候选内容并保留周边格式', () => {
    const 结果 = 预览文字修改('<p><strong>原始标题</strong>：正文</p>', [{ 种类: '文字替换', 查找: '正文', 替换为: '新正文' }])
    expect(结果).toBe('<p><strong>原始标题</strong>：新正文</p>')
  })

  it('重复或失配文字被拒绝，防止误改其他位置', () => {
    expect(() => 预览文字修改('<p>重复</p><p>重复</p>', [{ 种类: '文字替换', 查找: '重复', 替换为: '替换' }])).toThrow('唯一')
    expect(() => 预览文字修改('<p>原文</p>', [{ 种类: '文字替换', 查找: '不存在', 替换为: '替换' }])).toThrow('未找到')
  })

  it('表格按工作表、地址和原值校验后生成候选模型', () => {
    const 表 = 写入单元格(创建工作表('数据'), 'A1', '旧值')
    const 候选 = 预览表格修改([表], [{ 种类: '单元格写入', 工作表: '数据', 地址: 'A1', 原值: '旧值', 新值: '新值' }])
    expect(候选[0].单元格.A1.原始值).toBe('新值')
    expect(表.单元格.A1.原始值).toBe('旧值')
  })

  it('演示文稿只修改指定文本框且保留样式', () => {
    const 文稿 = 创建演示文稿()
    const 框 = 文稿.幻灯片列表[0].文本框列表[0]
    const 候选 = 预览演示修改(文稿, [{ 种类: '演示文本替换', 页码: 1, 文本框标识: 框.id, 查找: '单击此处', 替换为: '请在此处' }])
    expect(候选.幻灯片列表[0].文本框列表[0].text).toContain('请在此处')
    expect(候选.幻灯片列表[0].文本框列表[0].字号).toBe(框.字号)
  })
  it('演示原文跨多个格式片段仍可替换，未修改片段样式保留', () => {
    const 文稿 = 创建演示文稿(), 框 = 文稿.幻灯片列表[0].文本框列表[0]
    框.text = '前文旧标题后文'
    框.片段列表 = [{ 文本: '前文旧', 加粗: true }, { 文本: '标题后文', 颜色: '#C00000' }]
    const 结果 = 预览演示修改(文稿, [{ 种类: '演示文本替换', 页码: 1, 文本框标识: 框.id, 查找: '旧标题', 替换为: '新标题' }])
    expect(结果.幻灯片列表[0].文本框列表[0]).toMatchObject({ text: '前文新标题后文', 片段列表: [{ 文本: '前文新标题', 加粗: true }, { 文本: '后文', 颜色: '#C00000' }] })
    expect(框.text).toBe('前文旧标题后文')
  })

  it('不执行模型返回的未知指令', () => {
    expect(() => 解析助手回复('{"回复":"已修改","修改":[{"种类":"删除文件","路径":"C:/文件"}]}')).toThrow('不支持')
  })
})
