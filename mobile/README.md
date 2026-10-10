# 海豹办公 uni-app x

基于仓库当前桌面版 **1.9.10** 创建。每次构建读取根目录版本，并直接打包现有 `renderer/src` 编辑器和 `main` 中可移植的 Office、AI、云端逻辑，后续桌面升级进入同一构建链路。

Android、iOS、HarmonyOS 使用 **uni-app x / UTS 原生外壳 + 安装包内的本地 WebView 编辑器**，H5 与 PC Web 使用同一自适应网页。编辑器沿用 React，不是将全部编辑器重写成原生 `.uvue`。基本文件处理和页面不依赖远端网页服务器。

## 运行与默认安卓打包

在仓库根目录运行。需要 Node.js 22 或更新版本，以及根目录和 mobile 的依赖。本机已检测到 `D:\HBuilderX`，版本 5.26。

```powershell
npm ci
npm --prefix mobile ci
npm run mobile:dev
```

打开 http://127.0.0.1:5180。手机显示“首页 / 文件 / 助手 / 功能”底部导航，宽屏沿用桌面工作台。“功能”可以进入文字、表格、演示、PDF、云空间、知识库、模板市场、脑图、流程图、日历及设置。

```powershell
# 安卓包内的编辑器资源，不生成 APK
npm run mobile:build

# 项目、类型和 UTS 编译检查，不提交云打包
npm run mobile:check
npm --prefix mobile run typecheck
npm --prefix mobile run check:android

# 已配置本项目 AppID，只提交 Android 云打包
npm run pack
# npm run dist / npm run mobile:pack 也只打包 Android
```

`static/office/` 是原生安装包内资源，`unpackage/native-check/android/` 是 UTS 检查输出，两者都不是 APK。打包脚本只传 `--platform android`，不同时提交 iOS、鸿蒙或 Web。云打包后以 HBuilderX 实际返回的 APK 下载结果为准。

当前 AppID 为用户配置的 `__UNI__B52B65B`，用户已成功云打包并提供 `D:/downsoft/__UNI__B52B65B_1010231201.apk`。该 APK 已安装到当前 Android 14 模拟器验收；本轮源代码包含后续修复，旧 APK 不包含这些修改，需要重新云打包。其他项目不要复用此 AppID。私有配置和证书不纳入 Git。

HBuilderX 默认查找 D/C/E 盘安装目录，其他路径用 `HBUILDERX_PATH` 或私有配置的 `hbuilderx` 指定。包名默认 `com.sealoffice.mobile`，脚本使用 DCloud 云证书、安全模式并关闭广告选项。自有证书在 HBuilderX 可视化打包界面配置，不把密码写进命令。应用图标源为 `static/icon.png`；各密度 Android 图标、自适应与单色图标、iOS/HarmonyOS 和网页图标已生成并配置，需通过新云包确认实际生效。

CLI 若提示“未检测到已打开的 HBuilderX”，脚本报失败，不将其误报为打包成功。本机 GUI 已运行，但 CLI 暂不能连接；`check:android` 直接调用安装目录编译器完成了 UTS 检查。可在 HBuilderX 界面运行/发行安卓，无需重置个人配置。

## 平台状态

| 平台 | 命令 / 入口 | 验证状态 |
| --- | --- | --- |
| Android | `mobile:build`，HBuilderX 运行 Android / 云打包 | 已收到用户云 APK，旧包在 Android 14 模拟器实测；新源码的 UTS → Kotlin、包内资源及图标检查通过，待重新云打包回归 |
| iOS | `npm --prefix mobile run build:ios`，HBuilderX 选择 iOS | 原生外壳与接口共用，配置已预留；尚未编译、签名或真机验证 |
| HarmonyOS | `npm --prefix mobile run build:harmony`，HBuilderX 选择鸿蒙 | 外壳与接口共用，包名配置已预留；尚未编译、签名或真机验证 |
| H5 / PC Web | `npm run web:build` → `mobile/unpackage/web/` | 手机和宽屏页面、文件往返、持久保存及中文 PDF 阅读/导出通过 |

网页构建使用独立 `web.vite.config.mjs`，通过上述 npm 命令构建，不使用 HBuilderX 的原生配置来构建网页。部署到 HTTPS（开发可用 localhost），保留同源 `/api/` 代理以连接现有海豹云服务；示例见 `deploy/nginx.conf.example`。网页自定义模型/翻译地址需要支持该站点 CORS；原生端通过 UTS `uni.request` 代理 HTTPS 请求和 SSE 流。

## 功能与边界

