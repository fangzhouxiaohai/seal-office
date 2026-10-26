# 仓库打包命名规则

- 按用户最新要求，今后的发行包文件名统一使用英文 `seal-office` 前缀。版本号使用当前项目版本，不因命名变更修改版本、应用 ID 或签名。
- 统一命名模板见 `build/artifact-names.json`：Windows NSIS 为 `seal-office-setup-${version}.exe`，Windows 便携包为 `seal-office-${version}-portable.exe`，Ubuntu DEB 为 `seal-office-${version}-amd64.deb`，Web 为 `seal-office-${version}-web.zip`，Android APK 为 `seal-office-${version}-android.apk`，HarmonyOS HAP 为 `seal-office-${version}-harmony.hap`。
- Android / HarmonyOS 云服务返回的原文件名不由本仓库控制；下载后校验并以以上英文名归档，不修改包内应用身份、签名或内容。不把云打包源码快照称为已生成的 APK / HAP。
- Android 云打包源码 ZIP 和解压后的文件总大小均不得超过 60,000,000 字节。分别构建、检查、冻结 Android / HarmonyOS 源码后使用 `mobile/scripts/archive-source.mjs` 归档，拒绝混用平台资源；源码 ZIP 使用 `seal-office-${version}-android-cloud-source.zip` / `seal-office-${version}-harmony-cloud-source.zip`。
- 本机云打包交付只保留最新验收通过的 Android / HarmonyOS 各一个 ZIP 和解压项目。当前 2.2.0 的唯一入口为 `release/v2.2.0/mobile-web/android-cloud-source/`、`release/v2.2.0/mobile-web/harmony-cloud-source/` 及同级对应 ZIP；新源码逐文件验收后，清理旧试包、旧解压项目和 `mobile/unpackage/cloud-ready/` 中的历史及重复交付快照。历史报告和远端历史发行保留，更新版本目录的 `README.txt`，禁止继续指向已过期的 `verified/`。解压项目不加入说明附件或编译缓存；额外说明放在项目目录外，确保交付目录与 ZIP 文件清单和字节完全一致。
- 工作过程中生成的临时脚本、测试目录、源码暂存、解包副本和编译缓存，应在完成核验及正式归档后及时删除。只保留正式交付物、必要验收记录和用户原始文件；临时目录不得留作额外打包入口，不删除应用数据、签名凭据或用户未授权清理的文件。助手悬浮球在 Android / HarmonyOS 与桌面均使用海豹办公 Logo，移动端不能回退到通用星光图标。
- HarmonyOS 已签名 App Pack 使用 `seal-office-${version}-harmony.app`；仓库发行附件封装为 `seal-office-${version}-harmony.app.zip`。外层 App Pack 签名与内层 HAP 签名分别验证，不能把未独立签名的内层 HAP 当作可安装发行包发布。
- 程序界面、`productName`、Windows 内部主程序、安装目录与桌面快捷方式继续使用中文名“海豹办公”；Linux 原有 `sealoffice` 启动命令与应用身份保持不变。英文发行文件名不扩散到界面显示名。
- 微软商店 MSIX 清单中的 `Package/Properties/DisplayName` 和 `Application/VisualElements/DisplayName` 必须使用已保留的商店名 `seal-office`，商店身份及签名不变。
- 历史报告、归档和旧版本验收脚本保留原记录；新增发行使用新规则，不回写历史文件名或历史校验值。

# 打包目录与视频更新规则

- `release/` 顶层只保留 `promo/` 和当前 `package.json` 版本对应的 `v<版本>/` 一个版本目录。每次打包前执行 `npm run release:prepare`，清理本机旧版本产物目录；远端历史发行和仓库历史验收报告保留。
- EXE、便携包、MSIX、DEB、Web ZIP、移动云打包源码 ZIP、校验文件与解包目录都放在 `release/v<版本>/`；不得把安装包或额外平台目录放在 `release/` 顶层。发行包统一英文 `seal-office` 前缀。
- 每次正式发布同时更新两条介绍视频：横版 PC 为 1920×1080，竖版 Android 为 1080×1920，存入 `release/promo/`，文件名包含当前版本。清理旧视频及过期音轨、字幕、封面和录制中间件，不继续交付旧功能画面。
- 视频展示当前版本实际界面与已验证功能；配音、字幕和功能文案同步更新，记录素材来源、构建版本与 SHA-256。用手机尺寸录制 Android 布局；模拟原生宿主或浏览器素材须如实标注，不声称已完成 APK 真机验收。完整解码、画幅、音轨、字幕、时长和代表性画面检查通过后才交付。
- 介绍视频必须展示具体操作用法与执行结果，配鼠标点击圆环、逐字输入和当前目标区域的紫色光晕轮廓，不能用静态截图轮播替代操作录像。2026-10-23 用户试听确认使用 `zh-CN-XiaoxiaoNeural`、语速 `+5%`、音调 `+4Hz` 重录海豹办公文案（原样音 `D:/yewu/女声配音试听.mp3`）；不得自行回退到其他音色。用真实编辑器与隔离演示资料录制，标注层不拦截输入，不伪造功能结果。
- 可重复流程见 `docs/打包规范.md`。当前视频生成入口为 `npm run promo:build`，读取当前版本和最新分镜，禁止复用旧版本宣传脚本中的固定版本配置。
