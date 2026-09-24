# 海豹办公功能升级实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 对海豹办公进行大规模功能升级，包括编辑器修复、文件操作、UI优化、模板库、设置功能等

**架构：** 基于现有 Electron + React + Ant Design 架构，通过扩展命令系统、新增IPC处理器、创建新组件模块来实现功能升级

**技术栈：** Electron 25, React 18, Ant Design 5, Vite 4, TypeScript, docx, exceljs, pptxgenjs

---

## 任务 1：安装新增依赖

**文件：**
- 修改：`package.json`

- [ ] **步骤 1：添加新增依赖到 package.json**

```json
{
  "docx": "^8.5.0",
  "exceljs": "^4.4.0",
  "pptxgenjs": "^3.12.0",
  "html-to-pdfmake": "^2.1.0",
  "pdfmake": "^0.2.15"
}
```

- [ ] **步骤 2：运行安装命令**

运行：`cd E:\seal-office && npm install`

预期：依赖安装成功，无报错

- [ ] **步骤 3：验证安装**

运行：`cd E:\seal-office && npm list docx exceljs pptxgenjs`

预期：显示已安装的版本

- [ ] **步骤 4：Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: 添加文件操作和PDF导出依赖"
```

---

## 任务 2：修复字体颜色功能

**文件：**
- 修改：`renderer/src/editor/commands.ts:233-238`
- 修改：`renderer/src/editor/ribbon/RibbonPanel.tsx`（检查参数传递）

- [ ] **步骤 1：分析字体颜色命令问题**

查看 `commands.ts` 中 `font.color` 命令实现，确认参数传递链路

- [ ] **步骤 2：修复字体颜色命令**

修改 `commands.ts` 中字体颜色命令，确保颜色值正确传递：

```typescript
生成回调命令('font.color', '字体颜色', (上下文, 参数) => {
  if (参数 === undefined || 参数.length === 0) {
    上下文.notify('请先选择颜色')
    return
  }
  上下文.history.record({ html: 上下文.读取内容(), selection: null })
  上下文.执行格式化('foreColor', 参数)
  上下文.refresh()
}),
```

- [ ] **步骤 3：检查 RibbonPanel 参数传递**

确保 `RibbonPanel.tsx` 中下拉菜单的 `onSelect` 正确传递颜色值

- [ ] **步骤 4：测试验证**

在编辑器中选中文字，点击字体颜色下拉，选择颜色，验证文字颜色是否改变

- [ ] **步骤 5：Commit**

```bash
git add renderer/src/editor/commands.ts
git commit -m "fix: 修复字体颜色功能无法正常工作的bug"
```

---

## 任务 3：实现保存和另存为功能（Electron IPC）

**文件：**
- 创建：`main/fileOps.js`
- 修改：`main/preload.js`
- 修改：`main/ipcHandle.js`
- 修改：`renderer/src/editor/commands.ts`

- [ ] **步骤 1：创建文件操作模块 `main/fileOps.js`**

```javascript
const { dialog } = require('electron')
const fs = require('fs')
const path = require('path')

/**
 * 打开保存文件对话框
 */
