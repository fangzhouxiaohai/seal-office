import { useEffect, useState } from 'react'

const 移动视口 = '(max-width: 820px), (pointer: coarse) and (max-width: 1024px)'
const 字号键 = 'seal-office.reading-font-size'
export const 阅读字号 = [16, 18, 20, 22, 24, 28, 32] as const

/** 阅读偏好只影响视图，不进入文档 HTML、页面设置或撤销历史。 */
export function useMobileReading(文档标识: string, 已有来源: boolean) {
  const [移动端, set移动端] = useState(() => Boolean(document.documentElement.dataset.sealPlatform && window.matchMedia?.(移动视口).matches))
  const [文档模式, set文档模式] = useState<Record<string, boolean>>({})
  const [字号, set字号] = useState(() => {
    try {
      const 已存 = Number(localStorage.getItem(字号键))
      return 阅读字号.includes(已存 as typeof 阅读字号[number]) ? 已存 : 18
    } catch { return 18 }
  })
  useEffect(() => {
    if (!document.documentElement.dataset.sealPlatform || !window.matchMedia) return
    const 媒体 = window.matchMedia(移动视口)
    const 更新 = () => set移动端(媒体.matches)
    更新()
    媒体.addEventListener('change', 更新)
    return () => 媒体.removeEventListener('change', 更新)
  }, [])
  const 阅读模式 = 移动端 && Boolean(文档标识) && (文档模式[文档标识] ?? 已有来源)
  return {
    移动端,
    阅读模式,
    字号,
    设置阅读: (开启: boolean) => set文档模式(当前 => ({ ...当前, [文档标识]: 开启 })),
    设置字号: (值: number) => {
      if (!阅读字号.includes(值 as typeof 阅读字号[number])) return
      set字号(值)
      try { localStorage.setItem(字号键, String(值)) } catch { /* 私密模式仍允许本次阅读调节。 */ }
    },
  }
}
