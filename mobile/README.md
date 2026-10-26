# 海豹办公 uni-app x

当前移动源码版本为 **2.2.0 / 20200**，与桌面版同步。每次构建读取根目录版本，并直接打包现有 `renderer/src` 编辑器和 `main` 中可移植的 Office、AI、云端逻辑，后续桌面升级进入同一构建链路。2.2.0 的系统字体读取、自定义字体导入、专属格式字体嵌入和 DOCX/WPS 回退见[字体与跨平台兼容](../docs/字体与跨平台兼容.md)；最新 Android / HarmonyOS 云打包源码在 `release/v2.2.0/mobile-web/`。四种短后缀 `.sldoc/.slxls/.slppt/.spdf` 在两种原生宿主和 Web 共用同一协议，旧三种后缀继续兼容。

应用界面继续显示“海豹办公”，发行文件统一使用英文名。2.2.0 交付 Android 与 HarmonyOS 两份独立云打包源码，尚未生成新的 APK / App Pack。Android ZIP 和解压后的总文件大小均限制在 60,000,000 字节以内，用对应平台源码直接在 HBuilderX 提交云打包。历史 2.1.1 成品与验收保持不变，见[历史成品报告](../docs/verification/v2.1.1/mobile-native-packages.json)。

后续如果取得独立签名 HAP，可使用 `seal-office-2.2.0-harmony.hap`。云服务返回的下载文件名不由本仓库控制；下载后用 `npm --prefix mobile run check:apk -- "APK路径" --require-current --archive "归档目录"`，或 `npm --prefix mobile run check:hap -- "HAP路径" --archive "归档目录"` 校验并原字节复制归档。两条命令保留下载原文件，拒绝覆盖不同内容的同名归档。HAP 检查覆盖包结构、身份、版本和当前快照内置资源，签名与设备安装仍需官方工具独立验证；该命令不接受 App Pack。

Android、iOS、HarmonyOS 使用 **uni-app x / UTS 原生外壳 + 安装包内的本地 WebView 编辑器**，H5 与 PC Web 使用同一自适应网页。编辑器沿用 React，不是将全部编辑器重写成原生 `.uvue`。基本文件处理和页面不依赖远端网页服务器。

## 运行与默认安卓打包

在仓库根目录运行。需要 Node.js 22 或更新版本，以及根目录和 mobile 的依赖。本机已检测到 `D:\HBuilderX`，版本 5.26。

```powershell
npm ci
npm --prefix mobile ci
npm run mobile:dev
```

打开 http://127.0.0.1:5180。手机显示“首页 / 云盘 / 服务 / 模板 / 我的”底部导航，宽屏沿用桌面工作台。“服务”可以进入文字、表格、演示、PDF、知识库、脑图、流程图、日历和其他工具，导入文件是页面内操作。

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

如果使用 HBuilderX 界面手动云打包：先在仓库根目录执行 `npm run mobile:build`，确认生成 `mobile/static/office/office.js`；然后用 HBuilderX 打开 `E:\seal-office\mobile`，在“发行 → 原生 App-云打包”中选择 Android。切换到鸿蒙前执行 `npm --prefix mobile run build:harmony` 并在 HBuilderX 选择对应鸿蒙发行入口。两端分别构建并提交，完整步骤见 [2.1.1 发行准备](releases/2.1.1.md)。正式交付优先使用独立冻结目录，打包完成后再核对版本、签名和包内资源；`static/office/` 是编辑器资源。

