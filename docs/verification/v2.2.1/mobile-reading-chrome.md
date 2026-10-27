# 移动端 2.2.1 阅读工具栏与 Android 保存修复

日期：2026-10-28。

## 变更

- 全屏阅读顶部改为两行：第一行只显示文件名，第二行只放图标工具。
- 顶部工具包含返回、阅读模式切换、缩小、缩放百分比、放大；按钮不再显示“返回、连续阅读、左右翻页”等文字。
- 底部翻页工具栏同步改为图标按钮，只保留数字页码，不再显示“上一页/下一页/按屏重排”等文字，释放正文高度。
- 所有工具保留中文 `aria-label` 与 `title`，读屏和长按提示仍可理解。
- Android SAF 保存的复制缓冲区改为 `ByteArray(65536)`，修复云端 Kotlin `Uint8Array` 与 `ByteArray!` 类型不匹配导致的打包失败。

## 验收

- `npx vitest run renderer/src/editor/DocEditorReading.test.tsx`：4 项通过。
- `npm run typecheck`：通过。
- Android 云打包：2.2.1 / 20201 成功，APK 签名 v3 验证通过，内嵌编辑器哈希与冻结源码一致，16 KiB 原生库对齐检查通过。
- HarmonyOS：签名 App Pack 验证成功；内层 HAP 身份/版本/CRC/编辑器哈希通过。
- 当前没有连接 Android 真机或 HarmonyOS 设备，未做安装启动截图验收。

## 成品

- `release/v2.2.1/seal-office-2.2.1-android.apk`
- `release/v2.2.1/seal-office-2.2.1-harmony.app`
- `release/v2.2.1/seal-office-2.2.1-harmony.app.zip`
- `release/v2.2.1/mobile-web/seal-office-2.2.1-android-cloud-source.zip`
- `release/v2.2.1/mobile-web/seal-office-2.2.1-harmony-cloud-source.zip`
