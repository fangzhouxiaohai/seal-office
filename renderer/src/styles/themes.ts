// 主题配置：外观模式（浅色 / 深色）+ 皮肤（每种模式下的颜色令牌）

import 内置皮肤数据 from '../../../main/skins/builtinSkins.json'

export type 主题名 = '浅色' | '深色'

export interface 皮肤颜色 {
  bg: string; sidebar: string; card: string; toolbar: string
  text: string; text2: string; text3: string; border: string
  brand: string; brandHover: string; brandSoft: string
  hover: string; selected: string; gradientFrom: string; gradientTo: string
}

export interface 皮肤定义 {
  format: 'seal-skin'; schema: 1
  id: string; name: string; author?: string; version: string; description?: string
  light: 皮肤颜色; dark: 皮肤颜色
  radius?: { card: number; control: number }
  background?: { image: string; opacity: number }
}

export const 内置皮肤列表 = 内置皮肤数据 as 皮肤定义[]
export const 默认皮肤 = 内置皮肤列表[0]
export const 默认皮肤标识 = 默认皮肤.id

/** Ant Design 组件库令牌，使弹窗、按钮、表单与当前皮肤一致。 */
export function 皮肤主题令牌(皮肤: 皮肤定义, 深色: boolean) {
  const 色 = 深色 ? 皮肤.dark : 皮肤.light
  return {
    colorPrimary: 色.brand,
    colorInfo: 色.brand,
    colorLink: 色.brandHover,
    colorText: 色.text,
    colorTextSecondary: 色.text2,
    colorBorder: 色.border,
    colorBorderSecondary: 深色 ? 色.hover : 色.border,
    colorBgContainer: 色.card,
    colorBgElevated: 深色 ? 色.toolbar : 色.card,
    colorBgLayout: 色.bg,
    borderRadius: 皮肤.radius?.control ?? 10,
  }
}

/**
 * 应用主题到全局样式
 */
export function 应用主题(主题: 主题名, 皮肤: 皮肤定义 = 默认皮肤) {
  const 深色 = 主题 === '深色'
  const 色 = 深色 ? 皮肤.dark : 皮肤.light
  if (!色) return

  document.body.style.backgroundColor = 色.bg
  document.body.style.color = 色.text

  // 通过CSS变量应用到各个组件
  const root = document.documentElement
  root.setAttribute('data-theme', 深色 ? 'dark' : 'light')
  root.dataset.sealSkin = 皮肤.id
  const 写入 = (名称: string, 值: string) => root.style.setProperty(名称, 值)
  写入('--seal-bg', 色.bg)
  写入('--seal-sidebar-bg', 色.sidebar)
  写入('--seal-content-bg', 色.card)
  写入('--seal-text', 色.text)
  写入('--seal-text-secondary', 色.text2)
  写入('--seal-border', 色.border)
  写入('--seal-primary', 色.brand)
  写入('--seal-hover', 色.hover)
  写入('--seal-selected', 色.selected)
  写入('--seal-toolbar-bg', 色.toolbar)

  // 同时更新基础CSS变量，确保深浅模式全局生效
  写入('--brand', 色.brand)
  写入('--brand-hover', 色.brandHover)
  写入('--brand-soft', 色.brandSoft)
  写入('--brand-gradient', `linear-gradient(135deg, ${色.gradientFrom} 0%, ${色.brand} 45%, ${色.gradientTo} 100%)`)
  写入('--brand-glow', `0 8px 20px ${色.brand}47`)
  写入('--bg-app', 色.bg)
  写入('--bg-card', 色.card)
  写入('--bg-hover', 色.hover)
  写入('--border', 色.border)
  写入('--border-subtle', 色.border)
  写入('--text-1', 色.text)
  写入('--text-2', 色.text2)
  写入('--text-3', 色.text3)
  写入('--radius-card', `${皮肤.radius?.card ?? 12}px`)
  写入('--radius-control', `${皮肤.radius?.control ?? 8}px`)
  写入('--seal-skin-bg', 皮肤.background ? `url("${皮肤.background.image}")` : 'none')
  写入('--seal-skin-bg-opacity', String(皮肤.background?.opacity ?? 0))
}
