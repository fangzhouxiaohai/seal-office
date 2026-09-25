# 右键菜单功能 - 演示文稿编辑器集成

## 概述

本次修改为演示文稿编辑器（PPT）添加了类似 WPS 的右键菜单功能，使三个编辑器模块（文档、表格、演示）全部支持右键菜单交互。

## 修改文件

### 1. renderer/src/ppt/SlideCanvas.tsx

**变更内容：**
- Props 接口新增 `onContextMenu?: (x: number, y: number) => void`
- 在画布 div 上绑定 `onContextMenu` 事件处理器
- 事件触发时调用回调函数并阻止浏览器默认右键菜单

**关键代码：**
```tsx
onContextMenu: (事件) => {
  if (onContextMenu) {
    事件.preventDefault()
    onContextMenu(事件.clientX, 事件.clientY)
  }
}
```

### 2. renderer/src/ppt/PptEditor.tsx

**变更内容：**
- 导入 `ContextMenu` 组件和 `菜单节点` 类型
- 新增 `菜单可见`、`菜单坐标` 状态管理
- 新增 `关闭菜单()` 函数
- 新增 `构建演示菜单()` 函数，返回演示文稿右键菜单项
- 在 `执行命令()` 函数中新增命令处理：
  - `edit.undo` / `edit.redo`：调用撤销/重做函数
  - `edit.cut` / `edit.copy` / `edit.paste`：显示待接入提示
- 在 `SlideCanvas` 调用处添加 `onContextMenu` 回调
- 渲染 `ContextMenu` 组件，绑定菜单项命令处理

## 右键菜单结构

```
┌─────────────────────────┐
│ 新建幻灯片               │
│ 复制幻灯片               │
│ 删除幻灯片               │
├─────────────────────────┤
│ 上移                    │
│ 下移                    │
├─────────────────────────┤
│ 剪切                    │
│ 复制                    │
│ 粘贴                    │
├─────────────────────────┤
│ 版式                    │
│ 设置背景                │
│ 显示/隐藏网格线          │
├─────────────────────────┤
│ 撤销                    │
│ 重做                    │
└─────────────────────────┘
```

## 菜单功能说明

| 菜单项 | commandId | 功能说明 | 状态 |
|--------|-----------|----------|------|
| 新建幻灯片 | slide.new | 插入新幻灯片 | 已接入 |
| 复制幻灯片 | slide.duplicate | 复制当前幻灯片 | 待实现 |
| 删除幻灯片 | slide.delete | 删除当前幻灯片 | 待实现 |
| 上移 | slide.moveUp | 上移幻灯片位置 | 待实现 |
| 下移 | slide.moveDown | 下移幻灯片位置 | 待实现 |
| 版式 | slide.layout | 切换幻灯片版式 | 待实现 |
| 设置背景 | slide.background | 设置幻灯片背景色 | 待实现 |
| 剪切/复制/粘贴 | edit.cut/copy/paste | 文本编辑操作 | 待接入 |
| 显示/隐藏网格线 | view.gridlines | 切换网格线显示 | 已接入 |
| 撤销 | edit.undo | 撤销上一步操作 | 已接入 |
| 重做 | edit.redo | 重做上一步操作 | 已接入 |

## 技术要点

1. **组件复用**：使用已有的 `ContextMenu` 组件（`renderer/src/components/ContextMenu.tsx`）
2. **数据格式**：遵循 `菜单节点` 类型定义，支持 `item`、`group`、`divider` 三种节点
3. **命名规范**：所有变量、函数名使用中文
4. **语法规范**：使用 React.createElement 而非 JSX
5. **事件处理**：通过 preventDefault 阻止浏览器默认右键菜单

## 后续工作

- [ ] 完善待实现的菜单命令（复制幻灯片、删除幻灯片、上移/下移、版式、背景设置）
- [ ] 接入剪切、复制、粘贴功能
- [ ] 执行类型检查和构建验证（PowerShell 执行器故障，需手动执行）
