/** 纯字体回退规则：不依赖 IPC、React 或字体目录，可被编辑器和渲染组件安全引用。 */

const 通用无衬线 = ['Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', 'SealNotoSans', 'Arial', 'sans-serif']
const 通用衬线 = ['SimSun', 'Songti SC', 'Noto Serif CJK SC', 'SealNotoSerif', 'Times New Roman', 'serif']

const 兼容映射: Record<string, string[]> = {
  simsun: ['宋体', 'Songti SC', 'Noto Serif CJK SC', 'SealNotoSerif'],
  宋体: ['SimSun', 'Songti SC', 'Noto Serif CJK SC', 'SealNotoSerif'],
  songtisc: ['宋体', 'SimSun', 'Noto Serif CJK SC'],
  simhei: ['黑体', 'PingFang SC', 'Noto Sans CJK SC', 'SealNotoSans'],
  黑体: ['SimHei', 'PingFang SC', 'Noto Sans CJK SC', 'SealNotoSans'],
  fangsong: ['仿宋', 'FangSong_GB2312', 'STFangsong', 'Noto Serif CJK SC'],
  仿宋: ['FangSong', 'FangSong_GB2312', 'STFangsong'],
  fangsonggb2312: ['仿宋', 'FangSong', 'STFangsong'],
  仿宋gb2312: ['FangSong', '仿宋', 'STFangsong'],
  kaiti: ['楷体', 'KaiTi_GB2312', 'STKaiti', 'Noto Serif CJK SC'],
  楷体: ['KaiTi', 'KaiTi_GB2312', 'STKaiti'],
  kaitigb2312: ['楷体', 'KaiTi', 'STKaiti'],
  楷体gb2312: ['KaiTi', '楷体', 'STKaiti'],
  microsoftyahei: ['微软雅黑', 'PingFang SC', 'Noto Sans CJK SC', 'SealNotoSans'],
  微软雅黑: ['Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', 'SealNotoSans'],
  msyh: ['微软雅黑', 'Microsoft YaHei', 'PingFang SC'],
  dengxian: ['等线', 'PingFang SC', 'Noto Sans CJK SC'],
  等线: ['DengXian', 'PingFang SC', 'Noto Sans CJK SC'],
  方正小标宋简体: ['华文中宋', 'STZhongsong', 'Noto Serif CJK SC', 'SealNotoSerif'],
  fzxbsjt: ['方正小标宋简体', '华文中宋', 'STZhongsong'],
  fzxbs: ['方正小标宋简体', '华文中宋', 'STZhongsong'],
  方正小标宋: ['方正小标宋简体', '华文中宋', 'STZhongsong'],
  stzhongsong: ['华文中宋', '方正小标宋简体', 'Noto Serif CJK SC'],
  华文中宋: ['STZhongsong', '方正小标宋简体', 'Noto Serif CJK SC'],
  方正仿宋简体: ['仿宋', 'FangSong', 'STFangsong'],
  方正黑体简体: ['黑体', 'SimHei', 'Noto Sans CJK SC'],
  方正楷体简体: ['楷体', 'KaiTi', 'STKaiti'],
  方正书宋简体: ['宋体', 'SimSun', 'Noto Serif CJK SC'],
  calibri: ['Carlito', 'Arial', 'SealNotoSans'],
  cambria: ['Caladea', 'Times New Roman', 'SealNotoSerif'],
  arial: ['Liberation Sans', 'Helvetica', 'SealNotoSans'],
  timesnewroman: ['Liberation Serif', 'Times', 'SealNotoSerif'],
}

export function 规整字体名称(名称: string): string {
  return 名称.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ')
}

export function 规范化字体键(名称: string): string {
  return 规整字体名称(名称).toLowerCase().replace(/[\s_\-.'"`]/g, '')
}

function 去重(列表: string[]): string[] {
  const 已见 = new Set<string>()
  return 列表.filter((项) => {
    const 键 = 项.toLowerCase()
    if (!项 || 已见.has(键)) return false
    已见.add(键)
    return true
  })
}

export function 字体回退链(名称: string): string[] {
  const 原名 = 规整字体名称(名称)
  if (!原名) return 通用无衬线
  const 兼容 = 兼容映射[规范化字体键(原名)] ?? []
  const 衬线 = /宋|song|serif|times|仿宋|fangsong|楷|kai|小标宋|中宋|zhongsong/i.test(原名)
  return 去重([原名, ...兼容, ...(衬线 ? 通用衬线 : 通用无衬线)])
}

/** CSS font-family 值；只用于展示，不改变文档中保存的字体名称。 */
export function 字体回退Css(名称: string): string {
  return 字体回退链(名称).map((项) => `"${项.replace(/["\\]/g, '\\$&')}"`).join(',')
}

/**
 * 为已有 HTML 的 font-family 补上兼容回退。原字体永远保持第一位，导出 DOCX
 * 时仍按首位字体名写回；只在浏览器找不到原字体时启用后续替代。
 */
export function 增强字体回退Html(html: string): string {
  if (!html.includes('font-family')) return html
  return html.replace(/(font-family\s*:\s*)([^;"'}]+)/gi, (原文, 前缀: string, 值: string) => {
    if (/var\(|attr\(|url\(/i.test(值)) return 原文
    return 前缀 + 字体回退Css(值)
  })
}
