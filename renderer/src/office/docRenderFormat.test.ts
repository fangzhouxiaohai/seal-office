import { describe, expect, it, vi } from 'vitest'
import { 固定文档显示格式 } from './docRenderFormat'

describe('保存格式测量隔离', () => {
  it('测量树不复制资源地址、事件和可执行标签，结束后移除测量树', () => {
    const source = document.createElement('div')
    source.innerHTML = '<p onclick="alert(1)">正文<img src="https://invalid.example/a.png" width="40" height="20"></p><iframe src="https://invalid.example"></iframe><script>alert(1)</script>'
    const append = document.body.appendChild.bind(document.body)
    const spy = vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
      const tree = node as HTMLElement
      expect(tree.querySelector('[src],[href],[onclick],script,iframe')).toBeNull()
      expect(tree.querySelector('img')?.getAttribute('width')).toBe('40')
      return append(node)
    })
    try {
      固定文档显示格式(source)
      expect(spy).toHaveBeenCalledOnce()
      expect(document.querySelector('[aria-hidden="true"].wps-editor-canvas__content')).toBeNull()
      expect(source.querySelector('img')?.src).toBe('https://invalid.example/a.png')
    } finally { spy.mockRestore() }
  })
})
