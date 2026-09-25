# 更新日志 v1.2.1

## 日期
2025年

## 新增功能

### 帮助手册界面布局重构

将帮助手册从 Tab 切换和折叠面板布局重构为瀑布流文章样式。

#### 具体改动

1. **布局方式变更**
   - 移除原有的 Tab 标签页切换和折叠面板交互
   - 改为从上到下瀑布流排列：标题 + 正文 + 配图
   - 用户可连续滚动查看全部内容

2. **内容结构优化**
   - 每篇文章卡片包含：标签、标题、配图、正文段落
   - 配图使用渐变色 SVG 占位图，带有品牌标识
   - 正文采用多段落排版，行距宽松易读

3. **交互改进**
   - 保留搜索功能，可搜索标题和正文内容
   - 文章卡片支持鼠标悬停上浮和阴影加深效果
   - 全页面模式下标题字号更大，间距更宽松

4. **适配优化**
   - 全页面模式：填满主内容区高度，无内部滚动条，内容自然滚动
   - 弹窗模式：保持原有高度限制，内部滚动
   - 深色模式完整适配，所有元素均有对应主题颜色

## 缺陷修复

### 保存文档支持真实 Word/Excel/PPT 格式

**问题现象**：保存 `.docx` 或 `.xlsx` 文件时，应用自动将扩展名改为 `.html`，导致无法生成真实 Office 格式文件。

**根因分析**：之前采用扩展名修正策略，将 HTML 内容以 `.html` 扩展名保存来避免 Base64 乱码。但这无法支持用户要求的常规 Office 格式。

**修复方案**：
1. 新增 `htmlToDocxModel` 函数：将编辑器 HTML 内容解析为 docx 文档模型（段落、标题级别、加粗/斜体/下划线等格式）
2. 新增 `htmlToXlsxModel` 函数：提取 HTML 表格为 xlsx 工作表模型，无表格时按行分割文本
3. 新增 `htmlToPptxModel` 函数：提取 HTML 标题和段落为 pptx 幻灯片模型
4. 修改保存命令：当扩展名为 `.docx`/`.xlsx`/`.pptx` 时，转换 HTML 为对应模型，通过 IPC 调用 `office.writeDocx/Xlsx/Pptx` 生成二进制文件后写入磁盘
5. 其他格式（txt/html等）仍保持文本保存

### 右键菜单位置偏移问题

**问题现象**：右键点击编辑区时，弹出的右键菜单位置离光标过远，出现在屏幕右侧。

**根因分析**：右键菜单位置计算逻辑未区分光标在视口左右两侧的情况。当点击位置距右侧不足菜单宽度时，菜单位置被约束到视口右边缘，导致与光标相距甚远。

**修复方案**：重新设计定位算法。当光标距右侧不足菜单宽度加 16px 缓冲时，菜单改显示在光标左下方；否则正常显示在右下方。

### 保存文档后打开显示 Base64 乱码

**问题现象**：在 Word 界面编辑并保存文档（选择 .docx 格式），重新打开后文档内容显示为一串 Base64 编码字符串而非正常中文。

**根因分析**：
1. 保存命令将编辑器 `innerHTML`（HTML 文本）直接写入文件，未做格式转换。
2. 当用户选择 `.docx` 扩展名保存时，文件实际内容为 HTML 文本。
3. 重新打开时，`readFile` 将 `.docx` 文件以 Base64 读取，调用 `readDocx`（mammoth 库）解析失败，返回错误对象。
4. 错误处理中 `createDoc` 接收了错误对象，导致编辑器显示 Base64 编码的错误信息。

**修复方案**：
1. 在保存命令中自动修正扩展名：当用户选择 `.docx`/`.xlsx`/`.pptx` 保存 HTML 内容时，自动将扩展名改为 `.html`，确保文件以文本格式保存和读取。
2. 在首页打开文件时，归一化扩展名（去除前导点号），修正了 `.docx` 扩展名比较失败的问题（原代码比较 `'docx'`，但 `path.extname` 返回 `.docx`）。
3. 修复 `readDocx` 返回值解析：mammoth 返回 `{ html: '...', 警告: [...] }`，直接使用 `数据.html` 作为编辑器内容，而非 `JSON.stringify(数据.内容)`。

### 首页打开文件提示不支持文件类型

**问题现象**：在首页点击"打开文件"，选择 `.docx` 文件后提示"暂不支持此文件格式"。

**根因分析**：`fileChannel.js` 返回的 `扩展名` 带有点号（`.docx`），`HomePage.tsx` 中比较时不带点号（`'docx'`），条件 `扩展名 === 'docx'` 永远为 `false`，导致代码跳过 Office API 分支，最终走到"暂不支持此文件格式"提示。

**修复方案**：
1. 在 `HomePage.tsx` 中归一化扩展名：`(扩展名 ?? '').replace(/^\./, '').toLowerCase()`。
2. 移除"二进制文件暂不支持在首页打开"提示，因为 `.docx`/`.xlsx`/`.pptx` 已通过 Office API 处理。
3. 简化 Office API 返回值解析逻辑，直接读取 `数据.html`。

## 技术细节

### 修改文件
- `renderer/src/components/HelpManual.tsx` - 组件完全重写
- `renderer/src/styles.css` - 新增 `.wps-main--help` 样式类及深色模式覆盖
- `renderer/src/App.tsx` - 移除未使用的变量，修复 TS 警告
- `renderer/src/components/ContextMenu.tsx` - 改用 position:absolute+transform 定位，新增点击关闭
- `renderer/src/editor/commands.ts` - 新增 htmlToDocxModel/htmlToXlsxModel/htmlToPptxModel 转换器，保存命令支持真实 Office 格式
- `renderer/src/editor/DocEditor.tsx` - 右键菜单增加 `__close__` 命令处理
- `renderer/src/sheet/SheetEditor.tsx` - 右键菜单增加 `__close__` 命令处理
- `renderer/src/ppt/PptEditor.tsx` - 右键菜单增加 `__close__` 命令处理
- `renderer/src/pages/HomePage.tsx` - 归一化扩展名比较，修复 Office API 返回值解析

### 构建状态
- 前端构建：成功
- TypeScript 类型检查：帮助手册和 App.tsx 无新增错误
- 打包产物：SealOffice 1.2.0.exe (便携版)、SealOffice Setup 1.2.0.exe (NSIS 安装版)
