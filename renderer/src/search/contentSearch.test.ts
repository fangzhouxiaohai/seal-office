import { describe, expect, it, vi } from 'vitest'
import { 读取搜索文字, 搜索片段 } from './contentSearch'
import { 读取本地文件内容 } from '../fileOpen'
import { 载入PDF } from '../pdf/pdfLoader'
import type { DocItem } from '../mock/recentDocs'

vi.mock('../fileOpen', () => ({ 读取本地文件内容: vi.fn() }))
vi.mock('../pdf/pdfLoader', () => ({ 载入PDF: vi.fn() }))
const 文档 = (路径: string): DocItem => ({ id: 路径, name: 路径, type: 'word', size: 12, updatedAt: '2026-10-07', starred: false, shared: false, 路径 })

describe('最近文档正文搜索', () => {
  it('提取文字、表格和演示文稿正文', async () => {
    vi.mocked(读取本地文件内容).mockResolvedValueOnce({ 类型: 'word', 内容: '<p>企业简介 <strong>天然气</strong></p>' })
      .mockResolvedValueOnce({ 类型: 'table', 工作表列表: [{ 名称: '预算', html: '<table><tr><td>年度收入</td></tr></table>' }] })
      .mockResolvedValueOnce({ 类型: 'ppt', 演示文稿: { 幻灯片列表: [{ title: '项目计划', 备注: '阶段目标' }] } })
    expect(await 读取搜索文字(文档('a.docx'))).toContain('天然气')
    expect(await 读取搜索文字(文档('b.xlsx'))).toContain('年度收入')
    expect(await 读取搜索文字(文档('c.pptx'))).toContain('阶段目标')
    expect(搜索片段('企业简介 天然气有限公司', '天然气')).toContain('天然气')
  })

  it('搜索 PDF 各页可选择文字并释放文档', async () => {
    const 关闭 = vi.fn()
    vi.mocked(读取本地文件内容).mockResolvedValueOnce({ 类型: 'pdf', 内容: 'JVBERi0x' })
    vi.mocked(载入PDF).mockResolvedValueOnce({ 文档: { numPages: 2, getPage: vi.fn(async (页码: number) => ({ getTextContent: async () => ({ items: [{ str: `第${页码}页合同` }] }) })) } as never, 关闭 })
    expect(await 读取搜索文字(文档('d.pdf'))).toContain('第2页合同')
    expect(关闭).toHaveBeenCalledOnce()
  })
})
