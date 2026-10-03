# 审查报告：WPS 标准复刻全面检查（v1.5.0 基线）

> 审查日期：2026-09-29
> 审查方式：五个并行深度审查（全局壳+首页、文字、表格、演示+PDF、主进程+打包），全部关键缺陷经人工逐条验证后修复或记录。
> 基线状态：typecheck 0 错误；渲染层 639 项 + 主进程 71 项测试通过。

---

## 一、总体结论

| 模块 | 复刻完整度 | 最高风险 |
|---|---|---|
| 全局壳 + 首页 + 设置 | 约 52% → **约 65%** | 全局快捷键体系整体缺失；全局搜索为摆设 |
| 文字（Writer） | 约 55% → **约 62%** | 快捷键 0 实现；页面布局设置不渲染；修订不跟踪键盘输入 |
| 表格（ET） | 约 45% → **约 55%** | 颜色下拉选蓝得红；拖拽框选缺失；函数库仅 10 个 |
| 演示（WPP） | 约 45% → **约 58%** | 放映模式整体缺失；保存丢真；首页打开 pptx 失效 |
| PDF | 约 20%（未变） | 阅读器本体不存在，无打开 PDF 入口 |
| 主进程 + 打包 | 约 65% | 关闭无未保存提示；崩溃恢复缺失；非原子写 |

括号内为本次修复后的提升。安全基线（contextIsolation + sandbox + 受限 preload）与 IPC 契约对齐是项目亮点；主进程 71 项测试真实有效。

---

## 二、本次已修复（全部有测试锁定）

