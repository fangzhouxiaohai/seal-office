# 海豹办公 v1.2.0 设计方案

日期：2026-09-24
版本：1.1.0 到 1.2.0
作者：饮风一笑

## 一、目标

修复现有严重缺陷，补齐未完成功能，交付绿色免安装版与安装包并推送仓库。

核心修复目标：

1. 选中文字改变颜色失效（用户反馈的首要问题）
2. 主进程 IPC 使用了不存在的 Electron API，导致 PDF 导出完全不可用
3. Office 格式文件的打开与保存实际写入的是 HTML，Word 无法打开
4. 保存功能每次弹出对话框，与另存为行为无差别

## 二、缺陷清单

### 严重缺陷

| 编号 | 位置 | 问题 | 后果 |
| --- | --- | --- | --- |
| 1 | main/ipcHandle.js:22,29,52 | 使用 `event.sender.ownerWindow`，该属性在 Electron WebContents 上不存在，取值恒为 undefined | PDF 导出因 `if (!win)` 直接失败；文件对话框失去父窗口 |
| 2 | main/pdfExport.js:45,46 | `printToPDF` 传入中文参数名 `默认页边距`、`打印背景` | Electron 只认 `margins`、`printBackground`，页边距与背景设置被静默忽略 |
| 3 | main/fileOps.js:39 | `showOpenDialog` 使用 `properties` 键名，且 `multiSelections` 与上层只取首个文件的逻辑矛盾 | 多选能力形同虚设 |
| 4 | RibbonButton.tsx + DocEditor.tsx:192 | 下拉菜单浮层抢焦点导致选区折叠，`执行格式化` 内的无条件 `focus()` 又将光标重置到起始位置 | 拖选文字后改颜色无效，选中态丢失，需后续输入才生效 |
| 5 | commands.ts:656 | `file.save` 未记录已保存路径，每次都弹出对话框 | 保存与另存为行为完全相同 |
| 6 | main/fileOps.js:54 | `saveToFile` 将编辑区 HTML 直接写入 .docx/.xlsx/.pptx | 生成的文件 Office 无法打开 |
| 7 | main/fileOps.js:71 | `readFile` 一律以 utf-8 读取，docx/xlsx/pptx 为 ZIP 二进制 | 读出乱码并灌入编辑区 |

### 界面问题

| 编号 | 位置 | 问题 |
| --- | --- | --- |
| 8 | AboutDialog.tsx:63、SettingsPage.tsx:116 | 关于界面使用 SVG 卡通组件与「海」字方块占位，未使用主窗口真实图标 |
| 9 | TitleBar.tsx:113 | 右上角演示用户头像圆圈需删除 |
| 10 | SettingsPage.tsx | 内联样式散落，硬编码颜色不走 CSS 变量，深色模式下失效；手写 `className="ant-btn"` 而非组件 |
| 11 | tabSpecs.ts:381 | 打开、保存、另存为、导出整组挂在视图标签下，不符合使用习惯 |
| 12 | App.tsx:73,74 | `onSetting`、`onHelp` 为永不触发的死代码 |
| 13 | HomePage.tsx:41,54,110、navConfig.ts:57 | PDF 入口全部为「开发中」提示 |
| 14 | Sidebar.tsx:17 | 编辑器模式下六个禁用死项，与 Ribbon 标签重复 |
| 15 | commands.ts、sheetCommands.ts、pptCommands.ts | 共 29 项命令为「开发中」提示 |

## 三、架构设计

主进程当前职责混杂，渲染层直接裸调 `(window as any).electronAPI`，缺乏类型约束。本次新增的格式转换与 PDF 操作属于重逻辑，需要清晰边界。

```
main/
├── main.js                    窗口与生命周期
├── ipc/                       IPC 按域拆分
│   ├── index.js               注册入口
│   ├── fileChannel.js         文件对话框、读写
│   ├── officeChannel.js       docx/xlsx/pptx 编解码
│   ├── pdfChannel.js          PDF 工具与导出
│   └── systemChannel.js       默认应用、应用信息
├── office/                    格式转换引擎
│   ├── docxWriter.js          HTML 转 docx
│   ├── docxReader.js          docx 转 HTML
│   ├── xlsxCodec.js           xlsx 双向
│   ├── pptxCodec.js           pptx 双向
│   └── lossReport.js          未保留元素统计与中文说明
└── pdf/
    ├── pdfTools.js            页面提取、合并、删除、旋转、转图片
    └── pdfPrint.js            printToPDF 导出

renderer/src/
├── ipc/bridge.ts              类型安全的 IPC 门面
├── pdf/                       PDF 工具模块
│   ├── PdfWorkbench.tsx
│   ├── PdfViewer.tsx
│   └── pdfCommands.ts
└── editor/
    ├── selection.ts           选区保存与恢复
    ├── docPath.ts             文档路径状态
    ├── NavigationPane.tsx     导航窗格
    ├── translate.ts           翻译服务调用层
    └── mailMerge.ts           邮件合并
```

关键决策：渲染层不再出现 `(window as any).electronAPI`，全部经 `renderer/src/ipc/bridge.ts` 并带完整 TypeScript 类型。缺陷 1 之所以长期隐藏，正是因为缺少类型约束。

## 四、选区修复方案

当前失效链路：

```
点击下拉菜单项 -> 浮层抢焦点 -> 选区折叠
-> 执行格式化 内 元素.focus() -> 光标跳回起始位置
-> foreColor 仅对光标生效 -> 后续输入才变色
```

新增 `editor/selection.ts`：

```typescript
保存选区(根: HTMLElement): Range | null
恢复选区(根: HTMLElement, 快照: Range | null): boolean
```

接入点两处，缺一不可：

