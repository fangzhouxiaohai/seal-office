import React from 'react'
import { createRoot } from 'react-dom/client'
import { ready } from './bridge'
import App from '../../renderer/src/App'
import '../../renderer/src/styles.css'
import '../../renderer/src/styles/nativeControls.css'
import '../../renderer/src/styles/actionColors.css'
import '../../renderer/src/styles/flatDesktop.css'
import '../../main/ui/dialog.css'
import './mobile.css'
import MobileNavigation from './navigation'
import { IconPlatformProvider } from '../../renderer/src/components/IconPlatform'
import { installViewport } from './viewport'

const container = document.getElementById('root')!
ready.then(async () => {
  if (document.documentElement.dataset.sealUnsupported === '1') return
  document.documentElement.dataset.sealPlatform = new URLSearchParams(location.search).has('native') ? 'app' : 'web'
  installViewport()
  // 构建共享桌面 App，移动导航通过同一个 Store 执行真实操作。
  createRoot(container).render(<React.StrictMode><IconPlatformProvider responsive><App 跨端导航={MobileNavigation} /></IconPlatformProvider></React.StrictMode>)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') window.dispatchEvent(new Event('seal-persist-workspace')) })
}).catch((error) => {
  if (document.documentElement.dataset.sealUnsupported === '1') return
  container.replaceChildren()
  const title = document.createElement('h1'); title.textContent = '海豹办公暂时无法打开'
  const text = document.createElement('p'); text.textContent = error instanceof Error ? error.message : String(error)
  const retry = document.createElement('button'); retry.textContent = '重新打开'; retry.onclick = () => location.reload()
  container.append(title, text, retry)
})
