# 海豹办公 2.1.2：移动助手 Logo 修复正式包

本次为 2.1.2 / 20102 的移动端补充发行，Android 与 HarmonyOS 助手悬浮球统一使用海豹办公 Logo。保留原应用身份、版本号和签名；已安装用户按平台规则更新。

- Android：`seal-office-2.1.2-android.apk`。
- HarmonyOS：`seal-office-2.1.2-harmony.app.zip`，解压得到外层已签名 App Pack，供应用市场提交；不发布未独立签名的内层 HAP 作为可安装包。
- 云打包源码按 Android / HarmonyOS 分别冻结，不能交换平台资源。Android ZIP 38,531,181 字节，干净解压后 59,799,953 字节，均小于 60,000,000 字节。
- APK 与 App Pack 内 28 项编辑器资源逐字节匹配对应最新源码，均包含 Logo 修复。Android APK v3 签名、既有证书与 16 KiB 对齐通过；HarmonyOS 外层 App Pack 签名通过。签名文件内容未修改。
- 源码阶段已通过助手 36 项单元测试、两平台共 88 项生产页面检查及两端原生编译。返回成品验证上述相同资源，不将旧测试说成此次重新运行。
- 雷电中已核对安装包哈希、看到海豹 Logo 并观察到拖动位移。随后 ADB 断开，未宣称完成全部原生触摸流程；未完成 Android / HarmonyOS 真机验收。
- 附最新版 PC 横版与 Android 竖版介绍视频、封面、字幕及验证报告。素材为生产浏览器布局演示，安卓视频不是 APK 真机录屏。

[网页版](https://seal.xingmasoft.com/office/) · [Windows / Linux / MSIX 2.1.2](https://github.com/fangzhouxiaohai/seal-office/releases/tag/v2.1.2)

原 `v2.1.2` 与 `v2.1.2-mobile-web` 发行、标签和历史校验记录保留。附件校验见 `SHA256SUMS.txt`。

验收文件：`android-package.json`、`harmony-package.json`、`android-runtime.json`、`verification.json`、`promo.json`。

发行已完成：[GitHub](https://github.com/fangzhouxiaohai/seal-office/releases/tag/v2.1.2-mobile-logo)、[GitCode](https://gitcode.com/gcw_pGfMiWVg/seal-office/releases/v2.1.2-mobile-logo)。每仓库 18 个附件，全部 36 次匿名下载的大小及 SHA-256 验证通过，见 `publication.json` 及两个仓库的逐附件记录。原有两个发行的附件清单保持不变。

PC 横版及 Android 竖版视频已更新并随发行提供。B 站尚未投稿：用户确认两浏览器已登录并启用扩展后，当前任务仍只能发现空的 Codex MCP Apps，分别尝试连接 Edge 与 Chrome 均返回浏览器不可用。未读取浏览器凭据，也未提交任何 B 站稿件；两条视频的标题、简介、封面与路径见 `bilibili-submissions.json`，待浏览器控制连接恢复。
