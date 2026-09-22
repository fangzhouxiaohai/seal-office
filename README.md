# WPS 模仿办公软件

基于 Electron 25 + Vite 4 + React 18 + Ant Design 5 的桌面端办公软件示例工程。

## 环境要求

- Node.js 18 及以上（当前验证环境为 Node.js 22）
- npm 9 及以上
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

## 构建

```powershell
npm run build
```

构建产物输出至项目根目录 `dist/`。打包运行时 Electron 会加载 `dist/index.html`。

## 目录结构

```
wps-office/
├── main/                  Electron 主进程
│   ├── main.js            主进程入口，负责创建窗口
│   ├── preload.js         预加载脚本，向渲染进程暴露 IPC 能力
│   └── ipcHandle.js       IPC 处理逻辑（存在缺陷，当前未被引用）
├── renderer/              渲染进程（Vite 根目录）
│   ├── index.html         页面模板
│   ├── electron.js        历史遗留的重复主进程实现，未被引用
│   └── src/
│       ├── main.tsx       React 入口，挂载根节点
│       ├── App.tsx        应用主组件
│       ├── styles.css     全局样式
│       ├── components/    组件目录（当前均为空文件）
│       ├── routes.tsx     路由定义（当前为空文件）
│       └── store.ts       状态定义（当前为空文件）
├── vite.config.js         Vite 配置
└── package.json
```

## 已知缺陷与待完善事项

以下问题不影响当前运行，但需后续处理：

1. `main/ipcHandle.js` 未导入 `ipcMain` 却直接调用 `ipcMain.handle`，且第 1 行
   `require('./preload')` 会在主进程中触发 `contextBridge` 未定义异常。
   该文件当前未被任何模块引用。
2. `renderer/electron.js` 注册了不存在的事件名 `ready-to-inverse`，窗口永远不会创建。
   该文件与 `main/main.js` 重复，且未被任何脚本引用，建议删除。
3. 以下文件目前为空文件，尚未实现具体逻辑：
   `renderer/src/components/Header.tsx`、`renderer/src/components/Sidebar.tsx`、
   `renderer/src/components/Footer.tsx`、`renderer/src/routes.tsx`、
   `renderer/src/store.ts`。当前界面布局由 `App.tsx` 直接实现。
4. 主进程窗口配置中 `webPreferences` 同时启用 `nodeIntegration` 并关闭
   `contextIsolation`，存在安全风险，正式产品建议改为通过 `preload` 暴露受控接口。
