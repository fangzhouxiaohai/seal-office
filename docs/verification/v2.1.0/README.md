# 2.1.0 发行验收

总入口为 [verification.json](verification.json)。报告只覆盖实际执行的检查；历史 2.0.0 验收文件保留原记录。

| 范围 | 记录 |
| --- | --- |
| 完整渲染层、主进程、服务端、移动与打包回归 | [完整验收](verification.json) |
| PC / 移动浏览器和新账号、专属格式流程 | [Web](web-browser.json)、[Android IIFE](mobile-android-browser.json)、[Harmony IIFE](mobile-harmony-browser.json)、[新增功能](new-features-browser.json) |
| 脑图与流程图的个人/团队实时协作 | [六组浏览器协作矩阵](diagram-collaboration.json) |
| Windows 解压成品与便携成品三轮启动、保存重开 | [运行检查](windows-runtime.json) |
| EXE 安装包与已运行成品内容对应 | [NSIS 有效负载](windows-nsis.json) |
| MSIX 清单、CRC、块摘要、全部文件与成品逐个 SHA-256 | [微软商店包](msix.json) |
| 桌面双平台源码与最终构建对应、DEB 元数据与负载 | [成品完整性](desktop-artifacts.json)、[DEB](linux-deb.json) |
| Office、图片、公式、真实修订、多轮保存和 PDF | [成品编解码](packaged-codecs.json) |
| 账号注销与受限 root 工作进程隔离验证 | [备份清理探针](erasure-worker-probe.json) |
| 后端能力、既有数据和服务、公开 Web 浏览器验收 | [后端部署](backend-deployment.json)、[公网 Web](public-web.json) |
| 两条当前介绍视频 | [视频、音轨、字幕与独立画面复验](promo.json) |
| Android/Harmony 冻结云打包源码 ZIP | [源码快照、归档字节与 SHA-256](cloud-sources.json) |
| 验收与打包所用源码指纹 | [冻结输入](source-inputs.json) |

Windows 运行检查使用独立用户数据和测试注册表，不修改用户受保护的默认程序。NSIS 安装器以提取负载方式校验，另对相同解压成品与便携成品执行真实启动。MSIX 是未签名的微软商店上传包，没有安装或提交商店审核。

Android/Harmony 交付为各自冻结的云打包源码，版本 2.1.0、构建号 20100，尚未生成本版 APK/HAP。移动浏览器覆盖真实生产构建和模拟宿主桥接；本轮海豹办公新版原生 APK 没有安装到设备或模拟器。WPS APK 则已通过 REA 安装到雷电并观察实际界面，详见 [WPS 分析范围](../../WPS_ANDROID_REFERENCE_2.1.0.md)。Linux 本机仅完成静态包检查，安装后 GUI 验证由 Ubuntu CI 单独执行。

视频是最终 Web 与 Android IIFE 界面的实录静帧剪辑，含普通话配音、中文字幕和转场。Android 画面明确标注移动布局演示，不能当作 APK 真机录屏。未知复杂格式仍保留兼容提示，不以有限样本宣称完全等价兼容 WPS。
