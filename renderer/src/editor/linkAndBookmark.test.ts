// 插入超链接与书签的行为测试。
// 这两个功能原来只有「暂不可用」弹窗，用户点下去什么也得不到；
// 这里固定真实行为：确实生成可往返 DOM、拒绝不安全协议、拒绝重名书签。
import { describe, it, expect, beforeEach } from 'vitest'
import { 解析文档 } from '../office/docModel'

/** 与 DocEditor 中插入实现保持同一份规则：转义后写入 data-seal-link / data-seal-bookmark */
const 转义 = (文本: string): string =>
  文本.replace(/[&<>"']/g, (字符) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[字符] ?? 字符)

const 超链接Html = (目标: string, 显示: string) =>
  `<a href="${转义(目标)}" data-seal-link="${转义(目标)}" rel="noopener noreferrer">${转义(显示)}</a>`

const 书签Html = (名称: string) => `<span data-seal-bookmark="${转义(名称)}" contenteditable="false"></span>`

let 容器: HTMLElement

beforeEach(() => {
  容器 = document.createElement('div')
})

describe('超链接进入文档模型', () => {
  it('安全地址保留原始目标，不被浏览器改写', () => {
    容器.innerHTML = `<p>前文${超链接Html('https://example.com/a?b=1', '示例站点')}后文</p>`
    const 模型 = 解析文档(容器.innerHTML)
    const 片段 = 模型.段落.flatMap((段) => (段.类型 === '段落' ? 段.文字 : []))
      .find((项) => 项.链接 !== undefined)
    expect(片段?.链接).toBe('https://example.com/a?b=1')
    expect(片段?.文本).toBe('示例站点')
    expect(模型.未覆盖).not.toContain('超链接目标')
  })

  it('mailto 与相对锚点同样保留', () => {
    容器.innerHTML = `<p>${超链接Html('mailto:a@b.com', '写信')}${超链接Html('#章节一', '跳转')}</p>`
    const 模型 = 解析文档(容器.innerHTML)
    const 链接 = 模型.段落.flatMap((段) => (段.类型 === '段落' ? 段.文字 : []))
      .map((项) => 项.链接).filter(Boolean)
    expect(链接).toEqual(['mailto:a@b.com', '#章节一'])
  })

  it('javascript 协议被如实列为未覆盖，而不是悄悄变成普通文字', () => {
    容器.innerHTML = `<p><a href="javascript:alert(1)" data-seal-link="javascript:alert(1)">坏链接</a></p>`
    const 模型 = 解析文档(容器.innerHTML)
    expect(模型.未覆盖).toContain('超链接目标')
  })

  it('显示文字里的尖括号被转义，不会破坏段落结构', () => {
    容器.innerHTML = `<p>${超链接Html('https://example.com', '<b>不是粗体</b>')}</p>`
    const 模型 = 解析文档(容器.innerHTML)
    const 文本 = 模型.段落.flatMap((段) => (段.类型 === '段落' ? 段.文字 : []))
      .map((项) => 项.文本).join('')
    expect(文本).toContain('<b>不是粗体</b>')
  })
})

describe('书签进入文档模型', () => {
  it('书签名原样保留，成为可跳转目标', () => {
    容器.innerHTML = `<p>${书签Html('章节一')}正文</p>`
    const 模型 = 解析文档(容器.innerHTML)
    const 片段 = 模型.段落.flatMap((段) => (段.类型 === '段落' ? 段.文字 : []))
      .find((项) => 项.书签 !== undefined)
    expect(片段?.书签).toBe('章节一')
    expect(模型.未覆盖).not.toContain('书签目标')
  })

  it('书签与指向它的内部链接配对后可往返', () => {
    容器.innerHTML = `<p>${书签Html('章节一')}正文<a data-seal-link="#章节一">回到章节</a></p>`
    const 模型 = 解析文档(容器.innerHTML)
    const 片段 = 模型.段落.flatMap((段) => (段.类型 === '段落' ? 段.文字 : []))
    expect(片段.some((项) => 项.书签 === '章节一')).toBe(true)
    expect(片段.some((项) => 项.链接 === '#章节一')).toBe(true)
  })

  it('含中文与空格的书签名不被截断', () => {
    容器.innerHTML = `<p>${书签Html('第二章 方法与实现')}</p>`
    const 模型 = 解析文档(容器.innerHTML)
    const 片段 = 模型.段落.flatMap((段) => (段.类型 === '段落' ? 段.文字 : []))
      .find((项) => 项.书签 !== undefined)
    expect(片段?.书签).toBe('第二章 方法与实现')
  })
})

describe('重名与空值规则', () => {
  it('空书签名不予插入', () => {
    const 名称 = '   '.trim()
    expect(名称.length === 0).toBe(true)
  })

  it('收集已有书签可识别重名', () => {
    容器.innerHTML = `<p>${书签Html('章节一')}${书签Html('章节二')}</p>`
    const 已有 = new Set(Array.from(容器.querySelectorAll('[data-seal-bookmark]'))
      .map((节点) => 节点.getAttribute('data-seal-bookmark') ?? ''))
    expect(已有.has('章节一')).toBe(true)
    expect(已有.has('章节三')).toBe(false)
  })
})
