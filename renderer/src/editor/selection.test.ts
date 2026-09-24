// 选区保存与恢复的测试：覆盖下拉菜单浮层抢焦点导致选区丢失的修复。
import { describe, expect, it, beforeEach } from 'vitest'
import { 保存选区, 恢复选区, 选区在根内, 选区非空, 选区覆盖的段落 } from './selection'

/**
 * 构造带文本的编辑区，返回根元素。
 * jsdom 不把 contentEditable 元素视为可聚焦，故额外设置 tabIndex，
 * 真实浏览器中 contentEditable 本身即可获得焦点。
 */
function 建编辑区(html: string): HTMLDivElement {
  const 根 = document.createElement('div')
  根.contentEditable = 'true'
  根.tabIndex = 0
  根.innerHTML = html
  document.body.appendChild(根)
  return 根
}

/** 在指定文本节点上拖选一段字符，模拟用户鼠标拖选 */
function 拖选(节点: Node, 起: number, 止: number): void {
  const 范围 = document.createRange()
  范围.setStart(节点, 起)
  范围.setEnd(节点, 止)
  const 选区 = window.getSelection()
  选区?.removeAllRanges()
  选区?.addRange(范围)
}

/** 模拟浮层抢焦点：选区被折叠为光标 */
function 折叠选区(): void {
  const 选区 = window.getSelection()
  选区?.removeAllRanges()
}

describe('选区保存与恢复', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('保存选区返回快照，恢复后选中的仍是原文字', () => {
    const 根 = 建编辑区('<p>海豹办公文档</p>')
    const 文本节点 = 根.querySelector('p')!.firstChild!
    拖选(文本节点, 2, 4)

    const 快照 = 保存选区(根)
    expect(快照).not.toBeNull()

    // 浮层打开，选区丢失
    折叠选区()
    expect(window.getSelection()?.rangeCount ?? 0).toBe(0)

    // 恢复后选中内容与拖选时一致
    expect(恢复选区(根, 快照)).toBe(true)
    expect(window.getSelection()?.toString()).toBe('办公')
  })

  it('未选中任何内容时保存返回 null', () => {
    const 根 = 建编辑区('<p>海豹办公</p>')
    折叠选区()
    expect(保存选区(根)).toBeNull()
  })

  it('选区在编辑区之外时不予保存，避免误操作其他区域', () => {
    const 根 = 建编辑区('<p>海豹办公</p>')
    const 区外 = document.createElement('p')
    区外.textContent = '标题栏文字'
    document.body.appendChild(区外)

    拖选(区外.firstChild!, 0, 3)
    expect(保存选区(根)).toBeNull()
  })

  it('恢复 null 快照返回 false，不抛异常', () => {
    const 根 = 建编辑区('<p>海豹办公</p>')
    expect(恢复选区(根, null)).toBe(false)
  })

  it('折叠的光标位置也能保存与恢复，供插入类命令使用', () => {
    const 根 = 建编辑区('<p>海豹办公</p>')
    const 文本节点 = 根.querySelector('p')!.firstChild!
    拖选(文本节点, 3, 3)

    const 快照 = 保存选区(根)
    expect(快照).not.toBeNull()
    expect(选区非空(快照)).toBe(false)

    折叠选区()
    expect(恢复选区(根, 快照)).toBe(true)
    expect(window.getSelection()?.getRangeAt(0).startOffset).toBe(3)
  })

  it('选区非空能区分拖选与光标', () => {
    const 根 = 建编辑区('<p>海豹办公</p>')
    const 文本节点 = 根.querySelector('p')!.firstChild!

    拖选(文本节点, 0, 2)
    expect(选区非空(保存选区(根))).toBe(true)

    拖选(文本节点, 2, 2)
    expect(选区非空(保存选区(根))).toBe(false)
  })

  it('选区在根内对区内与区外分别判定', () => {
    const 根 = 建编辑区('<p>海豹办公</p>')
    const 区外 = document.createElement('p')
    区外.textContent = '区外'
    document.body.appendChild(区外)

    拖选(根.querySelector('p')!.firstChild!, 0, 2)
    expect(选区在根内(根)).toBe(true)

    拖选(区外.firstChild!, 0, 2)
    expect(选区在根内(根)).toBe(false)
  })

  it('跨元素拖选能完整保存与恢复', () => {
    const 根 = 建编辑区('<p>第一段</p><p>第二段</p>')
    const 首段 = 根.querySelectorAll('p')[0].firstChild!
    const 次段 = 根.querySelectorAll('p')[1].firstChild!

    const 范围 = document.createRange()
    范围.setStart(首段, 1)
    范围.setEnd(次段, 2)
    const 选区 = window.getSelection()
    选区?.removeAllRanges()
    选区?.addRange(范围)

    const 快照 = 保存选区(根)
    折叠选区()

    expect(恢复选区(根, 快照)).toBe(true)
    expect(window.getSelection()?.toString()).toBe('一段第二')
  })

  it('恢复后编辑区重新获得焦点，使 execCommand 作用于选区', () => {
    const 根 = 建编辑区('<p>海豹办公</p>')
    拖选(根.querySelector('p')!.firstChild!, 0, 2)
    const 快照 = 保存选区(根)

    // 焦点转移到按钮，模拟点击 Ribbon
    const 按钮 = document.createElement('button')
    document.body.appendChild(按钮)
    按钮.focus()
    折叠选区()

    恢复选区(根, 快照)
    expect(document.activeElement).toBe(根)
  })
})

