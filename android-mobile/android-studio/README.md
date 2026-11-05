# 海豹办公 Android Studio 原生宿主

此目录是 Java 编写的安卓安装工程。它从仓库的 `mobile/static/office/` 打包完整工作台，使用本机 Android SDK 构建，不经过 HBuilderX 云打包。原有 HBuilderX 工程仍保留在 `android-mobile/` 根目录；鸿蒙工程仍由 `harmony-mobile/` 管理。

## 本机测试包

先在仓库根目录生成当前安卓工作台资源，再进入本目录构建：

```powershell
npm --prefix mobile run build:android
cd android-mobile/android-studio
.\gradlew.bat testDebugUnitTest assembleDebug
```

测试包位于 `app/build/outputs/apk/debug/app-debug.apk`，应用身份为 `com.sealoffice.mobile.nativeqa`，显示名为“海豹办公测试”，可与旧版并存，不覆盖旧版数据。首次构建需要联网下载 Gradle 和安卓依赖；之后本地重复构建无需云打包等待。模拟器回归脚本：

```powershell
$env:ANDROID_ADB = '安卓 SDK 的 platform-tools/adb.exe 绝对路径'
node scripts/emulator-smoke.cjs
```

脚本验证启动握手、原生剪贴板、匿名分享页联网、文件导入及保存选择器的取消回传，以及五个主导航页单次返回系统桌面。加入 `--verify-storage --verify-import` 可核对旧版文件来源的本地存储读写，以及系统选择器实际导入的文件字节。安卓系统启动画面保持到工作台实际绘制完成，使用带留白的圆形标识和“海豹办公”名称；安卓宿主隐藏网页加载标识，不再叠加第二张启动页。模拟器录屏帧见 `docs/verification/v2.7.0/android-startup-circle.png` 与 `android-startup-home.png`。

在 1080×1920 的本机模拟器上，`--verify-import` 通过系统选择器选取隔离测试文件，核对原生回传的文件名和字节，并清理测试文件。该选项依赖模拟器的系统选择器布局；文件实际导出仍需目标设备验收。

## 正式升级包的签名门槛

正式版沿用 `com.sealoffice.mobile`、`2.7.0` 和构建号 `20700`。已取得旧版 Android 签名文件，别名为 `__uni__b52b65b`；旧版 APK 与本机签名包的证书 SHA-256 均为 `53b13e1c76a826eb15879061e8840d9bc051156ff9ed33530339f444cd3997ad`。`assembleRelease` 在缺少签名或证书指纹不一致时失败，不会产出无法覆盖旧版的正式安装包。签名文件位于仓库外，口令只通过本机交互输入传给构建进程。

在本机环境变量中设置 `SEAL_ANDROID_KEYSTORE`、`SEAL_ANDROID_STORE_PASSWORD`、`SEAL_ANDROID_KEY_ALIAS`、`SEAL_ANDROID_KEY_PASSWORD`，再运行 `.\gradlew.bat verifyReleaseSigning assembleRelease`。签名文件和密码不得提交到仓库。用 `python scripts/verify-apk.py app/build/outputs/apk/release/app-release.apk` 核对内置资源，再用安卓签名工具核对证书。新版保持旧版完整 `file:///android_asset/apps/__UNI__B52B65B/www/static/office/index.html` 路径，避免因切换来源使本地存储不可见；隔离克隆设备已验证旧文档覆盖安装、保存和重开。

在原有模拟器的隔离克隆设备上，先打开旧版中的文档，再覆盖安装同签名的 Java 原生候选包；原文档正文保持，保存后重启应用仍能重开。Java 工程、网页资源和原有 HBuilderX 工程彼此独立。调试包不是正式升级包，不能以调试包替换发行页的安卓版附件。
