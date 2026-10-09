// 选区保存与恢复：解决下拉菜单浮层抢占焦点导致编辑区选区丢失的问题。
//
// 问题链路：点击 Ribbon 下拉菜单项时，antd 浮层渲染在 body 下并抢走焦点，
// 浏览器随之折叠编辑区选区；此后 execCommand 只作用于光标位置，
// 表现为「选中文字改颜色无效，光标跳回起点，后续输入才变色」。
//
// 解法是在浮层打开的瞬间保存 Range 快照，命令执行前先恢复，
// 使 foreColor、bold 等依赖选区的指令重新作用于原选中内容。

/** 判断节点是否位于编辑区内部 */
function 在根内(根: HTMLElement, 节点: Node | null): boolean {
  if (节点 === null) {
    return false
  }
  return 根 === 节点 || 根.contains(节点)
}

/** 当前选区是否完整落在编辑区内，区外选区不参与保存与恢复 */
export function 选区在根内(根: HTMLElement): boolean {
  const 选区 = typeof window === 'undefined' ? null : window.getSelection()
  if (选区 === null || 选区.rangeCount === 0) {
    return false
  }
  const 范围 = 选区.getRangeAt(0)
  return 在根内(根, 范围.startContainer) && 在根内(根, 范围.endContainer)
}

/**
 * 保存编辑区当前选区的快照。
 * 返回 null 表示当前没有选区，或选区落在编辑区之外。
 */
export function 保存选区(根: HTMLElement): Range | null {
  if (!选区在根内(根)) {
    return null
  }
  const 选区 = window.getSelection()
  if (选区 === null || 选区.rangeCount === 0) {
    return null
  }
  // 克隆一份，避免持有活动 Range 在 DOM 变动后失效
  return 选区.getRangeAt(0).cloneRange()
}

/**
 * 将快照写回选区，并让编辑区重新获得焦点。
 * 返回是否恢复成功；快照为 null 或其端点已脱离文档时返回 false。
 */
export function 恢复选区(根: HTMLElement, 快照: Range | null): boolean {
  if (快照 === null) {
    return false
  }
  // 端点可能因内容替换而脱离文档，此时恢复无意义
  if (!在根内(根, 快照.startContainer) || !在根内(根, 快照.endContainer)) {
    return false
  }
  const 选区 = typeof window === 'undefined' ? null : window.getSelection()
  if (选区 === null) {
    return false
  }
  try {
    根.focus({ preventScroll: true })
    选区.removeAllRanges()
    选区.addRange(快照)
    return true
  } catch {
    // Range 端点失效时 addRange 会抛异常，视为恢复失败
    return false
  }
}

/** 快照是否为非空选区；光标（折叠选区）返回 false */
export function 选区非空(快照: Range | null): boolean {
  return 快照 !== null && !快照.collapsed
}

/** 可作为段落样式载体的块级标签 */
const 段落标签 = /^(P|H[1-6]|DIV|LI|BLOCKQUOTE)$/

/** 从任意节点向上找到所属的段落块，找不到时返回 null */
function 所属段落(根: HTMLElement, 节点: Node | null): HTMLElement | null {
  let 当前: Node | null = 节点
  while (当前 !== null && 当前 !== 根) {
    if (当前 instanceof HTMLElement && 段落标签.test(当前.tagName)) {
      return 当前
    }
    当前 = 当前.parentNode
  }
  return null
}

/**
 * 返回当前选区覆盖到的段落块。
 * 光标状态返回所在的单个段落，拖选状态返回区间内的全部段落。
 * 选区不在编辑区内时返回空数组，调用方据此提示用户先定位光标。
 */
export function 选区覆盖的段落(根: HTMLElement): HTMLElement[] {
  if (!选区在根内(根)) {
    return []
  }
  const 选区 = window.getSelection()
  if (选区 === null || 选区.rangeCount === 0) {
    return []
  }
  const 范围 = 选区.getRangeAt(0)

  // 光标状态：只作用于所在段落
  if (范围.collapsed) {
    const 单个 = 所属段落(根, 范围.startContainer)
    return 单个 === null ? [] : [单个]
  }

  // 拖选状态：取区间内所有与选区相交的段落
  const 全部段落 = Array.from(根.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6, div, li, blockquote'))
  const 命中 = 全部段落.filter((块) => 范围.intersectsNode(块))

  if (命中.length > 0) {
    // 嵌套结构下只保留最内层，避免外层容器被一并改动
    return 命中.filter((块) => !命中.some((其他) => 其他 !== 块 && 块.contains(其他)))
  }

  // 选区完全落在单个文本节点内时 intersectsNode 可能无命中，退回向上查找
  const 兜底 = 所属段落(根, 范围.startContainer)
  return 兜底 === null ? [] : [兜底]
}