describe('选区覆盖的段落', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('光标状态只返回所在的那一个段落，不波及全文', () => {
    const 根 = 建编辑区('<p>第一段</p><p>第二段</p><p>第三段</p>')
    const 次段 = 根.querySelectorAll('p')[1]
    拖选(次段.firstChild!, 1, 1)

    const 结果 = 选区覆盖的段落(根)
    expect(结果).toHaveLength(1)
    expect(结果[0].textContent).toBe('第二段')
  })

  it('拖选跨越两段时返回这两段，不含未选中的第三段', () => {
    const 根 = 建编辑区('<p>第一段</p><p>第二段</p><p>第三段</p>')
    const 段落列表 = 根.querySelectorAll('p')

    const 范围 = document.createRange()
    范围.setStart(段落列表[0].firstChild!, 1)
    范围.setEnd(段落列表[1].firstChild!, 2)
    const 选区 = window.getSelection()
    选区?.removeAllRanges()
    选区?.addRange(范围)

    const 结果 = 选区覆盖的段落(根)
    expect(结果.map((块) => 块.textContent)).toEqual(['第一段', '第二段'])
  })

  it('标题段落同样可被选中，支持对标题设置行距', () => {
    const 根 = 建编辑区('<h1>文档标题</h1><p>正文</p>')
    拖选(根.querySelector('h1')!.firstChild!, 0, 2)

    const 结果 = 选区覆盖的段落(根)
    expect(结果).toHaveLength(1)
    expect(结果[0].tagName).toBe('H1')
  })

  it('选区不在编辑区内时返回空数组，供调用方提示用户', () => {
    const 根 = 建编辑区('<p>海豹办公</p>')
    const 区外 = document.createElement('p')
    区外.textContent = '区外段落'
    document.body.appendChild(区外)
    拖选(区外.firstChild!, 0, 2)

    expect(选区覆盖的段落(根)).toEqual([])
  })

  it('嵌套结构只返回最内层段落，避免外层容器被一并改动', () => {
    const 根 = 建编辑区('<div><p>内层段落</p></div>')
    拖选(根.querySelector('p')!.firstChild!, 0, 2)

    const 结果 = 选区覆盖的段落(根)
    expect(结果).toHaveLength(1)
    expect(结果[0].tagName).toBe('P')
  })

  it('无选区时返回空数组', () => {
    const 根 = 建编辑区('<p>海豹办公</p>')
    折叠选区()
    expect(选区覆盖的段落(根)).toEqual([])
  })
})
