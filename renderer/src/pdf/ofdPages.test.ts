import { describe, expect, it, vi } from 'vitest'
import { 净化OFD页面, OFD打印页面 } from './ofdPages'
import { 检查OFD文件 } from './OfdViewer'
import JSZip from 'jszip'
function 页面(html: string) { const box = document.createElement('div'); box.innerHTML = html; box.style.width = '1191px'; box.style.height = '1684px'; return box }
describe('OFD 阅读与打印', () => {
  it('canvas 图形与签章转换为含原像素的 PNG，保留位置与尺寸', () => {
    const page = 页面('<canvas width="200" height="100" style="position:absolute;left:20px;top:30px;width:100px;height:50px"></canvas>')
    const canvas = page.querySelector('canvas')!
    const spy = vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,PIXELS')
    const html = 净化OFD页面([page])[0]
    expect(spy).toHaveBeenCalledWith('image/png'); expect(html).toContain('data:image/png;base64,PIXELS'); expect(html).toContain('left: 20px'); expect(html).not.toContain('<canvas')
    spy.mockRestore()
  })
  it('保留 SVG 文字与路径，去除脚本和外部资源', () => {
    const pages = 净化OFD页面([页面('<svg><text>中文</text><path d="M0 0L5 5"/></svg><script>bad()</script><img src="https://invalid.test/a"><p style="background:url(https://invalid.test/b)">正文</p>')])
    expect(pages[0]).toContain('<text>中文</text>'); expect(pages[0]).toContain('path'); expect(pages[0]).not.toContain('invalid.test'); expect(pages[0]).not.toContain('script')
  })
  it('150% 和 100% 缩放打印都保留原纸张毫米尺寸', () => {
    for (const zoom of [100, 150]) {
      const p = 页面('文字')
      const html = OFD打印页面([p], 净化OFD页面([p]), [[210, 297]], zoom)
      expect(html).toContain('size:210mm 297mm'); expect(html).toContain('transform:scale(')
    }
  })
  it('多页面的不同纸张尺寸分别打印', () => {
    const pages = [页面('A'), 页面('B')]
    const html = OFD打印页面(pages, 净化OFD页面(pages), [[210, 297], [297, 210]], 150)
    expect(html).toContain('@page ofd1{size:297mm 210mm'); expect(html.match(/<section/g)).toHaveLength(2)
  })
  it('缺失尺寸不能导出裁切的 PDF', () => expect(() => OFD打印页面([document.createElement('div')], [''], [], 150)).toThrow('尺寸无效'))
  it('拒绝伪装 ZIP 和缺失文档根路径', async () => {
    const zip = new JSZip(); zip.file('wrong.txt', 'x')
    await expect(检查OFD文件(await zip.generateAsync({ type: 'base64' }))).rejects.toThrow('OFD.xml')
    zip.file('OFD.xml', '<OFD/>')
    await expect(检查OFD文件(await zip.generateAsync({ type: 'base64' }))).rejects.toThrow('根路径无效')
  })
  it('验证页面根、纸张尺寸和字节原样保留', async () => {
    const zip = new JSZip()
    zip.file('OFD.xml', '<OFD><DocRoot>Doc/Document.xml</DocRoot></OFD>')
    zip.file('Doc/Document.xml', '<Document><CommonData><PageArea><PhysicalBox>0 0 210 297</PhysicalBox></PageArea></CommonData><Pages><Page BaseLoc="Pages/Page.xml"/></Pages></Document>')
    zip.file('Doc/Pages/Page.xml', '<Page/>')
    const bytes = await zip.generateAsync({ type: 'base64' })
    const read = await 检查OFD文件(bytes)
    expect(read.页面尺寸).toEqual([[210, 297]]); expect(btoa(String.fromCharCode(...read.字节))).toBe(bytes)
  })
})
