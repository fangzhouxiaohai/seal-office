const 不支持元素 = [
  { 选择器: '[data-watermark], .wps-watermark', 名称: '水印' },
  { 选择器: '[data-word-art], .wps-wordart', 名称: '艺术字' },
  { 选择器: '[data-columns], .wps-columns', 名称: '分栏' },
]

function 统计损失(html) {
  const 内容 = String(html || '')
  const 项目 = []
  不支持元素.forEach(({ 选择器, 名称 }) => {
    const 标签 = 选择器.split(',').map((项) => 项.trim()).filter(Boolean)
    const 次数 = 标签.reduce((总数, 标签名) => {
      // 从选择器提取匹配文本：剥离 CSS 前缀符号
      const 匹配文本 = 标签名
        .replace(/^[.#\[]/, '')   // 移除 . # [ 前缀
        .replace(/\]$/, '')       // 移除 ] 后缀
      // 匹配类名（空格/引号边界）或属性名（=号边界），避免子串误匹配
      const 正则 = new RegExp(`<[^>]*?(?:^|\\s|")${匹配文本}(?:\\s|"|=)[^>]*>`, 'gi')
      const 匹配 = 内容.match(正则)
      return 总数 + (匹配 ? 匹配.length : 0)
    }, 0)
    if (次数 > 0) 项目.push({ 名称, 次数 })
  })
  return 项目
}

function 生成说明(项目) {
  if (!项目.length) return ''
  return `以下 ${项目.length} 类元素未能写入 Word 格式：${项目.map((项) => `${项.名称}（${项.次数} 处）`).join('、')}。如需保留全部版式，请另存为 HTML 格式。`
}

module.exports = { 统计损失, 生成说明 }
