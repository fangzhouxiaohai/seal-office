// renderer/src/main.tsx
// 渲染进程入口：创建 React 根节点并挂载应用
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const container = document.getElementById('root')

// 根节点缺失属于致命配置错误，直接抛出明确的中文异常，避免出现静默空白窗口
if (!container) {
  throw new Error('渲染入口初始化失败：未找到根节点 #root，请检查 renderer/index.html')
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