exports.showSaveDialog = (win, 默认文件名) => {
  return dialog.showSaveDialog(win, {
    title: '保存',
    默认路径: 默认文件名,
    过滤器: [
      { name: 'Word文档', extensions: ['docx'] },
      { name: 'Excel表格', extensions: ['xlsx'] },
      { name: 'PPT演示', extensions: ['pptx'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
}

/**
 * 打开打开文件对话框
 */
exports.showOpenDialog = (win) => {
  return dialog.showOpenDialog(win, {
    title: '打开文件',
    过滤器: [
      { name: 'Office文档', extensions: ['docx', 'xlsx', 'pptx'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
}

/**
 * 保存文件到磁盘
 */
exports.saveToFile = (filePath, 内容) => {
  try {
    fs.writeFileSync(filePath, 内容, 'utf-8')
    return { 成功: true }
  } catch (error) {
    return { 成功: false, 错误: error.message }
  }
}
```

- [ ] **步骤 2：修改 preload.js 添加新 IPC 通道**

```javascript
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // 原有API
  openFile: (args) => ipcRenderer.invoke('open-file', args),
  
  // 新增API
  showSaveDialog: (默认文件名) => ipcRenderer.invoke('file.showSaveDialog', 默认文件名),
  showOpenDialog: () => ipcRenderer.invoke('file.showOpenDialog'),
  saveToFile: (filePath, 内容) => ipcRenderer.invoke('file.saveToFile', filePath, 内容),
})
```

- [ ] **步骤 3：修改 ipcHandle.js 添加文件操作处理器**

```javascript
const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

// 文件保存
ipcMain.handle('file.showSaveDialog', async (event, 默认文件名) => {
  const win = event.sender.ownerWindow
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: '保存',
    默认路径: 默认文件名,
    过滤器: [
      { name: 'Word文档', extensions: ['docx'] },
      { name: 'Excel表格', extensions: ['xlsx'] },
      { name: 'PPT演示', extensions: ['pptx'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (canceled) return null
  return filePath
})

ipcMain.handle('file.showOpenDialog', async (event) => {
  const win = event.sender.ownerWindow
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: '打开文件',
    过滤器: [
      { name: 'Office文档', extensions: ['docx', 'xlsx', 'pptx'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
})

ipcMain.handle('file.saveToFile', async (event, filePath, 内容) => {
  try {
    fs.writeFileSync(filePath, 内容, 'utf-8')
    return { 成功: true }
  } catch (error) {
    return { 成功: false, 错误: error.message }
  }
})
```

- [ ] **步骤 4：在 commands.ts 中添加保存命令**

```typescript
// 保存命令
生成回调命令('file.save', '保存', (上下文, 参数) => {
  // 通过window.electronAPI调用IPC
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    const 文件路径 = (window as any).electronAPI.showSaveDialog(上下文.当前文档名)
    if (文件路径) {
      const 内容 = 上下文.读取内容()
      const 结果 = (window as any).electronAPI.saveToFile(文件路径, 内容)
      if (结果.成功) {
        上下文.notify('文件已保存')
      } else {
        上下文.notify(`保存失败：${结果.错误}`)
      }
    }
  } else {
    上下文.notify('当前环境不支持保存功能')
  }
}),

// 另存为命令
生成回调命令('file.saveAs', '另存为', (上下文, 参数) => {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    const 文件路径 = (window as any).electronAPI.showSaveDialog('未命名文档.docx')
    if (文件路径) {
      const 内容 = 上下文.读取内容()
      const 结果 = (window as any).electronAPI.saveToFile(文件路径, 内容)
      if (结果.成功) {
        上下文.notify('文件已另存为')
      } else {
        上下文.notify(`保存失败：${结果.错误}`)
      }
    }
  } else {
    上下文.notify('当前环境不支持保存功能')
  }
}),
```

- [ ] **步骤 5：测试验证**

在编辑器中按 Ctrl+S，验证保存对话框是否弹出，保存后文件是否正确写入

- [ ] **步骤 6：Commit**

```bash
git add main/fileOps.js main/preload.js main/ipcHandle.js renderer/src/editor/commands.ts
git commit -m "feat: 实现保存和另存为功能"
```

---

## 任务 4：实现PDF导出功能

**文件：**
- 创建：`main/pdfExport.js`
- 修改：`main/ipcHandle.js`
- 修改：`renderer/src/editor/commands.ts`

- [ ] **步骤 1：创建PDF导出模块 `main/pdfExport.js`**

```javascript
const { BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

/**
 * 使用Electron打印功能导出PDF
 */
exports.exportToPdf = async (win, html内容, 默认文件名) => {
  try {
    // 创建临时HTML文件
    const 临时目录 = require('os').tmpdir()
    const 临时文件 = path.join(临时目录, `${Date.now()}.html`)
    fs.writeFileSync(临时文件, html内容, 'utf-8')
    
    // 使用打印功能导出PDF
    const 打印选项 = {
      默认页边距: { 上: 10, 下: 10, 左: 10, 右: 10 },
      页面范围: [], // 空数组表示全部
      打印背景: true
    }
    
    const 结果 = await win.webContents.printToPDF(打印选项)
    
    // 保存为PDF文件
    const 保存路径 = path.join(require('os').homedir(), 'Documents', 默认文件名.replace(/\.[^.]+$/, '') + '.pdf')
    fs.writeFileSync(保存路径, 结果)
    
    // 清理临时文件
    fs.unlinkSync(临时文件)
    
    return { 成功: true, 路径: 保存路径 }
  } catch (error) {
    return { 成功: false, 错误: error.message }
  }
}
```

- [ ] **步骤 2：在 ipcHandle.js 中添加PDF导出处理器**

```javascript
const pdfExport = require('./pdfExport')

ipcMain.handle('pdf.export', async (event, html内容, 默认文件名) => {
  const win = event.sender.ownerWindow
  return await pdfExport.exportToPdf(win, html内容, 默认文件名)
})
```

- [ ] **步骤 3：在 preload.js 中添加PDF导出API**

```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  // 原有...
  
  // PDF导出
  exportToPdf: (html内容, 默认文件名) => ipcRenderer.invoke('pdf.export', html内容, 默认文件名),
})
```

- [ ] **步骤 4：在 commands.ts 中添加PDF导出命令**

```typescript
生成回调命令('file.exportPdf', '导出为PDF', (上下文) => {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    const html = 上下文.读取内容()
    const 文档名 = 上下文.当前文档名
    (window as any).electronAPI.exportToPdf(html, 文档名)
      .then((结果: any) => {
        if (结果.成功) {
          上下文.notify(`PDF已导出到：${结果.路径}`)
        } else {
          上下文.notify(`PDF导出失败：${结果.错误}`)
        }
      })
  } else {
    上下文.notify('当前环境不支持PDF导出')
  }
}),
```

- [ ] **步骤 5：测试验证**

在编辑器中点击导出为PDF，验证是否能正确生成PDF文件

- [ ] **步骤 6：Commit**

```bash
git add main/pdfExport.js main/ipcHandle.js main/preload.js renderer/src/editor/commands.ts
git commit -m "feat: 实现PDF导出功能"
```

---

## 任务 5：UI优化（删除"演"按钮、删除反馈、添加帮助手册）

**文件：**
- 修改：`renderer/src/components/TitleBar.tsx`
- 修改：`renderer/src/navConfig.ts`
- 创建：`renderer/src/components/HelpManual.tsx`
- 修改：`renderer/src/components/Sidebar.tsx`

- [ ] **步骤 1：修改 TitleBar.tsx 删除"演"按钮**

查找并移除包含"演"的按钮组件，保留设置和帮助按钮

- [ ] **步骤 2：修改 navConfig.ts 更新菜单项**

```typescript
export const NAV_GROUPS: NavItem[][] = [
  [
    { key: 'home', label: '首页', icon: 'home', implemented: true },
    { key: 'recent', label: '最近', icon: 'clock', implemented: true },
    { key: 'star', label: '星标', icon: 'star', implemented: true },
    { key: 'shared', label: '共享', icon: 'share', implemented: true },
  ],
  [
    { key: 'cloud', label: '我的云文档', icon: 'cloud', implemented: false },
    { key: 'team', label: '团队文档', icon: 'users', implemented: false },
  ],
  [
    { key: 'pdf', label: 'PDF 工具', icon: 'pdf', implemented: false },
    { key: 'mindmap', label: '脑图', icon: 'mindmap', implemented: false },
    { key: 'flow', label: '流程图', icon: 'flow', implemented: false },
  ],
  [
    { key: 'settings', label: '设置', icon: 'settings', implemented: true },
    { key: 'help', label: '帮助手册', icon: 'help', implemented: true },
  ],
]
```

- [ ] **步骤 3：创建 HelpManual.tsx 帮助手册组件**

```tsx
import React, { useState } from 'react'
import { Input, Collapse, Tag } from 'antd'

const { Search } = Input
const { Panel } = Collapse

const 帮助数据 = [
  {
    标题: '入门指南',
    内容: '欢迎使用海豹办公！本手册将帮助您快速上手。',
    标签: '入门'
  },
  {
    标题: '文档编辑',
    内容: '在文档编辑器中，您可以使用顶部功能栏进行文字编辑、格式设置、插入表格等操作。',
    标签: '文档'
  },
  {
    标题: '表格操作',
    内容: '表格支持插入、删除行列，设置边框，拖选范围等功能。右键表格可快速操作。',
    标签: '表格'
  },
  {
    标题: '文件保存',
    内容: '按 Ctrl+S 可快速保存文档，或使用"文件"菜单中的"保存"和"另存为"功能。',
    标签: '文件'
  },
  {
    标题: 'PDF导出',
    内容: '使用"文件"菜单中的"导出为PDF"功能，可将当前文档导出为PDF格式。',
    标签: '导出'
  },
  {
    标题: '常见问题',
    内容: 'Q: 如何设为默认办公软件？A: 进入"设置"页面，点击"设为默认办公软件"即可。',
    标签: '问答'
  }
]

const HelpManual = () => {
  const [搜索结果, set搜索结果] = useState<any[]>([])
  const [搜索中, set搜索中] = useState(false)

  const 处理搜索 = (值: string) => {
    set搜索中(true)
    if (值.length > 0) {
      const 结果 = 帮助数据.filter(项 => 
        项.标题.includes(值) || 项.内容.includes(值)
      )
      set搜索结果(结果)
    } else {
      set搜索结果([])
    }
    set搜索中(false)
  }

  return React.createElement('div', { className: 'help-manual' },
    React.createElement('h2', null, '帮助手册'),
    
    React.createElement(Search, {
      placeholder: '搜索帮助内容...',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => 处理搜索(e.target.value),
      prefix: React.createElement('span', { className: 'search-icon' }, '🔍')
    }),

    搜索结果.length > 0 
      ? 搜索结果.map((项, 索引) => 
          React.createElement('div', { key: 索引, className: 'help-result' },
            React.createElement(Tag, { color: 'blue' }, 项.标签),
            React.createElement('h3', null, 项.标题),
            React.createElement('p', null, 项.内容)
          )
        )
      : React.createElement(Collapse, null,
          帮助数据.map((项, 索引) => 
            React.createElement(Panel, { 
              key: 索引.toString(), 
              header: 项.标题 
            },
              React.createElement(Tag, { color: 'blue' }, 项.标签),
              React.createElement('p', null, 项.内容)
            )
          )
        )
  )
}

export default HelpManual
```

- [ ] **步骤 4：修改 Sidebar.tsx 移除反馈入口**

确保左侧菜单中只有"设置"和"帮助手册"，移除任何反馈相关入口

- [ ] **步骤 5：测试验证**

检查TitleBar、Sidebar、帮助手册是否正确显示

- [ ] **步骤 6：Commit**

```bash
git add renderer/src/components/TitleBar.tsx renderer/src/navConfig.ts renderer/src/components/HelpManual.tsx renderer/src/components/Sidebar.tsx
git commit -m "ui: 优化界面，删除演按钮和反馈功能，添加帮助手册"
```

---

## 任务 6：表格功能增强

**文件：**
- 创建：`renderer/src/editor/table/tableActions.ts`
- 创建：`renderer/src/editor/table/tableSelection.ts`
- 创建：`renderer/src/editor/table/tableBorder.ts`
- 修改：`renderer/src/editor/commands.ts`
- 创建：`renderer/src/components/Table/TableContextMenu.tsx`
- 创建：`renderer/src/components/Table/TableBorderSetter.tsx`

- [ ] **步骤 1：创建表格操作模块 `tableActions.ts`**

```typescript
/**
 * 删除表格中的指定行
 */
export function 删除表格行(表格元素: HTMLTableElement, 行索引: number): boolean {
  if (行索引 < 0 || 行索引 >= 表格元素.rows.length) {
    return false
  }
  if (表格元素.rows.length <= 1) {
    return false // 至少保留一行
  }
  表格元素.deleteRow(行索引)
  return true
}

/**
 * 删除表格中的指定列
 */
export function 删除表格列(表格元素: HTMLTableElement, 列索引: number): boolean {
  if (列索引 < 0 || 列索引 >= 表格元素.rows[0].cells.length) {
    return false
  }
  if (表格元素.rows[0].cells.length <= 1) {
    return false // 至少保留一列
  }
  for (let i = 0; i < 表格元素.rows.length; i++) {
    表格元素.rows[i].deleteCell(列索引)
  }
  return true
}

/**
 * 在表格中插入新行
 */
export function 插入表格行(表格元素: HTMLTableElement, 行索引: number, 上方: boolean = false): void {
  const 新行 = 表格元素.insertRow(上方 ? 行索引 : 行索引 + 1)
  const 单元格数 = 表格元素.rows[0].cells.length
  for (let i = 0; i < 单元格数; i++) {
    const 新单元格 = 新行.insertCell()
    新单元格.innerHTML = '&nbsp;'
    新单元格.style.border = '1px solid #E8EBF0'
    新单元格.style.padding = '6px 8px'
  }
}
```

- [ ] **步骤 2：创建表格选择模块 `tableSelection.ts`**

```typescript
/**
 * 处理表格单元格拖选
 */
export class 表格选择器 {
  private 表格: HTMLTableElement | null = null
  private 起始单元格: HTMLTableCellElement | null = null
  private 结束单元格: HTMLTableCellElement | null = null
  private 选区: Range | null = null

  开始选择(单元格: HTMLTableCellElement) {
    this.表格 = 单元格.closest('table') as HTMLTableElement
    this.起始单元格 = 单元格
    this.结束单元格 = 单元格
    this.高亮选区()
  }

  继续选择(单元格: HTMLTableCellElement) {
    this.结束单元格 = 单元格
    this.高亮选区()
  }

  结束选择() {
    this.起始单元格 = null
    this.结束单元格 = null
    this.清除高亮()
  }

  private 高亮选区() {
    if (!this.表格 || !this.起始单元格 || !this.结束单元格) return
    
    // 清除之前的高亮
    this.清除高亮()
    
    // 计算选区范围
    const 起始行 = this.起始单元格.parentElement
    const 结束行 = this.结束单元格.parentElement
    if (!起始行 || !结束行) return

    const 起始行索引 = Array.from(this.表格.rows).indexOf(起始行)
    const 结束行索引 = Array.from(this.表格.rows).indexOf(结束行)
    const 起始列索引 = Array.from(起始行.cells).indexOf(this.起始单元格)
    const 结束列索引 = Array.from(结束行.cells).indexOf(this.结束单元格)

    const 最小行 = Math.min(起始行索引, 结束行索引)
    const 最大行 = Math.max(起始行索引, 结束行索引)
    const 最小列 = Math.min(起始列索引, 结束列索引)
    const 最大列 = Math.max(起始列索引, 结束列索引)

    // 高亮选中的单元格
    for (let r = 最小行; r <= 最大行; r++) {
      for (let c = 最小列; c <= 最大列; c++) {
        this.表格.rows[r].cells[c].style.backgroundColor = '#B3D9FF'
      }
    }
  }

  private 清除高亮() {
    if (!this.表格) return
    const 所有单元格 = this.表格.querySelectorAll('td')
    所有单元格.forEach((单元格: Element) => {
      (单元格 as HTMLTableCellElement).style.backgroundColor = ''
    })
  }
}
```

- [ ] **步骤 3：创建表格边框设置模块 `tableBorder.ts`**

```typescript
/**
 * 设置表格边框样式
 */
export function 设置表格边框(表格元素: HTMLTableElement, 选项: {
  颜色?: string
  粗细?: number
  样式?: '单实线' | '双实线' | '虚线' | '无'
}) {
  const { 颜色 = '#E8EBF0', 粗细 = 1, 样式 = '单实线' } = 选项
  
  let 边框样式 = ''
  switch (样式) {
    case '单实线':
      边框样式 = `${粗细}px solid ${颜色}`
      break
    case '双实线':
      边框样式 = `${粗细}px double ${颜色}`
      break
    case '虚线':
      边框样式 = `${粗细}px dashed ${颜色}`
      break
    case '无':
      边框样式 = 'none'
      break
  }

  表格元素.style.borderCollapse = 'collapse'
  const 单元格 = 表格元素.querySelectorAll('td, th')
  单元格.forEach((单元格: Element) => {
    (单元格 as HTMLElement).style.border = 边框样式
  })
}
```

- [ ] **步骤 4：在 commands.ts 中添加表格操作命令**

```typescript
// 删除行
生成回调命令('table.deleteRow', '删除行', (上下文) => {
  const 元素 = 上下文.root
  const 选区 = window.getSelection()
  if (!选区 || !选区.anchorNode) return
  
  const 表格 = (选区.anchorNode.parentElement?.closest('table')) as HTMLTableElement
  if (!表格) {
    上下文.notify('请先选中表格中的单元格')
    return
  }
  
  const 行 = (选区.anchorNode.parentElement as HTMLElement).closest('tr')
  if (!行) return
  
  const 行索引 = Array.from(表格.rows).indexOf(行 as HTMLTableRowElement)
  上下文.history.record({ html: 上下文.读取内容(), selection: null })
  
  if (删除表格行(表格, 行索引)) {
    上下文.refresh()
    上下文.notify('已删除行')
  } else {
    上下文.notify('无法删除此行')
  }
}),

// 删除列
生成回调命令('table.deleteCol', '删除列', (上下文) => {
  const 元素 = 上下文.root
  const 选区 = window.getSelection()
  if (!选区 || !选区.anchorNode) return
  
  const 表格 = (选区.anchorNode.parentElement?.closest('table')) as HTMLTableElement
  if (!表格) {
    上下文.notify('请先选中表格中的单元格')
    return
  }
  
  const 单元格 = (选区.anchorNode.parentElement as HTMLElement).closest('td, th')
  if (!单元格) return
  
  const 行 = 表格.rows[0]
  const 列索引 = Array.from(行.cells).indexOf(单元格 as HTMLTableCellElement)
  上下文.history.record({ html: 上下文.读取内容(), selection: null })
  
  if (删除表格列(表格, 列索引)) {
    上下文.refresh()
    上下文.notify('已删除列')
  } else {
    上下文.notify('无法删除此列')
  }
}),
```

- [ ] **步骤 5：测试验证**

在表格中右键或选中行列，验证删除功能是否正常

- [ ] **步骤 6：Commit**

```bash
git add renderer/src/editor/table/ renderer/src/components/Table/ renderer/src/editor/commands.ts
git commit -m "feat: 表格功能增强，支持删除行列、拖选范围、设置边框"
```

---

## 任务 7：深浅模式切换

**文件：**
- 创建：`renderer/src/styles/themes.ts`
- 创建：`renderer/src/store/settingsStore.ts`
- 修改：`renderer/src/App.tsx`
- 修改：`renderer/src/navConfig.ts`（添加深浅模式菜单项）

- [ ] **步骤 1：创建主题配置 `themes.ts`**

```typescript
export const 主题样式 = {
  浅色: {
    背景: '#F5F7FA',
    侧栏背景: '#FFFFFF',
    内容背景: '#FFFFFF',
    文字颜色: '#1A1D24',
    次要文字: '#5C6472',
    边框颜色: '#E8EBF0',
    主色: '#2B6CF6',
    悬停背景: '#F0F5FF',
  },
  深色: {
    背景: '#1A1D24',
    侧栏背景: '#252A33',
    内容背景: '#2D333F',
    文字颜色: '#E8EAED',
    次要文字: '#9AA0A6',
    边框颜色: '#3C4043',
    主色: '#4A90E2',
    悬停背景: '#2D333F',
  }
}

export type 主题名 = '浅色' | '深色'
```

- [ ] **步骤 2：创建设置状态管理 `settingsStore.ts`**

```typescript
import { useState, createContext, useContext } from 'react'
import { 主题名 } from '../styles/themes'

interface SettingsState {
  主题: 主题名
  切换主题: () => void
}

const SettingsContext = createContext<SettingsState | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [主题, set主题] = useState<主题名>('浅色')

  const 切换主题 = () => {
    set主题(prev => prev === '浅色' ? '深色' : '浅色')
  }

  return React.createElement(SettingsContext.Provider, {
    value: { 主题, 切换主题 }
  }, children)
}

export function useSettings() {
  const 状态 = useContext(SettingsContext)
  if (!状态) {
    throw new Error('useSettings 必须在 SettingsProvider 内使用')
  }
  return 状态
}
```

- [ ] **步骤 3：在 App.tsx 中集成主题切换**

```tsx
import { SettingsProvider, useSettings } from './store/settingsStore'
import { 主题样式 } from './styles/themes'

const AppContent = () => {
  const { 主题, 切换主题 } = useSettings()
  const 样式 = 主题样式[主题]

  // 应用主题到全局样式
  React.useEffect(() => {
    document.body.style.backgroundColor = 样式.背景
    document.body.style.color = 样式.文字颜色
  }, [样式])

  return (
    <div className="app" data-theme={主题}>
      {/* 原有内容 */}
      {/* 添加主题切换按钮 */}
    </div>
  )
}

export default function App() {
  return React.createElement(SettingsProvider, null, React.createElement(AppContent, null))
}
```

- [ ] **步骤 4：测试验证**

点击主题切换按钮，验证界面颜色是否正确切换

- [ ] **步骤 5：Commit**

```bash
git add renderer/src/styles/themes.ts renderer/src/store/settingsStore.ts renderer/src/App.tsx
git commit -m "feat: 实现深浅模式切换功能"
```

---

## 任务 8：图表功能

**文件：**
- 创建：`renderer/src/components/Chart/ChartEditor.tsx`
- 修改：`renderer/src/editor/graphics.ts`（扩展现有图表功能）
- 修改：`renderer/src/editor/ribbon/tabSpecs.ts`（添加图表标签）

- [ ] **步骤 1：扩展现有图表生成函数**

检查 `graphics.ts` 中已有的图表生成函数，确保支持更多类型和自定义数据

- [ ] **步骤 2：创建图表编辑器组件 `ChartEditor.tsx`**

```tsx
import React, { useState } from 'react'
import { Modal, Form, InputNumber, Button, Select } from 'antd'
import { 生成图表Svg, 示例图表数据, type 图表类型 } from '../../editor/graphics'

const ChartEditor = ({ 打开状态, 关闭回调, 确认回调 }: {
  打开状态: boolean
  关闭回调: () => void
  确认回调: (svg: string) => void
}) => {
  const [图表类型, set图表类型] = useState<图表类型>('柱形图')
  const [预览Svg, set预览Svg] = useState('')

  React.useEffect(() => {
    if (打开状态) {
      const svg = 生成图表Svg(图表类型, 示例图表数据)
      set预览Svg(svg)
    }
  }, [打开状态, 图表类型])

  return React.createElement(Modal, {
    title: '图表编辑',
    open: 打开状态,
    onCancel: 关闭回调,
    onOk: () => 确认回调(预览Svg),
    width: 800
  },
    React.createElement('div', null,
      React.createElement(Select, {
        value: 图表类型,
        onChange: set图表类型,
        style: { width: '100%', marginBottom: '16px' },
        options: [
          { label: '柱形图', value: '柱形图' },
          { label: '折线图', value: '折线图' },
          { label: '饼图', value: '饼图' },
          { label: '散点图', value: '散点图' }
        ]
      }),
      React.createElement('div', { 
        dangerouslySetInnerHTML: { __html: 预览Svg },
        style: { border: '1px solid #E8EBF0', padding: '16px' }
      })
    )
  )
}

export default ChartEditor
```

- [ ] **步骤 3：添加图表标签到Ribbon**

在 `tabSpecs.ts` 中添加"图表"标签

- [ ] **步骤 4：测试验证**

在编辑器中插入图表，验证图表编辑器是否正常弹出，图表是否正确生成

- [ ] **步骤 5：Commit**

```bash
git add renderer/src/components/Chart/ renderer/src/editor/graphics.ts renderer/src/editor/ribbon/tabSpecs.ts
git commit -m "feat: 添加图表功能和图表编辑器"
```

---

## 任务 9：流程图功能

**文件：**
- 创建：`renderer/src/components/FlowChart/FlowCanvas.tsx`
- 创建：`renderer/src/components/FlowChart/FlowShapes.tsx`
- 修改：`renderer/src/navConfig.ts`（启用流程图菜单）

- [ ] **步骤 1：创建流程图形状组件 `FlowShapes.tsx`**

```tsx
import React from 'react'

export interface FlowNode {
  id: string
  type: '起点' | '终点' | '处理' | '判断' | '输入输出'
  x: number
  y: number
  文本: string
}

export interface FlowConnection {
  from: string
  to: string
  标签?: string
}

/**
 * 渲染单个流程图节点
 */
export const FlowNodeComponent = ({ 节点 }: { 节点: FlowNode }) => {
  const 形状映射 = {
    '起点': { 填充: '#52C41A', 文字颜色: '#FFFFFF', 圆角: 20 },
    '终点': { 填充: '#FF4D4F', 文字颜色: '#FFFFFF', 圆角: 20 },
    '处理': { 填充: '#1890FF', 文字颜色: '#FFFFFF', 圆角: 4 },
    '判断': { 填充: '#FAAD14', 文字颜色: '#FFFFFF', 圆角: 0, 旋转: true },
    '输入输出': { 填充: '#722ED1', 文字颜色: '#FFFFFF', 斜体: true }
  }

  const 样式 = 形状映射[节点.类型]

  return React.createElement('g', { transform: `translate(${节点.x}, ${节点.y})` },
    React.createElement('rect', {
      width: 120,
      height: 60,
      rx: 样式.圆角 || 0,
      fill: 样式.填充,
      stroke: '#333',
      strokeWidth: 2
    }),
    React.createElement('text', {
      x: 60,
      y: 35,
      'text-anchor': 'middle',
      fill: 样式.文字颜色,
      fontSize: 14,
      fontWeight: 'bold'
    }, 节点.文本)
  )
}
```

- [ ] **步骤 2：创建流程图画布 `FlowCanvas.tsx`**

```tsx
import React, { useState } from 'react'
import { FlowNode } from './FlowShapes'

const FlowCanvas = ({ 节点列表, 连接线 }: {
  节点列表: FlowNode[]
  连接线: any[]
}) => {
  return React.createElement('svg', {
    width: '100%',
    height: 600,
    style: { border: '1px solid #E8EBF0', background: '#FAFAFA' }
  },
    ...节点列表.map((节点) => 
      React.createElement('g', { key: 节点.id },
        React.createElement('foreignObject', {
          x: 节点.x,
          y: 节点.y,
          width: 120,
          height: 60
        },
          React.createElement('div', {
            style: {
              width: '100%',
              height: '100%',
              backgroundColor: 'blue', // 需要根据节点类型设置
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              cursor: 'move'
            }
          }, 节点.文本)
        )
      )
    )
  )
}

export default FlowCanvas
```

- [ ] **步骤 3：测试验证**

创建流程图，验证节点和连接线是否正常显示

- [ ] **步骤 4：Commit**

```bash
git add renderer/src/components/FlowChart/
git commit -m "feat: 添加流程图功能"
```

---

## 任务 10：设置功能

**文件：**
- 创建：`renderer/src/pages/SettingsPage.tsx`
- 创建：`renderer/src/components/Settings/AboutDialog.tsx`
- 创建：`renderer/src/components/Settings/DefaultAppSetter.tsx`
- 修改：`renderer/src/routes.tsx`（添加设置页面路由）
- 修改：`main/main.js`（注册默认应用）

- [ ] **步骤 1：创建关于对话框 `AboutDialog.tsx`**

```tsx
import React from 'react'
import { Modal, Descriptions, Button } from 'antd'

const AboutDialog = ({ 打开状态, 关闭回调 }: {
  打开状态: boolean
  关闭回调: () => void
}) => {
  return React.createElement(Modal, {
    title: '关于海豹办公',
    open: 打开状态,
    onCancel: 关闭回调,
    onOk: 关闭回调,
    footer: [
      React.createElement(Button, { key: 'close', onClick: 关闭回调 }, '关闭')
    ]
  },
    React.createElement('div', { style: { textAlign: 'center', padding: '20px 0' } },
      React.createElement('h2', null, '海豹办公 Seal Office v1.0.0'),
      React.createElement('p', null, '一款免费的开源办公软件'),
      React.createElement('br', null),
      React.createElement(Descriptions, { 
        bordered: true, 
        column: 1,
        size: 'small'
      },
        React.createElement(Descriptions.Item, { label: '作者' }, '饮风一笑'),
        React.createElement(Descriptions.Item, { label: '邮箱' }, '24519660@qq.com'),
        React.createElement(Descriptions.Item, { label: '说明' }, '本程序永久免费开源'),
        React.createElement(Descriptions.Item, { label: '开源地址' }, 
          React.createElement('a', { href: 'https://github.com/seal-office/seal-office', target: '_blank' }, 
            'https://github.com/seal-office/seal-office'
          )
        ),
        React.createElement(Descriptions.Item, { label: '专业服务' }, 
          '专业AI开发定制小程序APP'
        )
      )
    )
  )
}

export default AboutDialog
```

- [ ] **步骤 2：创建默认应用设置组件 `DefaultAppSetter.tsx`**

```tsx
import React, { useState } from 'react'
import { Button, message, Alert } from 'antd'

const DefaultAppSetter = () => {
  const [设置中, set设置中] = useState(false)

  const 设置为默认 = async () => {
    set设置中(true)
    try {
      // 调用Electron API注册文件关联
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const 结果 = await (window as any).electronAPI.setDefaultApp()
        if (结果.成功) {
          message.success('已成功设为默认办公软件')
        } else {
          message.error(`设置失败：${结果.错误}`)
        }
      } else {
        message.warning('当前环境不支持设置默认应用，请使用打包后的版本')
      }
    } catch (error) {
      message.error('设置默认应用时发生错误')
    } finally {
      set设置中(false)
    }
  }

  return React.createElement('div', null,
    React.createElement(Alert, {
      message: '设为默认办公软件',
      description: '设为默认软件后，.docx、.xlsx、.pptx等文件将默认使用海豹办公打开。',
      type: 'info',
      showIcon: true,
      style: { marginBottom: '16px' }
    }),
    React.createElement(Button, {
      type: 'primary',
      onClick: 设置为默认,
      loading: 设置中
    }, '设为默认办公软件')
  )
}

export default DefaultAppSetter
```

- [ ] **步骤 3：创建设置页面 `SettingsPage.tsx`**

```tsx
import React, { useState } from 'react'
import { useSettings } from '../store/settingsStore'
import AboutDialog from '../components/Settings/AboutDialog'
import DefaultAppSetter from '../components/Settings/DefaultAppSetter'
import { Tabs, Card, Switch } from 'antd'

const SettingsPage = () => {
  const { 主题, 切换主题 } = useSettings()
  const [关于打开, set关于打开] = useState(false)

  const 标签项 = [
    {
      key: 'general',
      label: '常规设置',
      children: React.createElement(Card, null,
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '16px 0' } },
          React.createElement('span', null, '深浅模式'),
          React.createElement(Switch, {
            checked: 主题 === '深色',
            onChange: 切换主题
          })
        )
      )
    },
    {
      key: 'system',
      label: '系统设置',
      children: React.createElement(DefaultAppSetter, null)
    },
    {
      key: 'about',
      label: '关于',
      children: React.createElement('div', { style: { textAlign: 'center', padding: '40px' } },
        React.createElement('h2', null, '海豹办公 Seal Office'),
        React.createElement('p', null, '版本 1.0.0'),
        React.createElement('br', null),
        React.createElement('button', {
          onClick: () => set关于打开(true),
          className: 'ant-btn ant-btn-primary'
        }, '查看详情')
      )
    }
  ]

  return React.createElement('div', { className: 'settings-page' },
    React.createElement('h1', null, '设置'),
    React.createElement(Tabs, { tabs: 标签项, type: 'card' })
  )
}

export default SettingsPage
```

- [ ] **步骤 4：测试验证**

打开设置页面，验证各功能是否正常

- [ ] **步骤 5：Commit**

```bash
git add renderer/src/pages/SettingsPage.tsx renderer/src/components/Settings/
git commit -m "feat: 添加设置功能，包括深浅模式、默认应用设置、关于页面"
```

---

## 任务 11：模板库功能

**文件：**
- 创建：`renderer/src/components/Templates/TemplateLibrary.tsx`
- 创建：`renderer/src/data/templates.ts`
- 修改：`renderer/src/routes.tsx`（添加模板页面路由）

- [ ] **步骤 1：创建模板数据 `templates.ts`**

```typescript
export interface 模板项 {
  id: string
  名称: string
  分类: 'word' | 'table' | 'ppt' | 'pdf'
  描述: string
  内容: string // HTML内容或模板配置
  缩略图?: string
}

export const WORD_TEMPLATES: 模板项[] = [
  {
    id: 'word-resume-001',
    名称: '个人简历',
    分类: 'word',
    描述: '简洁专业的个人简历模板',
    内容: '<div style="text-align:center;padding:40px"><h1>个人简历</h1><p>姓名：___  电话：___  邮箱：___</p></div>'
  },
  {
    id: 'word-contract-001',
    名称: '劳动合同',
    分类: 'word',
    描述: '标准劳动合同模板',
    内容: '<h2>劳动合同</h2><p>甲方：___</p><p>乙方：___</p><p>第一条 合同期限</p>'
  },
  {
    id: 'word-report-001',
    名称: '工作报告',
    分类: 'word',
    描述: '日常工作汇报模板',
    内容: '<h1>工作报告</h1><h2>一、工作概述</h2><p>...</p><h2>二、完成情况</h2><p>...</p>'
  }
]

export const TABLE_TEMPLATES: 模板项[] = [
  {
    id: 'table-finance-001',
    名称: '财务报表',
    分类: 'table',
    描述: '月度财务报表模板',
    内容: '<table><tr><th>项目</th><th>收入</th><th>支出</th><th>结余</th></tr></table>'
  },
  {
    id: 'table-inventory-001',
    名称: '库存管理',
    分类: 'table',
    描述: '库存进出记录模板',
    内容: '<table><tr><th>物品</th><th>数量</th><th>入库日期</th><th>出库日期</th></tr></table>'
  }
]

export const PPT_TEMPLATES: 模板项[] = [
  {
    id: 'ppt-business-001',
    名称: '商务演示',
    分类: 'ppt',
    描述: '商务会议演示模板',
    内容: '<div style="text-align:center;padding:80px"><h1>商务演示</h1><p>汇报人：___</p></div>'
  },
  {
    id: 'ppt-education-001',
    名称: '教育培训',
    分类: 'ppt',
    描述: '培训课件模板',
    内容: '<div style="text-align:center;padding:80px"><h1>培训课程</h1><p>讲师：___</p></div>'
  }
]

export const ALL_TEMPLATES: 模板项[] = [
  ...WORD_TEMPLATES,
  ...TABLE_TEMPLATES,
  ...PPT_TEMPLATES
]
```

- [ ] **步骤 2：创建模板库组件 `TemplateLibrary.tsx`**

```tsx
import React, { useState } from 'react'
import { ALL_TEMPLATES, type 模板项 } from '../data/templates'
import { Card, Tag, Button } from 'antd'

const TemplateLibrary = ({  onSelect }: {
  onSelect: (模板: 模板项) => void
}) => {
  const [当前分类, set当前分类] = useState<string>('all')

  const 分类映射: Record<string, string> = {
    'all': '全部',
    'word': 'Word',
    'table': 'Excel',
    'ppt': 'PPT',
    'pdf': 'PDF'
  }

  const 过滤模板 = 当前分类 === 'all' 
    ? ALL_TEMPLATES 
    : ALL_TEMPLATES.filter(项 => 项.分类 === 当前分类)

  return React.createElement('div', { className: 'template-library' },
    React.createElement('h2', null, '模板库'),
    
    React.createElement('div', { style: { marginBottom: '20px' } },
      Object.entries(分类映射).map(([键, 值]) =>
        React.createElement(Button, {
          key: 键,
          type: 当前分类 === 键 ? 'primary' : 'default',
          onClick: () => set当前分类(键)
        }, 值)
      )
    ),

    React.createElement('div', { 
      style: { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '16px'
      }
    },
      过滤模板.map((模板) =>
        React.createElement(Card, {
          key: 模板.id,
          hoverable: true,
          onClick: () => onSelect(模板),
          style: { cursor: 'pointer' }
        },
          React.createElement(Tag, { color: 模板.分类 === 'word' ? 'blue' : 模板.分类 === 'table' ? 'green' : 'orange' }, 
            分类映射[模板.分类]
          ),
          React.createElement('h3', null, 模板.名称),
          React.createElement('p', { style: { color: '#888' } }, 模板.描述),
          React.createElement(Button, null, '使用模板')
        )
      )
    )
  )
}

export default TemplateLibrary
```

- [ ] **步骤 3：测试验证**

打开模板库，验证是否能正确显示和筛选模板

- [ ] **步骤 4：Commit**

```bash
git add renderer/src/components/Templates/ renderer/src/data/templates.ts
git commit -m "feat: 添加模板库功能，包含Word/Excel/PPT模板"
```

---

## 任务 12：完善左侧菜单其他项

**文件：**
- 修改：`renderer/src/navConfig.ts`
- 修改：`renderer/src/store.ts`
- 修改：`renderer/src/components/Sidebar.tsx`

- [ ] **步骤 1：更新 navConfig.ts，完善菜单项**

```typescript
export const NAV_GROUPS: NavItem[][] = [
  [
    { key: 'home', label: '首页', icon: 'home', implemented: true },
    { key: 'recent', label: '最近', icon: 'clock', implemented: true },
    { key: 'star', label: '星标', icon: 'star', implemented: true },
    { key: 'shared', label: '共享', icon: 'share', implemented: true },
  ],
  [
    { key: 'cloud', label: '我的云文档', icon: 'cloud', implemented: false },
    { key: 'team', label: '团队文档', icon: 'users', implemented: false },
  ],
  [
    { key: 'pdf', label: 'PDF 工具', icon: 'pdf', implemented: true },
    { key: 'mindmap', label: '脑图', icon: 'mindmap', implemented: true },
    { key: 'flow', label: '流程图', icon: 'flow', implemented: true },
  ],
  [
    { key: 'settings', label: '设置', icon: 'settings', implemented: true },
    { key: 'help', label: '帮助手册', icon: 'help', implemented: true },
  ],
]
```

- [ ] **步骤 2：完善 store.ts 中的 handleNav 逻辑**

确保未实现的菜单项给出友好提示

- [ ] **步骤 3：测试验证**

点击左侧菜单各项，验证导航是否正确

- [ ] **步骤 4：Commit**

```bash
git add renderer/src/navConfig.ts renderer/src/store.ts renderer/src/components/Sidebar.tsx
git commit -m "perf: 完善左侧菜单导航功能"
```

---

## 任务 13：Bug修复与优化

**文件：**
- 全局检查和修复

- [ ] **步骤 1：类型检查**

运行：`cd E:\seal-office && npm run typecheck`

修复所有类型错误

- [ ] **步骤 2：功能测试**

逐一测试以下功能：
- 文档新建、打开、保存
- 文字编辑、格式设置
- 表格插入、编辑
- 图表插入
- 查找替换
- 撤销重做
- 视图切换
- 导出功能

- [ ] **步骤 3：性能优化**

检查大文档加载性能，优化渲染逻辑

- [ ] **步骤 4：Commit**

```bash
git add -A
git commit -m "fix: 全面修复Bug，优化性能"
```

---

## 任务 14：文档更新和打包发布

**文件：**
- 修改：`README.md`
- 修改：`功能修改说明.md`
- 执行打包命令

- [ ] **步骤 1：更新 README.md**

```markdown
# 海豹办公 Seal Office

一款免费开源的跨平台办公软件。

## 功能特性

- 文字文档编辑（.docx）
- 电子表格编辑（.xlsx）
- 演示文稿编辑（.pptx）
- PDF导出
- 模板库
- 深浅模式切换
- 帮助手册

## 安装使用

...

## 开源地址

https://github.com/seal-office/seal-office

## 联系方式

- 作者：饮风一笑
- 邮箱：24519660@qq.com
- 专业服务：专业AI开发定制小程序APP
```

- [ ] **步骤 2：更新功能修改说明**

创建 `功能修改说明-v1.1.0.md`，记录所有更新内容

- [ ] **步骤 3：打包应用**

运行：`cd E:\seal-office && npm run dist`

预期：成功生成安装包

- [ ] **步骤 4：推送到仓库**

```bash
git add -A
git commit -m "release: 海豹办公 v1.1.0 功能升级"
git push
```

- [ ] **步骤 5：测试验证**

安装打包后的应用，验证所有功能正常

---

## 总结

本计划涵盖14个主要任务，包含：
- 编辑器核心修复
- 文件操作功能
- PDF导出
- UI优化
- 表格增强
- 主题切换
- 图表和流程图
- 设置功能
- 模板库
- Bug修复和打包

每个任务都有详细的步骤和验证方法，确保功能正确实现。
