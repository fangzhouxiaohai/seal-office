# v1.5.0 变更记录

本版本目标是完成剩余功能并修复全部潜在缺陷，使测试全量通过，最终产出 1.5.0 安装包。

## 本提交：修复潜在缺陷，测试全绿

### 类型错误修复（typecheck 归零）
- `renderer/src/components/ContextMenu.tsx`：移除未使用变量 `面板`（定位仅依赖 `菜单面板宽`）。
- `renderer/src/editor/commands.ts`：读取结果加内容兜底 `文件内容 = 结果.内容 ?? ''`，修复 TS2345 类型错误；清理粘贴与表格提取中未使用的 `行索引`（TS6133）。
- `renderer/src/ppt/PptEditor.tsx`：移除未使用的 `require('./deck')` 解构，避免 Vite ESM 环境下 require 的崩溃风险。
- `renderer/src/ppt/deck.ts`：未使用参数 `字号` 改名为 `_字号`，保留调用方签名，消除 TS6133。
- `renderer/src/sheet/sheetCommands.ts`：移除粘贴循环中未使用的 `索引`（TS6133）。
- `renderer/src/components/Icon.tsx`：新增 `open`、`save`、`save-as` 图标名及 SVG，补齐 Ribbon 图标声明，修复 Icon 缺失图标测试。

### 测试与真实契约对齐
- PDF 已实现：修正 `routes.test.tsx`、`NewDocGrid.test.tsx`、`HomePage.test.tsx` 中"开发中"的旧断言；PDF 工具现为已实现模块（`DOC_TYPE_TO_MODULE.pdf === 'pdf'`），禁用卡片计数改为 0。
- PPT 读取路径：`main/office/pptxCodec.test.js` 四个测试原断言旧契约 `{ 幻灯片, 警告 }`；而 v1.3.0 起真实返回契约为 `{ 演示文稿: { 幻灯片列表, 当前索引 }, 警告 }`（`renderer/src/pages/HomePage.tsx` 与 `renderer/src/ppt/PptEditor.tsx` 均按新契约取值）。将测试更新为新契约，并断言 `title`/`文本框列表` 的真实结构。
- `main/office/pptxCodec.js`：返回的 `演示文稿` 补齐 `id`、`name` 字段，使返回对象完全符合 `renderer/src/ppt/deck.ts` 的 `演示文稿` 接口。

### 测试结果
- 渲染层：50 个文件，591 项通过。
- 主进程：6 个文件，64 项通过。
- 合计：655 项全绿。

## 待实现（v1.5.0 后续功能）
- 表格：16 项（功能修改说明 §十二）。
- 演示文稿：14 条命令。
- 文字：4 项（翻译——完整面板与调用链；服务地址与密钥设置；未配置时给出明确中文指引，不伪造结果）。

详见 `docs/superpowers/` 各设计规格。
