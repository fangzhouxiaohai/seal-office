# Android 保存与 HarmonyOS 编辑区渲染修复

日期：2026-10-27。

## 1. Android 保存无法拉起文件管理器

### 现象

Android 编辑文档点“另存为”后底部只显示：

> 没有应用可执行此操作。

系统里明明有“文件”应用，但无法保存。

### 根因

`mobile/native/share.uts` 把保存和分享都实现成：

```java
Intent(Intent.ACTION_SEND)
```

`ACTION_SEND` 是“分享给其他应用”，不是“选择保存位置”。系统文件管理器通常不注册 ACTION_SEND 接收器，所以 chooser 没有目标。

HarmonyOS 使用的是 `DocumentViewPicker`，因此正常。

### 修复

Android 保存改为系统 SAF：

- `Intent.ACTION_CREATE_DOCUMENT`
- `CATEGORY_OPENABLE`
- `EXTRA_TITLE` 写入文件名
- `startActivityForResult(..., 42107)`
- `UTSAndroid.onActivityCallback` 接收 `onActivityResult`
- 用 `ContentResolver.openOutputStream(uri)` 把沙箱源文件写入用户选择的位置
- 取消返回 `cancel`，写入失败返回明确错误；仅写入成功后回报 `saved`

分享功能仍保留 ACTION_SEND，仅用于“导出/分享”，不再承担保存。

### 验证

- Android UTS 编译检查通过。
- 本机没有可用 Android 真机/模拟器，因此尚未做真实保存点击验证。
- 需要装新 APK 后确认：另存为 → 系统文件管理器 → 选择目录 → 保存成功 → 文件管理器中能打开。

## 2. HarmonyOS 编辑模式连续点击内容区域出现 React #185

### 复现

在 HarmonyOS 模拟器（Huawei nova 16 Ultra，API 26）中：

1. 打开“未命名文档.sldoc”
2. 切到“编辑”
3. 在正文区域连续快速点击/双击
4. 出现“页面加载失败 / 界面渲染出现异常”，错误为：

```text
Minified React error #185
Maximum update depth exceeded
```

Windows 和 Android 不出现。

### 根因

ArkWeb 在 contentEditable 的选中/布局变化期间会高频派发 `selectionchange`。`DocEditor` 原来在事件里同步执行：

```ts
document.addEventListener('selectionchange', 更新格式)
```

`更新格式` 会 `set选区显示格式`，React 提交更新又可能触发 ArkWeb 再次派发 selectionchange，形成同步嵌套更新，最终触发 React 的 #185 最大更新深度保护。

### 修复

`renderer/src/editor/DocEditor.tsx`：

- `selectionchange` 不再同步 setState，改为合并到下一帧 `requestAnimationFrame`
- 用序列化后的格式快照比较，格式未变化不更新
- 卸载时取消未执行的帧

这保留了格式工具栏的更新，同时切断了 ArkWeb 的同步重入循环。

### 真机/模拟器验证

- 在模拟器上复现了原错误。
- 修复后连续 200 次双击正文 + 150 次单击正文，未再出现 #185。
- HarmonyOS UTS 编译检查通过。
- 修复后的 `office.js` 已重新打入 HAP/App Pack；尚未做 Android 真机回归。

## 3. 当前交付状态

- 本次仍使用 `2.2.0 / 20200`，因为 2.2.0 尚未通过 AppGallery 审核；若商店已接收 2.2.0，需要改为 2.2.1/20201 后重新提交。
- HarmonyOS 新 App Pack 已在本机构建并安装到模拟器验证；Android 新 APK 需重新云打包。
- 源码仍是云打包源码，不是已签名安装包。
