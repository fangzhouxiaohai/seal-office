# 海豹办公 Seal Office

海豹办公是基于 Electron、Vite、React 与 Ant Design 的桌面办公软件，当前包含首页、文字文档、表格、演示文稿、PDF 导出与基础 PDF 页面工具。

主进程按文件、Office、PDF、系统四个领域拆分 IPC；渲染层统一通过 `renderer/src/ipc/bridge.ts` 类型安全调用，不再直接裸调窗口接口。

## 主要能力

- 文字编辑器：富文本格式、选区快照恢复、查找替换、目录导航、HTML 与 PDF 导出。
- Office 编解码：主进程提供 docx、xlsx、pptx 读写模块，并报告未保留内容。
- 表格编辑器：公式、排序、格式、自动求和、导出。
- 演示编辑器：幻灯片、文本框、版式与导出。
- PDF 工具：页面提取、删除、旋转、PDF 导出与基础预览。
- 设置页面：左侧导航、主题变量、深色模式适配、关于信息与品牌图标。

## 环境与命令

需要 Node.js 18 及以上、npm 9 及以上、Windows x64 环境。

```powershell
npm install
npm run typecheck
npm run test:run
npm run build
npm run pack
npm run dist
```

开发运行：

```powershell
npm start
```

## 目录结构

```text
main/
  main.js
  preload.js
  ipc/
    index.js
    fileChannel.js
    officeChannel.js
    pdfChannel.js
    systemChannel.js
  office/
  pdf/
renderer/src/
  ipc/bridge.ts
  pdf/
  editor/
  sheet/
  ppt/
```

## 版本

当前版本：1.3.0。

详细改动见 `功能修改说明-v1.3.0.md`。

作者：饮风一笑
邮箱：24519660@qq.com
许可证：MIT
