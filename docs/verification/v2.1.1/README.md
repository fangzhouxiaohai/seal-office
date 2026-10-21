# 海豹办公 2.1.1 验收记录

本目录将源码回归、生产构建、成品安装和实际设备分别记录。发行附件的最终提交、字节数和 SHA-256 以发行目录 `release-manifest.json`、`SHA256SUMS.txt` 和同版 verification 附件为准。

## 自动回归与构建

- `unit-regression.json`：完整、不筛选的 renderer/main 回归，以及 server、mobile、打包规范测试；逐项统计实际 assertionResults，零失败、零跳过才通过。先前失败与修正也保留摘要。
- `source-inputs.json`：本次最终回归的源码输入快照。后续修改会使发行门槛失败；忽略的后台 upstream/dist 只记录来源，不把本机依赖目录打入源码包。
- `build-validation.json`：桌面与移动 TypeScript、移动结构、Android/Harmony UTS 编译；编译不是已生成正式 APK/HAP。
- `packaged-codecs.json`：Windows 实际 app.asar 的 DOCX/XLSX/PPTX/PDF 与四种原生格式；检查磁盘保存再打开、字体资源、图片、公式缓存和修订。
- `sample-import.json`：用户提供的实际 8,000 字节 Excel，两个工作表全部 26 个非空单元格逐项比对原文字和坐标，警告为空、默认打印方向保留，原文件哈希不变；报告不包含客户单元格原文。

## 各端运行

- `windows-runtime.json`：解包成品和便携包实际启动、重启、功能断言及正常退出。便携包首次冷解包和退出临时文件清理较慢，原等待失败与后续有界等待、实测时长均在报告中，不把调整后的等待称为原时限通过。
- `windows-nsis.json`、`msix.json`：两种包装内全部 19,578 个源 payload 文件逐一比对大小和 SHA-256。MSIX 验证清单、原商店身份及英文保留名；未在本机安装，也未提交 Partner Center。
- `linux-deb.json`、`ubuntu-runtime.json`、`ubuntu-22.04.json`、`ubuntu-24.04.json`：同一份 CI DEB 在两个 Ubuntu 版本实际安装，每端 77 项，未绕过沙箱。CI 候选提交的 614 个运行/构建输入与本次发行相同；后续测试等待和验收文档改动不进入程序包。
- `linux-windows-build-archive.json`：早期 Windows 宿主构建的 DEB 只做归档检查。它不是本次发行 DEB，不能将它的解包目录与 CI 安装包称为相同字节。
- `web-browser.json`、`mobile-android-browser.json`、`mobile-harmony-browser.json`：冻结生产构建各五组、35 项，包括真实触摸、阅读翻页/缩放、草稿保存、复杂公式、图形多项目与演示保存重开。
- `mobile-native-browser.json`：两份冻结原生 IIFE，经实际 uni.webview 通道与模拟宿主握手，四格式实际 IndexedDB 写入/再次保存/重载、来源指纹保护和匿名 AI 调用；浏览器模拟不代表原生系统选择器验收。
- `diagram-collaboration.json`：Web、原生 file、原生 HTTP 三种模式 × 个人/团队两种空间，共六组真实隔离 HTTP 服务和双浏览器共同编辑，包含离线恢复、共享及角色撤销，结束后关闭全部测试资源。

## 线上和视频

- `backend-deployment.json`：后台切换及回滚保护、既有数据表、管理后台、配置和转换服务保留；匿名 AI 身份接口返回 401，未操作真实客户账号。
- `public-web.json`：上线后在公开 HTTPS 入口执行文档、模板、项目三组真实浏览器工作流；核对生产主脚本哈希，失败自动回滚。
- `promo.json`、`video-visual-review.json`：本版 PC 横屏和 Android 竖屏，完整解码、音轨、字幕、画幅、16 张实际编码画面和二维码复核；移动画面标明布局演示，未冒充真机 APK 录制。
- `cloud-sources.json`：两个独立、已冻结验证的 2.1.1/20101 云打包源码 ZIP，不包含签名证书或旧版安装包。

## 已知边界和待设备复验

四种新后缀适用于 Windows、Linux、Web、Android、Harmony，不仅是 Windows。它们保存海豹办公当前完整编辑模型；外部 Office/WPS 里尚未识别的功能不会因此恢复，必须在打开前明确选择转换副本或取消。用户提供的 `关键词回复导入模板.xlsx` 仅只读分析，原 SHA-256 为 `4afe07de92324ae01a7a24afa2f5a5344ff955ba038c627b099d79e2fbda1de1`；打印方向 `default` 不再误报为丢失内容。

生成式 AI 需要当前有效的已验证手机号账号，已有账号可以密码登录。取消保留输入，普通本地文档不要求登录；实际调用仍重新向服务器核验，不依赖可篡改的本机标记。法规来源和调用边界见 `../../AI身份核验.md`，本项整改不等于其他 AI 合规义务全部完成。

本机未连接 Harmony 审核设备。原生系统文件选择、DocumentViewPicker 保存后冷启动重开、运营商短信真实送达和应用商店审核，必须用用户重新云打包的 2.1.1 成品复验；未发布冒充新版的 2.1.0 APK、HAP 或已签名 App Pack。相关根因证据见 `../../HARMONY_BRIDGE_FIX_2.1.1.md`，PDF 新增字符边界见 `../../PDF文字兼容边界.md`。

本机清理旧 `release/v2.1.0` 的递归删除被自动审批以 `blocked by policy` 拒绝，因此该旧目录保留。没有改用其他删除或移动方式绕过拒绝；新版产物均在 `release/v2.1.1`，当前介绍视频在 `release/promo`。
