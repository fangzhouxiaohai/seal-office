import { describe, it, expect, beforeEach } from 'vitest'
import { 应用主题, 默认皮肤, 内置皮肤列表, 皮肤主题令牌 } from './themes'

const 变量 = (名称: string) => document.documentElement.style.getPropertyValue(名称)

describe('皮肤应用到界面变量', () => {
  beforeEach(() => { document.documentElement.removeAttribute('style'); document.documentElement.removeAttribute('data-theme') })

  it('默认皮肤浅色模式保持 2.3.0 配色', () => {
    应用主题('浅色')
    expect(变量('--brand')).toBe('#6A5CF5')
    expect(变量('--bg-app')).toBe('#F4F5FB')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.dataset.sealSkin).toBe('seal.violet')
  })

  it('切换皮肤与深色模式后写入对应颜色、渐变和圆角', () => {
    const 森林 = 内置皮肤列表.find(皮肤 => 皮肤.id === 'seal.forest')!
    应用主题('深色', 森林)
    expect(变量('--brand')).toBe(森林.dark.brand)
    expect(变量('--bg-card')).toBe(森林.dark.card)
    expect(变量('--text-1')).toBe(森林.dark.text)
    expect(变量('--brand-gradient')).toContain(森林.dark.gradientFrom)
    expect(变量('--radius-card')).toBe('16px')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.dataset.sealSkin).toBe('seal.forest')
  })

  it('背景图皮肤写入背景变量，无背景图时清除', () => {
    const 背景皮肤 = { ...默认皮肤, id: 'demo.bg', background: { image: 'data:image/png;base64,AAAA', opacity: 0.2 } }
    应用主题('浅色', 背景皮肤)
    expect(变量('--seal-skin-bg')).toBe('url("data:image/png;base64,AAAA")')
    expect(变量('--seal-skin-bg-opacity')).toBe('0.2')
    应用主题('浅色', 默认皮肤)
    expect(变量('--seal-skin-bg')).toBe('none')
  })

  it('组件库主题令牌跟随皮肤主色', () => {
    const 海蓝 = 内置皮肤列表.find(皮肤 => 皮肤.id === 'seal.ocean')!
    expect(皮肤主题令牌(海蓝, false).colorPrimary).toBe(海蓝.light.brand)
    expect(皮肤主题令牌(海蓝, true).colorBgContainer).toBe(海蓝.dark.card)
  })
})
