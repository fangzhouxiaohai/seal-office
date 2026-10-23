# 2.1.2 移动助手海豹 Logo 修复

本轮修复移动助手悬浮球仍显示通用星光图标的问题。原因是 `MobileAssistantLauncher.tsx` 原先只在 `desktop` 分支渲染 `SealLogo`，移动分支继续渲染 `Icon name="ai"`。本次用户提供的 Android APK 内编辑器指纹为 `e2f3a5ed4bb7103878f6f17d6fe779f4c656e947364961579d40e953466ce2b7`，与此前移动/Web 同步源码一致；这次图标问题来自漏改移动分支。

现在所有助手悬浮球共用项目已有的海豹办公品牌 SVG，沿用现有圆形按钮、大小、配色和拖动逻辑。品牌图形不拦截 Pointer Events，按钮保持可访问名称、键盘移动和点击打开行为。桌面本来已经使用该 Logo，桌面显示和交互保持一致。

Android、HarmonyOS 继续独立构建、原生 UTS 编译、生产浏览器回归、冻结和归档。生产浏览器检查实际渲染的品牌图形，触摸从图形中央开始，验证拖动不误触、位置持久化、点击大弹窗、目标文件选择、对话/工作模式和无文件限制；原有阅读、编辑、脑图/流程图和格式编辑检查一并执行。实际结果及构建指纹见 [verification.json](verification.json)，两端云源码完整清单分别见 [android-source.json](android-source.json)、[harmony-source.json](harmony-source.json)。

最新版在本机仍只有两个固定交付项目，HBuilderX 直接打开：

- Android：`E:/seal-office/release/v2.1.2/mobile-web/android-cloud-source/`。
- HarmonyOS：`E:/seal-office/release/v2.1.2/mobile-web/harmony-cloud-source/`。

对应的 `seal-office-2.1.2-android-cloud-source.zip`、`seal-office-2.1.2-harmony-cloud-source.zip` 在同级目录；版本仍为 2.1.2 / 20102，应用身份和签名配置沿用。Android ZIP 与干净解压项目均按 60,000,000 字节限制校验。旧交付源码和重复暂存项目在新包逐文件验收后清理，历史报告与远端历史发行保留。临时脚本、测试浏览器目录和编译缓存收尾时清理，不能留下第二个打包入口。

本次交付是修正后的云打包源码，不代表已生成新的签名 APK / App Pack，也不代表已完成新包真机验收。用户本次返回的包属于 Logo 修复之前的构建，没有作为 Logo 修复成品发布；需要用本次新源码重新云打包。原始 Android 下载文件没有改写，鸿蒙保留副本的签名字节也没有修改。

最终验收通过：助手单元测试 36 项，Android / HarmonyOS 各 7 组、44 项生产检查，两端原生源码编译通过。每个平台相较前一份源码仅有编辑器脚本、构建元数据和快照清单三个文件变化，其余 56 个文件字节完全相同，完整字库和原生宿主源码保留。两个新 ZIP 实际解压后的全部文件均逐一核验。

收尾已删除 8 个临时目录及 12 个旧临时文件，涵盖旧交付暂存、重复快照、测试浏览器数据和原生编译缓存，当前只保留两个固定交付项目及其 ZIP。必要验收记录保存于本目录，用户签名成品保留副本与签名凭据没有删除。见 [清理记录](cleanup.json)。实际生产布局截图：[Android 悬浮球](android-assistant-logo.png)、[HarmonyOS 悬浮球](harmony-assistant-logo.png)，均为隔离浏览器宿主截图，不声称是新 APK / App Pack 真机截图。
