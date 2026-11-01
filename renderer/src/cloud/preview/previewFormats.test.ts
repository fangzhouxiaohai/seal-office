import { describe, it, expect } from 'vitest'
import { 预览方式, 预览最大字节, 默认打开方式 } from './previewFormats'

describe('云文件预览方式判定', () => {
  it('常见图片、音频、视频使用浏览器原生预览', () => {
    for (const 名称 of ['照片.JPG', 'a.png', 'a.gif', 'a.webp', 'a.bmp', 'a.svg', 'a.ico', 'a.avif']) expect(预览方式(名称, '完整').方式).toBe('image')
    for (const 名称 of ['a.mp3', 'a.wav', 'a.ogg', 'a.m4a', 'a.aac', 'a.flac', 'a.opus']) expect(预览方式(名称, '完整').方式).toBe('audio')
    for (const 名称 of ['a.mp4', 'a.webm', 'a.mov', 'a.m4v']) expect(预览方式(名称, '完整').方式).toBe('video')
  })

  it('完整预览引擎处理 Office、PDF、OFD、压缩包、电子书和邮件', () => {
    for (const 名称 of ['a.docx', 'a.doc', 'a.rtf', 'a.odt', 'a.xlsx', 'a.xls', 'a.ods', 'a.pptx', 'a.ppt', 'a.odp', 'a.pdf', 'a.ofd', 'a.zip', 'a.rar', 'a.7z', 'a.tar', 'a.gz', 'a.epub', 'a.eml', 'a.msg', 'a.tif', 'a.heic', 'a.md', 'a.json', 'a.py', 'a.csv'])
      expect(预览方式(名称, '完整').方式, 名称).toBe('viewer')
  })

  it('移动原生端无完整引擎时：文本用纯文本预览，Office 与 PDF 转交编辑器，zip 列出目录', () => {
    expect(预览方式('a.md', '精简').方式).toBe('text')
    expect(预览方式('脚本.py', '精简').方式).toBe('text')
    expect(预览方式('a.docx', '精简').方式).toBe('editor')
    expect(预览方式('a.pdf', '精简').方式).toBe('editor')
    expect(预览方式('a.ofd', '精简').方式).toBe('editor')
    expect(预览方式('a.zip', '精简').方式).toBe('zip')
    expect(预览方式('a.epub', '精简').方式).toBe('unsupported')
    expect(预览方式('a.epub', '精简').说明).toMatch(/桌面版或网页版/)
  })

  it('海豹专属格式始终用编辑器打开', () => {
    for (const 名称 of ['a.sldoc', 'a.slxls', 'a.slppt', 'a.spdf', 'a.sealdoc']) expect(预览方式(名称, '完整').方式).toBe('editor')
  })

  it('未知格式说明原因', () => {
    const 结果 = 预览方式('安装包.exe', '完整')
    expect(结果.方式).toBe('unsupported')
    expect(结果.说明).toContain('EXE')
  })

  it('预览上限为 100 MB', () => {
    expect(预览最大字节).toBe(100 * 1024 * 1024)
  })

  it('点击文件时可编辑格式直接打开编辑，其余格式进入预览', () => {
    expect(默认打开方式('报告.docx')).toBe('edit')
    expect(默认打开方式('数据.xlsx')).toBe('edit')
    expect(默认打开方式('照片.jpg')).toBe('preview')
    expect(默认打开方式('资料.zip')).toBe('preview')
    expect(默认打开方式('思维导图.sealmind')).toBe('edit')
  })
})
