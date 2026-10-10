// renderer/src/main.tsx
// 渲染进程入口：创建 React 根节点并挂载应用。
// 演讲者窗口使用同一入口与预加载桥接，但只加载只读演讲者视图，不加载编辑器。
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import 演讲者窗口根 from './ppt/playback/PresenterView'
import './styles.css'
import './styles/nativeControls.css'
import './styles/actionColors.css'
import './styles/flatDesktop.css'
import '../../main/ui/dialog.css'

const container = document.getElementById('root')

// 根节点缺失属于致命配置错误，直接抛出明确的中文异常，避免出现静默空白窗口
if (!container) {
  throw new Error('渲染入口初始化失败：未找到根节点 #root，请检查 renderer/index.html')
}

const 是演讲者窗口 = typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('seal-presenter') !== null

createRoot(container).render(
  <React.StrictMode>
    {是演讲者窗口 ? <演讲者窗口根 /> : <App />}
  </React.StrictMode>
)