1. `RibbonButton` 的 Dropdown 加 `onOpenChange`，在浮层打开瞬间保存选区快照。必须在此时机，等到菜单项 click 时选区已丢失。
2. `执行格式化` 将无条件 `focus()` 改为先 focus、再恢复快照、选区非空才执行命令。

收益范围超出颜色本身：加粗、斜体、字体、字号、突出显示、行距等所有依赖选区的下拉命令共用同一病根，一并修复。

## 五、Office 格式读写

采用分层实现，核心原则是损失透明，不静默丢失内容。

支持的映射范围：

| HTML | docx | 完整度 |
| --- | --- | --- |
| h1 到 h6 | Heading 1-6 | 完整 |
| b、i、u、s | Bold、Italic、Underline、Strike | 完整 |
| color、background | Color、Highlight | 完整 |
| text-align | Alignment | 完整 |
| table | Table 含边框与合并 | 完整 |
| ul、ol | Numbering 含嵌套 | 完整 |
| img | ImageRun | base64 转 Buffer |
| 水印、艺术字、分栏 | 不写入 | 明确报告 |

保存 .docx 时由 `lossReport.js` 扫描 HTML，统计无法写入的元素，成功后提示：

```
已保存到 D:\文档\报告.docx
以下 2 类元素未能写入 Word 格式：水印（1 处）、艺术字（3 处）。
如需保留全部版式，请另存为 HTML 格式。
```

读取方向新增 `mammoth` 依赖处理 docx 转 HTML，xlsx 使用已有 `exceljs`，pptx 使用 `JSZip` 解析 XML 提取文本框与版式。

`readFile` 按扩展名分派：二进制格式不带编码读取，文本格式走 utf-8。

## 六、保存路径记忆

新增 `docPath.ts`，在 store 中为每个文档维护 `已保存路径: string | null`。

- 保存：有路径直接写入不弹框，无路径弹框并记住
- 另存为：始终弹框，成功后更新路径
- Ctrl+S 绑定保存

同时在文档标签与状态栏显示已修改标记，未保存时关闭文档需二次确认，补齐当前缺失的数据安全保护。

## 七、界面修复

关于界面图标：`build/icon.png` 为 512x512 PNG，复制到 `renderer/src/assets/logo.png` 由 Vite 打包，`AboutDialog` 与设置页关于页签统一引用。

右上角圆圈：删除 `TitleBar.tsx` 的 `wps-avatar` 节点、`styles.css:173-185` 样式、`TitleBar.test.tsx:20` 断言，移除无用的 `userName` 属性。

设置界面重排：

- 新建 `settings.css`，全部颜色走 CSS 变量以适配深色模式
- 左侧竖向标签导航替代顶部横向 Tabs，便于后续扩展
- 统一设置行组件：标题加描述加右侧控件，消除重复的 flex 内联样式
- 手写 `className="ant-btn"` 替换为 antd Button 组件

文件菜单迁移：将文件组与导出组从视图标签迁到开始标签最前，顺序为 打开保存另存为、剪贴板、字体、段落。

左侧菜单：删除编辑器模式下与 Ribbon 重复的六个禁用项，改为文档结构导航（大纲树），点击跳转对应标题。

清理 `App.tsx:73,74` 死代码。

## 八、29 项命令实现

编辑器 3 项：

- 导航窗格：大纲树，复用已有 `toc.ts` 的 `提取大纲`
- 邮件合并：CSV 或 XLSX 数据源，`«域»` 占位符，批量生成，完全离线
- 翻译：机器翻译需联网服务与密钥，项目不具备。实现完整面板与调用链路，服务地址与密钥由设置页填写，未配置时给出明确中文指引而非伪造翻译结果

表格 13 项：数据透视表、图表、图片、财务函数、逻辑函数、查找与引用、筛选、分列、数据验证、批注、保护工作表、冻结窗格、拆分。函数类扩展已有 `formula.ts`，冻结与拆分为视图层 CSS sticky 实现。

演示 14 项：淡入淡出、推进、出现、淡出、从头开始、从当前开始、拼写检查、新建批注、图表、图片、表格、音频与视频、幻灯片浏览、备注页。放映模式使用全屏容器加键盘翻页。

## 九、测试与验证

当前 510 个测试全部通过，必须保持全绿。新增测试：

- `selection.test.ts`：选区保存恢复，含颜色修复的回归测试
- `docxWriter.test.ts`：HTML 转 docx 各类映射与损失报告
- `docPath.test.ts`：保存路径记忆的三种分支
- `pdfTools.test.ts`：页面提取、合并、删除、旋转
- 各新增命令的命令表测试

主进程 IPC 修复无法由 jsdom 覆盖，通过实机启动手工验证：打开 docx、改颜色、保存、导出 PDF 全链路。这是缺陷 1 与 2 唯一可靠的验证方式。

## 十、交付流程

1. `npm run test:run` 全绿
2. `npm run typecheck` 无错
3. `npm run build` 构建成功
4. 实机启动验证核心链路
5. `npm run pack` 输出绿色免安装版到 `release/win-unpacked/`
6. `npm run dist` 输出安装包到 `release/`
7. 版本号升至 1.2.0，编写 `功能修改说明-v1.2.0.md`，更新 README
8. 提交并推送到 origin

## 十一、实现顺序

分阶段实现，每阶段验证通过再继续，不一次性堆完再调试。

1. 阶段一：主进程 IPC 缺陷修复（缺陷 1、2、3）与选区修复（缺陷 4）
2. 阶段二：Office 格式读写（缺陷 6、7）与保存路径记忆（缺陷 5）
3. 阶段三：界面修复（问题 8 至 14）
4. 阶段四：PDF 工具模块
5. 阶段五：29 项命令实现
6. 阶段六：构建、打包、文档、推送