1. **表格颜色/填充下拉参数被忽略（选蓝得红）** — `sheetCommands.ts` 的 `设置格式命令` 原先不接受下拉参数，任何颜色选择都落固定默认色。现增加 `参数字段` 覆盖机制（`renderer/src/sheet/sheetCommands.ts:104`），新增 3 项参数化测试。
2. **表格反向扩展选区高亮消失** — `GridView.tsx` 的 `在选区内` 假定起点≤终点，Shift+点击向上/向左扩展时视觉上无选中。已改为按包围盒判定（`renderer/src/sheet/GridView.tsx:36`），新增 2 项反向选区渲染测试。
3. **保存 `.pdf` 产出损坏文件并覆盖原文件** — 保存对话框提供 PDF 过滤器，但 `commands.ts` 的保存分发对 `.pdf` 落入文本分支，把 HTML 文本按 .pdf 扩展名写盘。新增主进程 `exportToPdfToPath`（`main/pdfExport.js`）、IPC 通道 `pdf.exportToPath`（`main/ipc/pdfChannel.js`）、桥接 `桥接.pdf.exportToPath`，`file.save`/`file.saveAs` 的 `.pdf` 分支改走真实 printToPDF 导出（`renderer/src/editor/commands.ts`）。测试断言「不允许把 HTML 文本写进 .pdf」。
4. **版本号三处不一致（1.2.0 / v1.0.0 / 1.5.0）** — 通过 vite `define` 注入 `__APP_VERSION__`（取自 package.json），设置页/关于页/页脚统一读取（`vite.config.js`、`SettingsPage.tsx`、`AboutDialog.tsx`、`Footer.tsx`）。
5. **main.js 窗口层** — F12 DevTools 改为仅开发态（打包态 F12 留给 WPS 惯例的另存为/扩展），新增 Ctrl+Shift+I 开发态快捷键；新增单实例锁 + 二次启动唤起窗口；新增最小窗口尺寸 960×600（`main/main.js`）。
6. **文字编辑器快捷键层（原先 0 实现）** — DocEditor 挂全局 keydown：Ctrl+B/I/U/Z/Y/A/F/H/S/E/L/R/J、Ctrl+Enter 分页符、Ctrl+Home/End 滚动；输入框内仅放行 Ctrl+S。右键菜单与帮助手册标注的快捷键现在真实生效（`renderer/src/editor/DocEditor.tsx`）。
7. **表格快捷键补齐** — Ctrl+S 保存、Ctrl+X 剪切（复制+清空选区）、Ctrl+F 查找栏（新增行优先循环查找、Enter 定位、Esc 关闭）、Shift+方向键扩展选区、Ctrl+方向键跳数据区边缘（与 Excel/WPS 语义一致）、Ctrl+Home 回 A1（`renderer/src/sheet/SheetEditor.tsx`）。新增 5 项键盘测试 + 查找栏测试。
8. **PPT 全屏放映模式（原先完全没有）** — 新增 `SlideshowView`（黑底全屏、等比缩放居中、文本框坐标复用画布规则、富文本片段渲染、页码指示器）；F5 从头放映、Shift+F5 从当前页、Esc 退出、方向键/空格/点击翻页、Home/End 跳转；Ribbon 放映组按钮 `slideshow.start/current` 从 stub 接通真实功能（`renderer/src/ppt/SlideshowView.tsx`、`PptEditor.tsx`）。新增 4 项组件测试。HelpManual「排练计时」虚假文案已改为与实现一致。
9. **页面布局设置接入渲染（原先全部 no-op）** — `EditorCanvas` 新增纸张/方向/边距/分栏/水印/页面边框/页面颜色 props：纸张尺寸映射（A4/A5/B5/Letter，横向互换宽高）、四档页边距、分栏 column-count、斜置水印层、边框三样式、页面背景色；DocEditor 传入视图状态（`renderer/src/editor/EditorCanvas.tsx`）。同时修复两个「写入 ViewState 不存在键」的假命令：`layout.lineNumbers`（改为明确中文提示）与 `layout.orientation`（ViewState 补上 `纸张方向` 字段，真实生效）。
10. **首页打开 docx/xlsx/pptx 内容注入全部静默失效** — `store.createDoc` 依赖的 `.wps-editor-content` 选择器在当前 DOM 中不存在，模板/打开文件的内容从未进入编辑器。重构为跨模块注入通道：word 内容随文档标签直接写入（`新建标签` 支持初始 HTML）；table 走 `表格待注入` 载荷 + 新增 `sheetImport.ts`（HTML 表格 → 工作表模型解析器，含公式重算与规模裁剪）；ppt 走 `演示待注入` 载荷，PptEditor 挂载时校验并应用（`renderer/src/store.ts`、`renderer/src/sheet/sheetImport.ts`、`PptEditor.tsx`、`SheetEditor.tsx`）。新增 3 项 store 注入测试 + 5 项导入解析测试。

**回归结果：typecheck 0 错误；渲染层 662 项 + 主进程 71 项 = 733 项测试全部通过；`npm run build` 成功且 `__APP_VERSION__` 注入产物验证通过。**

---

## 三、遗留问题清单（按优先级，均有 file:line 证据）

### P0（数据安全与核心链路，建议下个版本最高优先）
1. **关闭无未保存提示 + 自动保存/崩溃恢复完全缺失** — `store.ts:15`「内容保存在内存，本轮不落盘」；`main/main.js` 无 close 拦截；脏状态模块 `docPath.ts:8-19` 为死代码；`fileChannel.js:68` 非原子写。WPS 标准：备份中心 + 自动保存 + 三选对话框。
2. **PDF 阅读器本体不存在** — `PdfViewer.tsx` 为死代码（无引用）；首页打开 `.pdf` 提示不支持；缩放/翻页/目录/单双页全缺。需引入 pdf.js 并接入 PdfPage。
3. **最近文档为 mock、零持久化** — `mock/recentDocs.ts:2-36` 硬编码 12 条假数据；主进程无 recent 通道、无 userData 持久化、无「打开所在文件夹」（shell 未暴露）。

