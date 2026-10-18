# 仓库打包命名规则

- 按用户最新要求，今后的发行包文件名统一使用英文 `seal-office` 前缀。版本号使用当前项目版本，不因命名变更修改版本、应用 ID 或签名。
- 统一命名模板见 `build/artifact-names.json`：Windows NSIS 为 `seal-office-setup-${version}.exe`，Windows 便携包为 `seal-office-${version}-portable.exe`，Ubuntu DEB 为 `seal-office-${version}-amd64.deb`，Web 为 `seal-office-${version}-web.zip`，Android APK 为 `seal-office-${version}-android.apk`，HarmonyOS HAP 为 `seal-office-${version}-harmony.hap`。
- Android / HarmonyOS 云服务返回的原文件名不由本仓库控制；下载后校验并以以上英文名归档，不修改包内应用身份、签名或内容。不把云打包源码快照称为已生成的 APK / HAP。
- HarmonyOS 已签名 App Pack 使用 `seal-office-${version}-harmony.app`；仓库发行附件封装为 `seal-office-${version}-harmony.app.zip`。外层 App Pack 签名与内层 HAP 签名分别验证，不能把未独立签名的内层 HAP 当作可安装发行包发布。
- 程序界面、`productName`、Windows 内部主程序、安装目录与桌面快捷方式继续使用中文名“海豹办公”；Linux 原有 `sealoffice` 启动命令与应用身份保持不变。英文发行文件名不扩散到界面显示名。
- 微软商店 MSIX 清单中的 `Package/Properties/DisplayName` 和 `Application/VisualElements/DisplayName` 必须使用已保留的商店名 `seal-office`，商店身份及签名不变。
- 历史报告、归档和旧版本验收脚本保留原记录；新增发行使用新规则，不回写历史文件名或历史校验值。
