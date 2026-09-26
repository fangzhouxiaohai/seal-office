# 海豹办公（Seal Office）主进程 / IPC / 编解码 / 打包链路审查报告

- 审查范围：主进程入口、IPC 桥接、文件读写、Office 编解码、PDF 工具、打包配置
- 审查方式：逐行核对了 `main/**`、`renderer/src/ipc/bridge.ts` 及其调用方、`package.json` 构建配置
- 结论：通道名与类型接口**一一对应无错配**，读取/打开链路正确；但**写入（保存）链路存在多处二进制损坏与模型契约不匹配的严重缺陷**。

---

## 一、严重问题（必须修复，会导致文件损坏或数据丢失）

### 严重-1：`fileChannel.js:44` 二进制保存逻辑损坏所有 docx/xlsx/pptx/PDF 文件
```js
const 缓冲 = Buffer.isBuffer(内容) ? 内容 : Buffer.from(String(内容 ?? ''), 格式 === '二进制' ? undefined : 'utf8')
```
- 渲染层所有二进制保存都传 **`Uint8Array`**（`commands.ts:724/744/764`、`PdfWorkbench.tsx:19` 均 `Uint8Array.from(atob(结果.数据), c=>c.charCodeAt(0))`）。
- Electron IPC 结构化克隆后，主进程收到的 `内容` 是 **`Uint8Array`**，而 `Buffer.isBuffer(uint8array) === false`，于是落入 `Buffer.from(String(内容 ?? ''), ...)`。
- `String(Uint8Array)` 得到形如 `"80,75,3,4,10,..."` 的**逗号分隔字节数值串**，按 utf8 写入后，任何二进制文件都变成纯数字 ASCII 文本，**文件彻底损坏**。
- 影响：编辑器保存 docx / xlsx / pptx、PDF 工具保存 PDF 全部失效。
- 修复建议：
  ```js
  const 缓冲 = Buffer.isBuffer(内容) ? 内容
    : (内容 instanceof Uint8Array ? Buffer.from(内容)          // 数组缓冲直接转
      : Buffer.from(String(内容 ?? ''), 格式 === '二进制' ? undefined : 'utf8'))
  ```

### 严重-2：`PptEditor.tsx:222 / 258` 未对 base64 解码直接保存，pptx 文件损坏
```js
const 二进制内容 = 结果.数据          // 结果.数据 是 base64 字符串
桥接.saveToFile(文件路径, 二进制内容, '二进制')
```
- `office.writePptx` 经 `officeChannel.js:27` 返回 `数据` 为 `Buffer.toString('base64')`。
- 此处**未做 `atob` 解码**，直接把 base64 文本当二进制写入；叠加严重-1 的缺陷，保存出的 .pptx 内容是 base64 字符串，完全不可用。
- 修复建议：与 `commands.ts` 一致：`Uint8Array.from(atob(结果.数据), c => c.charCodeAt(0))` 后再传入 `saveToFile`。

### 严重-3：`writeXlsx` 模型契约不匹配 → 保存 .xlsx 为空表（数据丢失）
- 渲染层 `commands.ts:741/830` 用 `htmlToXlsxModel(内容)`，其返回结构为 **`{ 工作表: [{ 名称, 数据: 数据行 }] }`**（`commands.ts:1068`）。
- 主进程 `xlsxCodec.js:22` 读取的是 **`模型.行`**：
  ```js
  const 行 = 模型 && Array.isArray(模型.行) ? 模型.行 : []
  ```
- `模型.行` 为 `undefined` → 落入空数组 → 生成的 xlsx 是**空工作簿**，用户表格数据全部丢失。
- 修复建议：统一契约。推荐 `xlsxCodec.写入xlsx` 读取 `模型.工作表?.[0]?.数据`，或让 `htmlToXlsxModel` 返回 `{ 行: [...] }` 与现有 codec 对齐。

### 严重-4：`writePptx` 模型契约不匹配（编辑器另存路径）→ 保存 .pptx 为空演示文稿
- 渲染层 `commands.ts:761/849` 用 `htmlToPptxModel(内容)`，其返回结构为 **`{ 幻灯片列表: [...] }`**（`commands.ts:1074`）。
- 主进程 `pptxCodec.js:97` 读取的是 **`模型.幻灯片`**：
  ```js
  const 幻灯片列表 = 模型 && Array.isArray(模型.幻灯片) ? 模型.幻灯片 : []
  ```
