// 表格边框设置工具函数

export type 边框样式类型 = '单实线' | '双实线' | '虚线' | '点线' | '无'

export interface 边框设置选项 {
  颜色?: string
  粗细?: number
  样式?: 边框样式类型
}

/**
 * 设置表格边框样式
 * @param 表格元素 - HTMLTableElement
 * @param 选项 - 边框设置选项
 */
export function 设置表格边框(表格元素: HTMLTableElement, 选项: 边框设置选项 = {}) {
  const { 颜色 = '#E8EBF0', 粗细 = 1, 样式 = '单实线' } = 选项
  
  let 边框声明 = ''
  switch (样式) {
    case '单实线':
      边框声明 = `${粗细}px solid ${颜色}`
      break
    case '双实线':
      边框声明 = `${粗细 * 2}px double ${颜色}`
      break
    case '虚线':
      边框声明 = `${粗细}px dashed ${颜色}`
      break
    case '点线':
      边框声明 = `${粗细}px dotted ${颜色}`
      break
    case '无':
      边框声明 = 'none'
      break
  }

  表格元素.style.borderCollapse = 'collapse'
  const 单元格 = 表格元素.querySelectorAll('td, th')
  单元格.forEach((单元格: Element) => {
    (单元格 as HTMLElement).style.border = 边框声明
  })
}

/**
 * 获取表格当前边框设置
 */
export function 获取表格边框设置(表格元素: HTMLTableElement): 边框设置选项 {
  const 第一个单元格 = 表格元素.querySelector('td, th') as HTMLElement
  if (!第一个单元格) {
    return { 颜色: '#E8EBF0', 粗细: 1, 样式: '单实线' }
  }

  const 边框 = 第一个单元格.style.border || ''
  
  // 简单解析边框字符串
  let 样式: 边框样式类型 = '单实线'
  if (边框.includes('dashed')) 样式 = '虚线'
  else if (边框.includes('dotted')) 样式 = '点线'
  else if (边框.includes('double')) 样式 = '双实线'
  else if (边框 === 'none' || 边框 === '') 样式 = '无'

  // 提取颜色（简化处理）
  let 颜色 = '#E8EBF0'
  const 颜色匹配 = 边框.match(/#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})/g)
  if (颜色匹配) 颜色 = 颜色匹配[0]

  // 提取粗细
  let 粗细 = 1
  const 粗细匹配 = 边框.match(/(\d+)px/)?.[1]
  if (粗细匹配) 粗细 = parseInt(粗细匹配, 10)

  return { 颜色, 粗细, 样式 }
}
