# 2.2.0 字体适配、桌面与移动云源码验收

日期：2026-10-26。本次版本从 2.1.2 升至 2.2.0 / 20200；应用 ID、Windows 中文产品名、Linux `sealoffice` 身份和桌面签名配置未改。HarmonyOS 发布证书/Profile 于同日切换到新主体，见 [HarmonyOS 签名配置切换](harmony-signing-config.md)。

## 功能范围

| 能力 | 实现 | 回归 |
| --- | --- | --- |
| 桌面系统字体 | 主进程扫描 Windows/macOS/Linux 字体目录，解析 TTF/OTF/TTC，拆出 TTC 单字面 | `main/fonts/fontMeta.test.js`、`fontService.test.js`；真实 Windows 开发运行扫描到 569 个字面 / 293 个显示家族 |
| 自定义字体 | 设置中心导入、移除、重新扫描、打开目录；字体不写入系统字体库 | 服务层导入/去重/读取/删除测试；真实桌面 UI 设置卡片与字体下拉框检查 |
| 字体选择器 | 可搜索、分组、字形预览、导入/管理入口；文字、表格、演示接入 | `FontPicker.test.tsx`；真实 Chromium 打开下拉、搜索仿宋并应用 |
| 专属格式字体嵌入 | 保存 `.sldoc/.slxls/.slppt` 时写入实际使用、授权允许的完整字体；打开时先注册 | `sealFormat.test.js` 容器/指纹校验；`fontManager.test.ts` 保存与再次保存；真实 `.sldoc` 内嵌仿宋 10,578,152 字节 |
| DOCX/WPS 回退 | 保留来源字体名并追加 Noto/系统通用字体回退；表格/演示渲染同用回退链 | 常用公文字体映射单测、DOCX 水印字体回退测试 |
| 移动字体 | Android/HarmonyOS/Web 导入到应用沙盒；HarmonyOS 原生枚举系统字体；Android/Web 提供通用族 | 移动公共逻辑 39 项；Android、HarmonyOS UTS 原生编译检查 |

## 自动化结果

- 主进程：113 个测试文件、1,095 项通过。
- 移动：39 项，38 项通过，1 项因缺少私有 BIFF 样本跳过。
- 字体专项：`fontMeta` 3 项、`fontService` 2 项、`fontManager` 3 项、`FontPicker` 1 项；容器字体校验包含在 `sealFormat` 10 项中。
- 渲染层变更相关最终回归：`AllControls` 23 项、`DocEditorFloat` 7 项、`SheetViews` 24 项、`FontPicker` 1 项、`fontManager` 3 项、表格/演示命令 35 项，共 93 项通过。
- 全量渲染层首轮运行暴露 3 个旧断言文件仍按旧的字体下拉菜单/无回退字面量断言；这些断言已随 2.2.0 行为更新（`AllControls`、`DocEditorFloat`、`SheetViews`），更新后的 54 项单独通过。首轮其余已执行文件未出现失败；未等待整轮完整重跑结束，不把该次中断的运行计为全量通过。
- TypeScript 桌面/移动检查通过；打包测试 11 项通过。
- Android / HarmonyOS UTS 编译与安装包内静态资源检查通过。

## 真实运行与容器检查

开发构建实际执行：

1. 打开空白文字文档，字体下拉显示 293 个系统家族。
2. 搜索并选择“仿宋”，选中正文后应用，HTML 记录 `font-family: 仿宋`。
3. 通过系统保存对话框另存 `test-font.sldoc`。
4. 解包检查：`字体资源` 含仿宋字体 10,578,152 字节、SHA-256 指纹，文件总大小 7,221,388 字节；页面设置与正文保留。

成品静态检查：

- Windows 与 Linux 的 `app.asar` 均与最终工作区完整性清单一致（142 个文件，分别 26,347 / 26,343 个归档条目）。
- 成品编解码验收在 Windows app.asar 上通过：完整性、四种专属格式两轮保存重开、DOCX/XLSX/PPTX/PDF、字体资源保留。
- Windows `win-unpacked/海豹办公.exe` 实际启动，主窗口标题为“海豹办公”；随后关闭进程，不把启动冒烟当作完整 UI 验收。
- DEB 结构与中文桌面入口、SUID sandbox、app.asar 哈希检查通过；没有在 Windows 主机上执行 Linux 安装/UI 测试。

## 桌面产物

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `seal-office-setup-2.2.0.exe` | 422,991,762 | `c4acff9fab6dedacdfd61a4c8173644efa07aba0c308a84e26b974dd0528c98b` |
| `seal-office-2.2.0-portable.exe` | 422,766,284 | `5a09a52e941cb9443cb847717ebe8de5eb9f680d9bad2084918742ec882bc529` |
| `seal-office-2.2.0-microsoft-store-x64.msix` | 770,032,863 | `aa64796c39607212debd2a1d3158d875eb59a92b20426885f1fbc5afd187277b` |
| `seal-office-2.2.0-amd64.deb` | 141,978,360 | `b32fdc4e7a6d956fce7e21a6066bdd6bc88338568945d31251e2b98ccd890d3d` |

