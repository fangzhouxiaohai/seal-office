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

当前版本：1.5.0。

### v1.5.0（最新）
- 修复全部潜在类型错误，typecheck 归零
- 修正 PDF 工具实现状态相关测试断言，PDF 导出与页面工具现为已实现
- 补齐 Ribbon 缺失图标（open、save、save-as）
- PPT 读取路径测试对齐真实契约，并补齐返回演示文稿的 id/name 字段
- 测试全绿：渲染层 591 项、主进程 64 项，合计 655 项通过

详细改动见 `docs/changelog-v1.5.0.md`。

### v1.4.0
- 修复 PPT 文本框拖选文字时外壳被拖动的问题，采用 5px 阈值判断区分拖拽与文本选择
- 修复 PPT 字体颜色下拉框打开后选区丢失的问题，下拉框打开前保存选区快照供命令回退使用
- 修复 PPT 加粗、斜体、下划线命令在选区快照场景下无法应用格式的问题

详细改动见 `docs/v1.4.0-PPT文本选择与格式化修复.md`。

### v1.2.1
- 帮助手册界面重构为瀑布流文章布局，支持标题+正文+配图从上到下排列
- 移除 Tab 切换和折叠面板，改为连续滚动浏览
- 新增配色值拼写修复与深色模式优化
- 修复设置界面帮助手册残留问题，移除帮助与支持标签页
- 修复模板使用功能，模板内容正确加载到编辑器
- 修复文档打开问题，支持 docx/xlsx/pptx 文件通过 Office API 读取
- 修复右键菜单位置偏移问题，改用 absolute+transform 定位，菜单始终靠近光标
- 修复右键菜单无法通过点击空白处关闭的问题
- 修复保存 docx/xlsx/pptx 格式问题，支持将编辑内容转换为真实 Office 二进制文件
- 修复首页打开文件提示不支持格式，归一化扩展名比较

详细改动见 `docs/changelog-v1.2.1.md` 与 `功能修改说明.md`。

作者：饮风一笑
邮箱：24519660@qq.com
许可证：MIT
