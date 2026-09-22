// renderer/src/App.tsx
import React, { useState } from 'react'
import { Button, Space } from 'antd'

// 左侧文件列表对应的功能模块，key 同时作为当前模块标识
const MODULES = [
  { key: 'word', label: '文档', count: 2 },
  { key: 'table', label: '表格', count: 1 },
  { key: 'ppt', label: '演示文稿', count: 3 },
]

const App = () => {
  const [currentModule, setCurrentModule] = useState('word')

  return (
    <div className="app-container">
      {/* 顶部导航栏 */}
      <div className="header">
        <div className="header-left">
          <h1>WPS 模仿办公软件</h1>
        </div>
        <div className="header-right">
          <Space>
            <Button size="small">保存</Button>
            <Button size="small">导出</Button>
          </Space>
        </div>
      </div>

      <div className="body">
        {/* 左侧文件管理 */}
        <div className="sidebar">
          <div className="file-list">
            {MODULES.map((item) => (
              <div
                key={item.key}
                className={item.key === currentModule ? 'file-item active' : 'file-item'}
                onClick={() => setCurrentModule(item.key)}
              >
                <span>{item.label}</span>
                <span>{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 主内容区 */}
        <div className="content">
          {currentModule === 'word' && (
            <div className="word-editor">
              <div className="word-toolbar">文档工具栏</div>
              <div className="word-editor-area" contentEditable suppressContentEditableWarning>
                在此输入文档内容
              </div>
            </div>
          )}

          {currentModule === 'table' && (
            <div className="table-editor">表格编辑区域</div>
          )}

          {currentModule === 'ppt' && (
            <div className="ppt-editor">幻灯片编辑区域</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