| 能力 | 实现与范围 |
| --- | --- |
| DOCX / XLSX / PPTX | 桌面原有编解码器、编辑器和 Store；保留导入警告及桌面兼容限制，不宣称完整 Office 兼容 |
| Word 图片 | 八个尺寸手柄、旋转手柄、正文移动、段落布局、精确尺寸、预览、本地裁剪、翻转与删除；撤销重做、DOCX 保存重开保留旋转和翻转。文字提取复用已配置的图像识别接口，AI 改图后续接入 |
| PDF | 本地 Worker 阅读及中文提取；提取、合并、删除、旋转、插入和页面标注处理复用 `pdf-lib` |
| PDF 导出与打印 | 字体随包提供；Word 图片的旋转与翻转在导出副本中转为实际像素，保留显示方向；生成 PDF 后下载/系统分享，可继续用系统工具打印；网页排版与桌面 Chromium 打印引擎不完全相同 |
| 演示导出 | HTML、PNG/JPEG、栅格 PDF、扫描件 PDF、图片型 PPTX；栅格 PDF 文字不可选择 |
| AI / 云空间 / 知识库 / 市场 | 复用服务协议、加密、会话及工具；需要用户自己的配置/账号，本次未调用付费模型或生产账号 |
| 本地文件 | 文件选择器导入应用文档空间，IndexedDB 持久保存；保存同时下载，原生端写入沙盒并打开系统分享 |
| 工作区恢复 | 页面隐藏、退后台和安卓返回触发备份；系统强制终止前未提交内容仍可能丢失 |
| 安全配置 | WebCrypto 不可导出的包装密钥保护模型/云端安全记录；云文件继续使用 AES-GCM/HKDF 格式；普通本地文档和工作区备份不做全盘加密 |
| 桌面系统功能 | Windows 格式关联、资源管理器预览、桌面/下载目录、独立演示窗口、桌面屏幕捕获及安装完整性检查不适用于移动/Web；相关设置已隐藏，无法使用的操作返回明确提示 |

清理站点数据或卸载 App 会删除应用内存储，重要文档应导出。支持 Web Locks 的环境只允许同源一个工作区，防止多页覆盖状态。尚不支持从系统文件管理器直接唤起 App，请用应用内“文件”导入。

## 验证

```powershell
npm --prefix mobile test
npm --prefix mobile run test:browser
npm --prefix mobile run test:browser -- --file
npm --prefix mobile run test:browser -- --web
```

浏览器验收使用独立、无 preload、无 Node 接口的隐藏 Chromium。`--file` 检查安装包形态的普通脚本页面，字体及导出 RPC 使用宿主模拟，不等同于安卓真机测试。报告/截图在仓库忽略的 `.upgrade-private/mobile-verification/`。

本轮结果与待验项在 [verification.json](verification.json)，详细平台和品牌矩阵在 [compatibility.md](compatibility.md)。1.9.10 渲染层全量基线覆盖 200 个文件、1,821 项，全部通过；确认图标后相关组件另行复跑，原始报告保留；主进程 911 项、移动基础 7 项及两种页面加载方式各 17 组检查通过。桌面界面另巡检 96 个页面、主题和宽度组合，检查 5,861 个控件与 15 条交互流程。

检查覆盖中文 DOCX/XLSX/PPTX 往返、保存重开、来源指纹冲突、密钥重新加载、中文 PDF 生成/旋转/阅读、手机新建文字和全部功能入口。Word 图片回归实际操作八个手柄、旋转、翻转、布局、裁剪、移动、删除和撤销重做，并检查裁剪像素、PDF 中的旋转翻转像素及工作区恢复。旧 APK 已验证 DOCX 导入、中文编辑、保存、后台和杀进程后恢复，并发现系统分享与 MIME 文件选择差异；对应源码修复须通过新 APK 再验收。按用户要求，当前只打包 Android，不打包 iOS、鸿蒙。

Android 目标为 9–16，配置 minSdk 28、targetSdk 36，包含 32/64 位 ARM。系统 WebView 也必须具备所需能力，当前构建基线 Chromium 100+ / Safari 15.4+，旧组件有明确的升级提示。国产 ROM、iOS 27 与 HarmonyOS 真机状态及验收要求见 [compatibility.md](compatibility.md)。只有当前安卓模拟器实测，不能将代码配置或浏览器模拟作为各品牌均通过的证明。

参考 DCloud 的 [manifest](https://doc.dcloud.net.cn/uni-app-x/collocation/manifest.html)、[web-view](https://doc.dcloud.net.cn/uni-app-x/component/web-view.html)、[文件系统](https://doc.dcloud.net.cn/uni-app-x/api/file-system-spec.html) 和 [云打包](https://doc.dcloud.net.cn/uni-app-x/tutorial/app-package.html)。

## 第三方资源

- `web/public/uni.webview.js`：DCloud 官方 `uni.webview.1.5.8.js`，[来源](https://github.com/dcloudio/uni-app/blob/uni-app-vue2-dev/dist/uni.webview.1.5.8.js)。
- `web/public/fonts/NotoSansSC.ttf`：Google Fonts / Noto Sans SC，SIL Open Font License，完整许可证在同目录 `OFL.txt`，[来源](https://github.com/google/fonts/tree/main/ofl/notosanssc)。


## 操作视频与 APK 交付

[横屏女声操作教程](https://github.com/fangzhouxiaohai/seal-office/releases/download/v1.9.10/SealOffice1.9.10-AndroidTutorialLandscape1080p.mp4)使用本版移动端生产界面原型，讲解完整日常流程与功能入口；[制作源码](../docs/promo/mobile/README.md)随项目入库。新版 APK 由用户在 HBuilderX 云打包后提供，收到后再核对版本、签名、资源与实际安装行为，上传同版本发布附件。当前没有把旧 APK 当作 1.9.10 成品。

1.9.10 已接入用户确认的 PC / 移动两套界面图标。PC 使用细线条和彩色点缀，移动文件及功能入口使用彩色图形；窄屏与触屏平板按移动样式适配，PC Web 与桌面界面使用扁平皮肤。