当前 AppID 为用户配置的 `__UNI__B52B65B`。本次源码及已验签的 Android / 鸿蒙成品均为 `2.1.1 / 20101`；新版雷电已安装 APK 完整哈希一致，仅做只读包信息核验，不能代替新版原生功能完整验收。历史补充云包 `1.9.12 / 10912` 曾核验并用于替换发布页的 [SealOfficeAndroid1.9.12.apk](https://github.com/fangzhouxiaohai/seal-office/releases/download/v1.9.12/SealOfficeAndroid1.9.12.apk)：其包内编辑器与当时修复后源码逐字节一致、签名相同，Android 14 模拟器验证了轻点打开、保存不弹分享、强制停止后正文仍在。历史结果不代表新版已通过真机验证。其他项目不要复用此 AppID。私有配置和证书不纳入 Git。

发布页的 [完整补充源码包](https://github.com/fangzhouxiaohai/seal-office/releases/download/v1.9.12/SealOffice1.9.12-Source.zip)附带已核验的 `static/office/` 编辑器资源，便于直接在 HBuilderX 打开移动项目。Git 克隆不包含这些生成文件，需先执行 `npm run mobile:build`；源码包的 `release-source.json` 记录提交和包内编辑器哈希。

HBuilderX 默认查找 D/C/E 盘安装目录，其他路径用 `HBUILDERX_PATH` 或私有配置的 `hbuilderx` 指定。包名默认 `com.sealoffice.mobile`，脚本使用 DCloud 云证书、安全模式并关闭广告选项。自有证书在 HBuilderX 可视化打包界面配置，不把密码写进命令。应用图标源为 `static/icon.png`；各密度 Android 图标、自适应与单色图标、iOS/HarmonyOS 和网页图标已生成并配置，新云包内图标资源已核验；桌面启动图标显示仍需设备验证。

CLI 若提示“未检测到已打开的 HBuilderX”，脚本报失败，不将其误报为打包成功。本机 GUI 已运行，但 CLI 暂不能连接；`check:android` 直接调用安装目录编译器完成了 UTS 检查。可在 HBuilderX 界面运行/发行安卓，无需重置个人配置。

## 平台状态

| 平台 | 命令 / 入口 | 验证状态 |
| --- | --- | --- |
| Android | `mobile:build`，HBuilderX 运行 Android / 云打包 | 1.9.12 补充 APK 已通过 Android 14 模拟器的轻点打开、保存和重启恢复复测；其他品牌仍待验 |
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
| 本地文件 | 文件选择器导入应用文档空间，IndexedDB 持久保存；原生端保存到应用文档空间，显式导出才打开系统分享；网页版保存同时下载 |
| 工作区恢复 | 页面隐藏、退后台和安卓返回触发备份；系统强制终止前未提交内容仍可能丢失 |
| 安全配置 | WebCrypto 不可导出的包装密钥保护模型/云端安全记录；云文件继续使用 AES-GCM/HKDF 格式；普通本地文档和工作区备份不做全盘加密 |
| 桌面系统功能 | Windows 格式关联、资源管理器预览、桌面/下载目录、独立演示窗口、桌面屏幕捕获及安装完整性检查不适用于移动/Web；相关设置已隐藏，无法使用的操作返回明确提示 |

清理站点数据或卸载 App 会删除应用内存储，重要文档应导出。支持 Web Locks 的环境只允许同源一个工作区，防止多页覆盖状态。尚不支持从系统文件管理器直接唤起 App，请用首页或服务页的“导入文件”。

## 验证

```powershell
npm --prefix mobile test
npm --prefix mobile run test:browser
npm --prefix mobile run test:browser -- --file
npm --prefix mobile run test:browser -- --web
```

浏览器验收使用独立、无 preload、无 Node 接口的隐藏 Chromium。`--file` 检查安装包形态的普通脚本页面，字体及导出 RPC 使用宿主模拟，不等同于安卓真机测试。报告/截图在仓库忽略的 `.upgrade-private/mobile-verification/`。

本轮结果与待验项在 [verification.json](verification.json)，详细平台和品牌矩阵在 [compatibility.md](compatibility.md)。1.9.11 主进程 921 项、移动单元 11 项通过，网页和本地 WebView 宿主模拟两种加载方式各 18 组通过。办公格式验收覆盖 37 组兼容读取、25 组保存重开及服务配置操作，使用实际本地转换服务。渲染层全量运行 1,848 项，OFD 的一项问题修复后在最终受影响的 82 项回归和真实 OFD/PDF 流程中通过；详细原始结果与复测说明见[本版验收](../docs/v1.9.11-修复与验收.md)。1.9.10 的完整基线另行归档，不作为新 APK 或各品牌真机均通过的证明。

检查覆盖中文 DOCX/XLSX/PPTX 与四种海豹专属格式的保存重开、来源指纹冲突、密钥重新加载、中文 PDF 生成/旋转/阅读、手机新建文字和功能入口。Word 图片回归实际操作八个手柄、旋转、翻转、布局、裁剪、移动、删除和撤销重做，并检查裁剪像素、PDF 中的旋转翻转像素及工作区恢复。旧 APK 的设备结果保留在历史报告，不能代表新版已通过原生验收。2.1.1 准备 Android 与鸿蒙的独立版本资源和云打包源码，由用户分别提交云打包；本版范围见[2.1.1 验收记录](../docs/verification/v2.1.1/README.md)。

Android 目标为 9–16，配置 minSdk 28、targetSdk 36，包含 32/64 位 ARM。系统 WebView 也必须具备所需能力，当前构建基线 Chromium 100+ / Safari 15.4+，旧组件有明确的升级提示。国产 ROM、iOS 27 与 HarmonyOS 真机状态及验收要求见 [compatibility.md](compatibility.md)。只有当前安卓模拟器实测，不能将代码配置或浏览器模拟作为各品牌均通过的证明。

参考 DCloud 的 [manifest](https://doc.dcloud.net.cn/uni-app-x/collocation/manifest.html)、[web-view](https://doc.dcloud.net.cn/uni-app-x/component/web-view.html)、[文件系统](https://doc.dcloud.net.cn/uni-app-x/api/file-system-spec.html) 和 [云打包](https://doc.dcloud.net.cn/uni-app-x/tutorial/app-package.html)。

## 第三方资源

- `web/public/uni.webview.js`：DCloud 官方 `uni.webview.1.5.8.js`，[来源](https://github.com/dcloudio/uni-app/blob/uni-app-vue2-dev/dist/uni.webview.1.5.8.js)。
- `web/public/fonts/NotoSansSC.ttf`：Google Fonts / Noto Sans SC，SIL Open Font License，完整许可证在同目录 `OFL.txt`，[来源](https://github.com/google/fonts/tree/main/ofl/notosanssc)。


## 操作视频与 APK 交付

[横屏女声操作教程](https://github.com/fangzhouxiaohai/seal-office/releases/download/v1.9.10/SealOffice1.9.10-AndroidTutorialLandscape1080p.mp4)使用 1.9.10 移动端生产界面原型，讲解日常流程与功能入口；[制作源码](../docs/promo/mobile/README.md)随项目入库。1.9.12 补充 APK 由用户通过 HBuilderX 云打包提供，已核对版本、签名和包内资源；Android 14 模拟器的两轮验收见[报告](../docs/verification/v1.9.12/android-emulator-smoke.json)。

1.9.11 已接入用户确认的 PC / 移动两套界面图标。PC 使用细线条和彩色点缀，移动文件及功能入口使用彩色图形；窄屏与触屏平板按移动样式适配，PC Web 与桌面界面使用扁平皮肤。

本版手机与 PC 共用全部 50 种办公扩展名清单，同步 CSV/TSV 原格式保存、中文编码、OOXML 模板与宏正文导入、MHTML 和 OFD 阅读。旧表格使用离线兼容处理，旧文字、演示和部分开放格式使用用户确认的[自建文档转换服务](../server/converter/README.md)。手机设置中心可保存服务地址、加密访问令牌、测试连接；每次上传正文前确认，取消或失败保留来源。服务需实际部署后才能使用联网格式，完整范围见[文档格式支持](../docs/文档格式支持.md)。

## 2.0 脑图与流程图云协作

图形工作区保留本机多项目列表，新增“云端与协作”。可从本机项目同步到个人云或团队、指定账号共享、实时共同编辑，断网操作加密保留并在重连后合并。查看者、编辑者之间实时切换，权限撤销后停止写入；手机保留拖动、双指缩放及导入导出。详细流程见 [脑图云协作](../docs/脑图云协作.md)，本轮验收见 [第五轮报告](../docs/verification/v2.0.0-fifth-pass/README.md)。