- 导致 `幻灯片列表` 为空 → 生成空演示文稿（仅一个空占位页，内容丢失）。
- 说明：`PptEditor.tsx:218/254` 传入的是 `{ 幻灯片: [...] }`，与 codec **匹配**；只有 `commands.ts` 的文档编辑器另存 .pptx 路径不匹配。
- 修复建议：`htmlToPptxModel` 改为返回 `{ 幻灯片: [...] }`（`幻灯片` 每项 `{ 文本: string }`），与 codec 和 `PptEditor` 保持一致；或 codec 同时兼容两种键名。

---

## 二、中等问题（建议修复）

### 中等-1：`officeChannel.js:11` 损失说明恒为空，未覆盖统计失效
```js
损失说明: 生成说明((模型 && 模型.未覆盖 || []).map((名称) => ({ 名称, 次数: 1 })))
```
- `htmlToDocxModel` 生成的模型**没有 `未覆盖` 字段** → `模型.未覆盖` 为 `undefined` → 映射结果为空数组 → `生成说明` 恒返回空字符串。
- 即便字段存在，`.map` 将次数**固定为 1**，与 `lossReport.js` 期望的 `{ 名称, 次数 }` 语义不符（应为真实统计次数）。
- 修复建议：由 `htmlToDocxModel` 填充 `未覆盖` 数组；次数统计逻辑应基于实际检测而非固定 1。

### 中等-2：`main/fileOps.js` 为重复/死代码
- `fileChannel.js` 已自行实现 `showSaveDialog / showOpenDialog / saveToFile / readFile`，且是实际被引用的实现；`main/fileOps.js` 中的同名函数（含 `'utf-8'` 写文本、`multiSelections` 多选等旧逻辑）**未被任何主进程文件 require**。
- `build.files` 的 `main/**/*` 会把这些连同测试文件一起打进 asar，徒增体积并造成维护混淆。
- 修复建议：删除 `main/fileOps.js` 及冗余测试/调试文件，或由 `fileChannel.js` 统一引用它并删除重复实现。

### 中等-3：`commands.ts:968-995` `htmlToDocxModel` 文本与样式片段分离，docx 格式丢失
- `收集文字` 对 ELEMENT_NODE 创建 `片段 = { 文本: '' }` 后**从不给 `片段.文本` 赋值**（样式落在 `片段` 上），实际文本经递归由 TEXT_NODE 分支以**独立片段**压入 `段落.文字`。
- 结果：docx 输出的每段文字被拆散，粗体/颜色/字号等样式信息丢失（或落在空文本片段上）。
- 影响：编辑器另存 .docx 时正文格式（加粗、颜色、字号）基本不保留。
- 修复建议：`收集文字` 在 ELEMENT_NODE 分支应把递归收集到的子文本合并进当前 `片段.文本`，再整体 push。

### 中等-4：`pdf.merge` 已注册但前端无入口
- preload、bridge、`pdfChannel.js:8` 均已注册 `pdf.merge`，但 `PdfWorkbench.tsx:22` 的命令下拉用 `filter(([键]) => 键 !== 'merge')` 把合并功能**过滤隐藏**。
- 修复建议：为 merge 提供 UI 入口（多文件选择），或确认属预期删减后移除冗余注册。

---

## 三、轻微问题（可选改进）

### 轻微-1：`commands.ts:886-888` PDF 导出取消时提示错误
- 取消返回 `{ 成功: false, 已取消: true }`（无 `错误` 字段），`notify(\`PDF 导出失败：${结果.错误}\`)` 显示 "PDF 导出失败：undefined"。
- 修复建议：判断 `结果.已取消` 时仅提示"已取消导出"，不报错误。

### 轻微-2：`package.json` build.files 打包冗余
- `main/**/*` 会把 `main/*.test.js`、`main/main-test.js`（开发调试文件）、`main/ipcHandle.js`（仅转调）、`main/pdf/node_modules/**`（测试临时产物）一并打入 asar。
- 修复建议：files 收窄为 `main/main.js`、`main/preload.js`、`main/ipc/**`、`main/office/**`、`main/pdf/*.js`、`main/pdfExport.js` 等实际运行文件，或使用 `!` 排除测试/临时文件。

