# 海豹办公 Seal Office

基于 Electron 25 + Vite 4 + React 18 + Ant Design 5 的桌面端办公软件，
当前已实现首页与文字文档编辑器，界面风格对齐 WPS 新版（WPS 365 / 2023）。

品牌标识为圆润的海豹形象，见 `renderer/src/components/SealLogo.tsx`；
打包图标由 `build/make-icon.ps1` 从同一造型生成，可重复执行。

## 环境要求

- Node.js 18 及以上（当前验证环境为 Node.js 22.20.0）
- npm 9 及以上（当前验证环境为 npm 10.9.3）
- Windows x64 桌面环境

## 依赖安装

本项目依赖 Electron 二进制文件。Electron 的二进制下载源位于 GitHub，
在国内网络环境下直连会超时，表现为：

```
npm error command failed
npm error command C:\Windows\system32\cmd.exe /d /s /c node install.js
npm error RequestError: connect ETIMEDOUT 104.244.46.165:443
```

此时需先指定国内镜像，再执行安装：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm install
```

注意：`ELECTRON_MIRROR` 只影响 Electron 二进制下载，npm 包本身仍走默认源。

若 npm 缓存目录配置在无写权限的位置，安装会以 `npm error code EPERM`、
`syscall mkdir` 失败。此时可将缓存指向工程内目录：

```powershell
npm install --cache ./.npm-cache
```

该目录已在 `.gitignore` 中排除。

## 启动方式

开发模式，同时启动 Vite 开发服务器与 Electron 窗口，支持热更新：

```powershell
npm start
```

也可分别启动：

```powershell
npm run dev          # 仅启动 Vite 开发服务器，默认 http://localhost:5172
npm run electron:dev # 仅启动 Electron 窗口
```

开发模式下 Electron 通过 `app.isPackaged` 判断运行状态，未打包时加载
`http://localhost:5172`，若 Vite 尚未就绪会自动重试，最多 30 次、每次间隔 500 毫秒。

窗口内按 `F12` 可打开开发者工具。应用未使用 Electron 默认菜单栏，界面不出现外文文案。

## 测试

测试基于 Vitest + Testing Library + jsdom，覆盖数据层、状态层、路由注册表与全部组件。

```powershell
npm run test:run     # 一次性运行全部测试
npm test             # 监听模式
npm run test:run -- recentDocs   # 仅运行名称匹配的测试文件
```

当前共 39 个测试文件、398 项测试，全部通过。

类型校验与构建分离执行，Vite 构建只做转译、不做类型检查：

```powershell
npm run typecheck    # tsc --noEmit
```

## 构建

```powershell
npm run build
```

构建产物输出至项目根目录 `dist/`。打包运行时 Electron 会加载 `dist/index.html`。

## 打包

```powershell
npm run pack    # 生成免安装版，输出至 release/win-unpacked
npm run dist    # 生成安装包，输出至 release/
```

两条命令都会先执行 `npm run build`。产物：

- `release/win-unpacked/SealOffice.exe`：免安装版，可直接运行，整目录约 300 MB
- `release/SealOffice Setup 1.0.0.exe`：安装包，约 77 MB，
  支持自选安装目录，并创建桌面与开始菜单快捷方式

应用图标由 `build/make-icon.ps1` 从海豹造型生成，输出 `build/icon.ico`（16 至 256 多尺寸）
与 `build/icon.png`（512 像素展示图），修改造型后重新执行该脚本即可刷新图标。

