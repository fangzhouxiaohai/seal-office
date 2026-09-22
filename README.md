# WPS 模仿办公软件

基于 Electron 25 + Vite 4 + React 18 + Ant Design 5 的桌面端办公软件示例工程，
当前已实现仿 WPS 新版（对齐 WPS 365 / 2023）的首页界面。

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

当前共 16 个测试文件、104 项测试，全部通过。

类型校验与构建分离执行，Vite 构建只做转译、不做类型检查：

```powershell
npm run typecheck    # tsc --noEmit
```

## 构建

```powershell
npm run build
```

构建产物输出至项目根目录 `dist/`。打包运行时 Electron 会加载 `dist/index.html`。

## 目录结构

```
wps-office/
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
│       │   ├── WordPage.tsx    文档模块
│       │   ├── TablePage.tsx   表格模块
│       │   └── PptPage.tsx     演示模块
│       ├── mock/
│       │   └── recentDocs.ts   静态示例数据与筛选排序纯函数
│       └── test/
│           ├── setup.ts        测试环境补桩与 DOM 清理钩子
│           └── smoke.test.ts   测试链路自检
├── docs/                       设计与验证资料
│   ├── superpowers/specs/      设计规格
│   ├── superpowers/plans/      实现计划
│   └── screenshots/            运行界面验证截图
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
5. 文档、表格、演示三个模块均为占位页，尚未实现真实编辑能力。
6. 生产构建主包约 610 kB，超过 Vite 默认的 500 kB 提示阈值，
   可按需引入组件或配置分包优化。
7. 编辑器视图下左侧导航与占位页各有一个「返回首页」入口，
   功能不冲突但存在冗余，真实编辑器落地后应只保留一处。

## 相关文档

- 设计规格：`docs/superpowers/specs/2026-09-22-wps-home-ui-design.md`
- 实现计划：`docs/superpowers/plans/2026-09-22-wps-home-ui.md`
- 功能修改说明：`功能修改说明.md`