### 轻微-3：`package.json` dependencies 冗余
- `react / react-dom / antd` 等渲染层依赖已由 Vite 打包进 dist，不必列入 `dependencies`（electron-builder 会重复打入 asar）。
- `pdfjs-dist / pdfmake / html-to-pdfmake` 在主进程未被任何模块 require（PDF 处理实际用 `pdf-lib`、导出用 `printToPDF`）。
- 修复建议：将渲染层依赖移入 `devDependencies`，删除未使用依赖，减小包体积。

### 轻微-4：`npmRebuild: false`
- 当前依赖均为纯 JS，关闭 rebuild 无碍；但若未来引入原生模块（如 `better-sqlite3`）会导致 ABI 不匹配。建议保持注释说明或按需开启。

---

## 四、验证正确的链路（无问题）

- **通道名一一对应**：preload 暴露的 16 个通道（`file.*`×4、`pdf.export`、`system.setDefaultApp`、`help.getContent`、`app.getInfo`、`office.*`×6、`pdf.*`×4）与 `fileChannel / officeChannel / pdfChannel / systemChannel` 中 `ipcMain.handle` 全部对应，**无错配**。
- **bridge.ts 类型与返回结构匹配**：`文件读取结果 / 文件保存结果 / 应用信息`、`saveToFile / exportToPdf` 的返回结构均与主进程实际返回值一致。
- **入口加载路径正确**：`main.js:30` `app.isPackaged` 时 `loadFile(path.join(__dirname,'..','dist','index.html'))` → asar 内 `app.asar/dist/index.html`，且 `build.files` 含 `dist/**/*`，`dist/index.html` 产物存在。
- **preload 已打包**：`main/**/*` 覆盖 `main/preload.js`；`main.js:24` 指定 `path.join(__dirname,'preload.js')` 路径正确。
- **开发服务器端口一致**：`main.js:5` `DEV_SERVER_URL=localhost:5172` 与 `vite.config.js:13` `port:5172` 一致，`strictPort` 保证固定端口。
- **docx 打开/读取链路**：`readFile`→base64→`office.readDocx`→`mammoth` 转 HTML→渲染层校验 `数据.html`，正确。
- **docx 写入模型字段兼容**：`htmlToDocxModel` 返回 `{ 段落: [...] }`，`docxWriter.生成docx` 读 `文档模型.段落`，字段（`文字/级别/对齐/列表`）兼容；空文档补空段落、表格后补空段等结构处理正确。
- **PDF 编解码（extract/delete/rotate）契约**：preload 传 `(数据, 页码: number[])`，`pdfChannel.js` 按 base64 解包，`pdfTools` 校验页码范围，渲染层 `解析页码` 生成 number[]，匹配。
- **pptx 读取链路**：`readPptx`→`{ 演示文稿: { 幻灯片列表: [...] } }`，`HomePage.tsx:96`、`PptEditor.tsx:163` 均读取 `数据.演示文稿`，且 `文本框列表` 字段与渲染字段一致。
- **PDF 导出模块引用**：`pdfChannel.js:2` 经 `pdfPrint.js`（`module.exports=require('../pdfExport')`）→ `pdfExport.exportToPdf`，导出/临时文件清理逻辑正确。

---

## 五、总体评估

| 维度 | 结论 |
|------|------|
| 通道注册与类型桥接 | 正确，无错配 |
| 文件读取 / 打开链路 | 正确 |
| 文件写入 / 保存链路 | **严重缺陷**（二进制损坏 + xlsx/pptx 契约不匹配），docx/xlsx/pptx/PDF 保存均受影响 |
| 打包配置 | 功能可用但含冗余（测试/调试文件、冗余依赖入包） |

保存链路是最优先修复项：**建议先修严重-1（fileChannel 的 Buffer 处理）**，再逐一对齐严重-3 / 严重-4 的模型契约，并修复严重-2 的 base64 直传，否则用户保存的 docx/xlsx/pptx/PDF 全部为损坏或空文件。