MSIX 身份为 `45C56666.seal-office`、Publisher `CN=F6431C2A-EA55-468A-89D8-890511FCADF7`、版本 `2.2.0.0`、x64；显示名保持 `seal-office`，与 AppxManifest、AppxBlockMap（19,585 个文件分块）、app.asar 和外置字体一致。三个 Windows 文件的本机 Authenticode 状态均为 `NotSigned`；MSIX 是未签名商店上传包，未做安装或 Store 认证，不能把签名状态写成已签名。

## 移动云源码

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `seal-office-2.2.0-android-cloud-source.zip` | 38,551,870 | `209863b26b4bc8d565b3c37ca5c500a7f4de82b5403b6be22119881971559a51` |
| `seal-office-2.2.0-harmony-cloud-source.zip` | 38,551,876 | `337d4179c36b931de3112b865511f300a4d9cf9c0fc7329b0a426daf9fba3cb3` |

两个解压项目各 59,880,044 字节（Android 低于 60,000,000 字节上限，余量约 119,956 字节）；ZIP 全部条目 CRC 与 SHA-256、快照 `snapshot-info.json`、`static/office/build-info.json` 平台标识、完整字体字节已核对。`archive/` 内没有 APK/HAP，不把源码称为成品。本次因修复鸿蒙原生网络状态码丢失并写入新主体签名配置而重新冻结，版本仍为 2.2.0 / 20200。

HarmonyOS 云打包签名配置：新证书 `cer/seal-office-release-20261023.cer`、新 Profile `cer/seal-office-release-20261023Release.p7b`、原私钥库和别名 `sealoffice-release`；证书 SHA-256 `9C1A6D76D4F18367FE1A8D5DD4D7EE71E201DF04F6CA055A56883528458DCECB`，Profile App ID `6917619858054370422`。详细核对、旧配置差异和 HBuilderX 操作见 [HarmonyOS 签名配置切换](harmony-signing-config.md)。

## 鸿蒙网络修复

- Android 可正常取验证码，HarmonyOS 返回“网络连接失败，请检查网络后重试”；原因是 Harmony 的 `uni.request` 适配层在失败时进入 `success` 且 `statusCode` 为 0，真正的网络错误被吞掉。
- 修复后在 HarmonyOS 使用系统 `@ohos.net.http`：普通请求读取真实 `responseCode/header/result`，流式请求使用 `requestInStream` 的 headers/data 事件；JSON 请求体改走字符串，不再强转 `ArrayBuffer`。
- 旧 APK/App Pack 构建早于本修复，已移到 `.upgrade-private/release-archive/v2.2.0-native-pre-harmony-http-fix/`，不能作为最终包。
- 本轮没有重新云打包，也没有鸿蒙真机点击验证；详细复现、错误码和复测步骤见 [鸿蒙登录网络错误修复](harmony-network-fix.md)。

## AppGallery 审核修改

- 附随 14 秒录屏是登录故障复现，不是介绍视频；其 SHA-256、逐帧分析和根因见 `docs/verification/v2.2.0/appgallery-review-fix.md`。
- `mobile/web/native.ts` 已拒绝 0/非法 HTTP 状态并显示中文网络提示；HarmonyOS 进一步改为系统 `@ohos.net.http`，不再依赖会吞状态的 `uni.request`；回归测试 2/2 通过。
- 新 4 张 1080×1920 截图位于 `build/store-assets/mobile-v2.2.0/`，其中 04 含画面内“AI 生成内容”标识；旧 2.1.2 带手机外框截图不再使用。
- 新一句话简介、完整描述、更新说明和审核说明位于同目录 `listing-zh-CN.md`。

## 边界与未完成项

- 第三方 DOCX/WPS 字体未随文件携带；缺少专用字体时只能回退并提示。专属格式只有在源字体文件可读取、`fsType` 允许嵌入且总量不超过 56 MiB 时才能携带完整字体。
- 已生成 Android APK 和 HarmonyOS 已签名 App Pack，但未做真机字体导入、字体渲染、系统字体枚举、安装启动或商店审核验收；HarmonyOS 官方 hap-sign-tool 验签仍未执行。
- macOS / Linux 系统字体解析代码已覆盖，但未在对应真机运行；Linux DEB 未在 Ubuntu 上安装。
- 本版本没有重制 PC / Android 介绍视频。`release/promo/` 已清空到历史私有归档，不能把旧视频当作 2.2.0 功能演示。