### P1（WPS 核心体验差距）
4. **修订不跟踪键盘输入** — `review.ts:3-5` 自述不拦截键盘；打开修订开关后直接打字不产生任何修订标记，无作者/时间戳/逐条接受拒绝。
5. **页眉/页脚/页码缺失** — `DocEditor.tsx:339-342` 提示开发中；页码状态栏恒为 1（`DocEditor.tsx:744`），总页数为估算；无分页引擎，分页符是纯装饰 div。
6. **PPT 保存丢真** — `PptEditor.tsx:215-218、251-254` 把整份文稿压平为纯文本再写 pptx，位置/字号/颜色/背景/版式全部丢失；`pptxCodec.js:122-131` 读入时塞进单个文本框。
7. **表格函数库仅 10 个** — `formula.ts:231-288` 缺 VLOOKUP/SUMIF/COUNTIF/LEFT/RIGHT/MID/LEN/TODAY/NOW/AND/OR/NOT/SQRT/POWER/CONCATENATE；无跨表引用、`$` 绝对引用、`&` 连接符。
8. **表格鼠标拖拽框选缺失** — 单元格仅 onClick（`GridView.tsx:155`）；填充柄、双击自适应列宽、行高拖拽 UI、sheet 重命名、边框系（12 种）全部缺失。
9. **字号精度失真** — `execCommand('fontSize')` 仅 7 档，`fontOptions.ts:86-94` 把精确磅值压入 7 档；「五号(10.5pt)」等中文字号落档错误。应改 span+style 渲染。
10. **视图模式只改文字** — 页面/阅读/Web/大纲/草稿五种模式仅状态栏文案变化（`DocEditor.tsx:697-704`），渲染无差异；导航窗格未接入（`toc.ts:18-33` 的大纲数据源现成）。

### P2（体验偏差与工程卫生）
11. PDF 工具缺拆分/压缩/转 Word/Excel（`pdfChannel.js` 仅四件套）；PDF 工具页无文档上下文。
12. 多文档标签未全局统一（仅 Word 有；表格/演示各自独立标签）；标签无右键菜单/类型图标/双击新建。
13. 全局搜索是摆设（`App.tsx:79-86` 未传 onSearch）；最近文档无时间分组、无右键。
14. xlsx 写入所有单元格强制 `String()`（`xlsxCodec.js:44`），数字变文本；sheet 名硬编码；仅首表读取。
15. lossReport 造假：`officeChannel.js:11` 硬编码 `次数:1` 未调用 `统计损失`；损失说明渲染层零消费。
16. 打包卫生：appId 为 `com.example.wpsoffice`（占位符+第三方商标）；asar 187MB（纯渲染层依赖应移 devDependencies）；无代码签名。
17. 死代码清理：`main/fileOps.js`、`main/ipcHandle.js`、`main/main-test.js`、`main/pdf/node_modules`（空目录）、`editor/table/` 三文件（未接入 Ribbon）、`ChartEditor.tsx`、`FlowChartEditor.tsx`、`AboutDialog.tsx`、`PdfViewer.tsx`。
18. CSV 打开当文本进文字编辑器（`commands.ts:673-680`），应分列入表格。
19. 状态栏细节：文字缩放无滑块；表格统计用显示值而非原始数值（`SheetEditor.tsx:321-326`）；PPT 状态栏无主题名。
20. 深色模式漏网：`TemplateLibrary.tsx:65-69`、`SettingsPage.tsx:44-67`、`HelpManual.tsx:303` 硬编码浅色。

### 测试缺口（供后续补强）
- 交互层：拖拽框选、填充柄、缩略图拖拽排序、放映全流程 E2E。
- IO 保真：xlsx 数字类型/sheet 名断言、docx 往返样张对比、pptx 保存-打开往返一致性。
- `table/`、`ChartEditor.tsx`、`PdfViewer.tsx` 等死代码零测试（接入或删除二选一）。

---

## 四、验证方式

```powershell
npm run typecheck   # 0 错误
npm run test:run    # 渲染层 662 + 主进程 71 = 733 项通过
npm run build       # 构建成功，版本注入验证通过
```