若打包时下载 Electron 或 NSIS 组件超时，先指定国内镜像：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
```

## 目录结构

```
seal-office/
├── main/                       Electron 主进程
│   ├── main.js                 主进程入口，创建窗口、移除默认菜单栏
│   ├── preload.js              预加载脚本（当前配置下 contextBridge 不生效，待整改）
│   └── ipcHandle.js            历史遗留文件，存在缺陷且未被引用
├── renderer/                   渲染进程（Vite 根目录）
│   ├── index.html              页面模板
│   ├── electron.js             历史遗留的重复主进程实现，未被引用
│   └── src/
│       ├── main.tsx            React 入口，挂载根节点
│       ├── App.tsx             应用外壳：视图分发与整体装配
│       ├── styles.css          设计令牌与全部组件样式
│       ├── navConfig.ts        导航分组、新建入口与文档类型映射（不依赖页面）
│       ├── routes.tsx          模块注册表：把导航数据与页面组件装配到一起
│       ├── docMeta.ts          文档类型的文案、图标与配色元数据
│       ├── store.ts            应用状态 Context 与 useAppStore
│       ├── vite-env.d.ts       Vite 客户端类型声明
│       ├── components/         界面组件
│       │   ├── SealLogo.tsx    海豹品牌标识
│       │   ├── Icon.tsx        内联 SVG 图标集
│       │   ├── TitleBar.tsx    顶栏
│       │   ├── Sidebar.tsx     左侧导航
│       │   ├── NewDocGrid.tsx  新建四宫格
│       │   ├── RecentDocs.tsx  最近文档区块
│       │   ├── DocCard.tsx     文档卡片（网格视图）
│       │   ├── DocRow.tsx      文档行（列表视图）
│       │   ├── EmptyState.tsx  通用空状态
│       │   ├── Footer.tsx      底部状态栏
│       │   └── ErrorBoundary.tsx 渲染异常中文兜底
│       ├── pages/              页面
│       │   ├── HomePage.tsx    首页
│       │   ├── EditorPlaceholder.tsx 编辑器占位内容
│       │   ├── WordPage.tsx    文档模块（渲染完整文字编辑器）
│       │   ├── TablePage.tsx   表格模块
│       │   └── PptPage.tsx     演示模块
│       ├── editor/             文字文档编辑器
│       │   ├── DocEditor.tsx   编辑器容器：装配标签栏、Ribbon、标尺、编辑区与状态栏
│       │   ├── commands.ts     命令注册表：Ribbon 按钮派发的全部行为
│       │   ├── tabSpecs 位于 ribbon/ 下，声明六个标签的组与按钮
│       │   ├── history.ts      撤销重做快照栈
│       │   ├── wordCount.ts    字数统计纯函数
│       │   ├── exportDoc.ts    导出为 HTML 与纯文本
│       │   ├── spellCheck.ts   基础拼写检查
│       │   ├── fontOptions.ts  字体、字号、行距等下拉选项
│       │   ├── EditorCanvas.tsx 编辑区与 A4 纸张
│       │   ├── Ruler.tsx       水平标尺
│       │   ├── DocumentTabs.tsx 文档标签栏
│       │   ├── FindReplacePanel.tsx 查找替换面板
│       │   ├── EditorStatusBar.tsx  编辑器状态栏
│       │   └── ribbon/         Ribbon 标签行、功能区、功能组与按钮
│       ├── mock/
│       │   └── recentDocs.ts   静态示例数据与筛选排序纯函数
│       └── test/
│           ├── setup.ts        测试环境补桩与 DOM 清理钩子
│           └── smoke.test.ts   测试链路自检
├── docs/                       设计与验证资料
│   ├── superpowers/specs/      设计规格
│   ├── superpowers/plans/      实现计划
│   └── screenshots/            运行界面验证截图
├── build/                      打包资源
│   ├── make-icon.ps1           图标生成脚本
│   ├── icon.ico                应用图标（多尺寸）
│   └── icon.png                图标展示图
├── vite.config.js              Vite 与 Vitest 配置
├── tsconfig.json               TypeScript 配置，仅用于类型校验，不参与构建
└── package.json
```

测试文件与对应源码同目录，命名规则为 `*.test.ts` 或 `*.test.tsx`。

## 界面说明

首页由顶栏、左侧导航、主内容区与底部状态栏构成：

- 顶栏：品牌标识、当前页名、搜索框、设置与帮助入口、用户头像。
- 左侧导航：四组共 11 项。首页、最近、星标、共享可切换文档筛选；
  其余项当前提示「功能开发中」，不切换内容，也不以默认数据填充。
- 新建区：文字、表格、演示三个入口进入对应模块，PDF 入口提示功能开发中。
- 最近文档：支持网格与列表两种视图、按修改时间或名称或大小排序、星标切换、
  单击选中与双击打开。
- 空状态：筛选无结果时展示中文空状态与新建按钮。
- 编辑器视图：左侧切换为编辑器导航，顶栏展示文档名，主区为模块占位页。

最近文档当前使用 12 条工程内静态示例数据，未接入真实文件系统。

文档模块提供完整的文字编辑器：文档标签栏、Ribbon 六标签、水平标尺、A4 纸张编辑区与状态栏。
支持字体与段落格式、撤销重做、查找替换、字数统计与导出 HTML 或纯文本；
大型子系统（图表、公式、邮件合并、批注修订等）按钮已就位，点击给出中文提示。

表格模块提供完整的表格编辑器：Ribbon 七标签、名称框与公式栏、列标行号网格、
工作表标签栏与统计状态栏。支持单元格编辑、字体与对齐格式、数字格式、
自动求和、排序、删除重复项，以及导出为 CSV 或 HTML。
内置公式引擎支持单元格与区域引用、六种比较运算与十个常用函数，
不使用 eval 或 Function 构造；除零、未知函数、循环引用一律返回 `#错误`。

## 已知缺陷与待完善事项

1. `main/ipcHandle.js` 未导入 `ipcMain` 却直接调用 `ipcMain.handle`，且第 1 行
   `require('./preload')` 会在主进程中触发 `contextBridge` 未定义异常。
   该文件当前未被任何模块引用。
2. `renderer/electron.js` 注册了不存在的事件名 `ready-to-inverse`，窗口永远不会创建。
   该文件与 `main/main.js` 重复，且未被任何脚本引用，建议删除。
3. 主进程窗口配置中 `webPreferences` 同时启用 `nodeIntegration` 并关闭
   `contextIsolation`，存在安全风险；正式产品应改为通过 `preload` 暴露受控接口。
   当前 `main/preload.js` 使用了 `contextBridge`，在上述配置下不会生效。
4. 最近文档使用工程内 12 条静态示例数据，尚未接入真实文件系统。
5. 表格与演示两个模块仍为占位页；文档模块已实现完整编辑器。
6. 编辑器中的文档内容保存在内存，刷新或重启后不保留，尚未接入文件读写。
7. 编辑器导出支持 HTML 与纯文本；导出 PDF 需要主进程 `printToPDF`，
   受 `preload` 安全问题阻塞，留待整改后再接。
8. 页眉、页脚与页码需要分节与页面模型，图表、公式、邮件合并等大型子系统尚未实现，
   按钮已就位并给出中文提示。
9. 生产构建主包约 656 kB，超过 Vite 默认的 500 kB 提示阈值，
   可按需引入组件或配置分包优化。
10. 编辑器视图下左侧导航提供「返回首页」入口，占位模块页内另有一处，
    真实模块落地后应只保留一处。

## 相关文档

- 设计规格：`docs/superpowers/specs/2026-09-22-wps-home-ui-design.md`
- 实现计划：`docs/superpowers/plans/2026-09-22-wps-home-ui.md`
- 功能修改说明：`功能修改说明.md`
