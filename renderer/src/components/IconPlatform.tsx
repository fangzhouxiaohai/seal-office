import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
export type IconPlatform = 'pc' | 'mobile'
const Platform = createContext<IconPlatform>('pc')
export const useIconPlatform = () => useContext(Platform)
const MOBILE_QUERY = '(max-width: 820px), (pointer: coarse) and (max-width: 1024px)'

/** One viewport listener for Web/native. Desktop always uses PC vectors. */
export function IconPlatformProvider({ responsive = false, children }: { responsive?: boolean; children: ReactNode }) {
  const [platform, setPlatform] = useState<IconPlatform>(() => responsive && typeof matchMedia === 'function' && matchMedia(MOBILE_QUERY).matches ? 'mobile' : 'pc')
  useEffect(() => {
    if (!responsive || typeof matchMedia !== 'function') return
    const query = matchMedia(MOBILE_QUERY)
    const update = () => setPlatform(query.matches ? 'mobile' : 'pc')
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [responsive])
  useEffect(() => {
    document.documentElement.dataset.sealUi = platform
    return () => { delete document.documentElement.dataset.sealUi }
  }, [platform])
  return <Platform.Provider value={platform}>{children}</Platform.Provider>
}
