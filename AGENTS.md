# 仓库打包命名规则

- 微软商店 MSIX 包是唯一例外：清单中的 `Package/Properties/DisplayName` 和 `Application/VisualElements/DisplayName` 必须使用已保留的商店名 `seal-office`。
- 除非用户另有明确说明，Windows NSIS 安装包、Windows 便携包、Android APK、Ubuntu DEB 以及程序界面均使用中文名“海豹办公”。
- 不得把 MSIX 专用的 `seal-office` 显示名扩散到其他平台的包、快捷方式或程序界面。
