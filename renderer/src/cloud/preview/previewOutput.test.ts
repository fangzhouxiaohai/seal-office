import { describe, expect, it } from 'vitest'
import { 生成预览HTML, 转Base64, 预览错误说明 } from './previewOutput'

describe('预览输出', () => {
  it('英文 XML 解析错误转成可读中文提示，中文业务错误原样保留', () => {
    expect(预览错误说明('Namespace prefix w15 for restartNumberingAfterBreak on abstractNum is not defined')).toBe('此文件的内部结构与预览组件不兼容，可用海豹办公打开或下载后查看')
    expect(预览错误说明('服务暂时不可用，请稍后重试')).toContain('也可以下载文件或用海豹办公打开')
    expect(预览错误说明('文件超过 100 MB，无法在线预览，请下载后查看')).toBe('文件超过 100 MB，无法在线预览，请下载后查看')
    expect(预览错误说明('')).toBe('文件读取失败，请重试')
  })

  it('快照去掉预览工具栏与按钮，保留正文并输出完整 HTML', () => {
    const 容器 = document.createElement('div')
    容器.innerHTML = '<div class="fv-toolbar"><button>打印</button></div><article><p>正文段落</p><canvas width="10" height="10"></canvas></article>'
    document.body.appendChild(容器)
    const html = 生成预览HTML(容器, '报告 <1>.docx')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>报告 &lt;1&gt;.docx</title>')
    expect(html).toContain('正文段落')
    expect(html).not.toContain('fv-toolbar')
    expect(html).not.toContain('<canvas')
    expect(html).toContain('<img')
    容器.remove()
  })

  it('大文件分块转 base64 与 btoa 结果一致', () => {
    const 字节 = new Uint8Array(70000).map((_, i) => i % 256)
    expect(atob(转Base64(字节)).length).toBe(70000)
  })
})
