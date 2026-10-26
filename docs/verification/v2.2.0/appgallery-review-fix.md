# 2.2.0 AppGallery 审核修改记录

日期：2026-10-26。

## 1. 随附录屏不是介绍视频

用户随附文件：`bf328fbac2844b16b3bae07604f7c26b.mp4`
SHA-256：`d95a30581ecd2b4c05d2378f8ad6dacc56c4c8f8f17b314ffd35abb9392716cb`

只读分析结果：

- 1256×2760，H.264，14 秒，60 fps。
- 音轨为 AAC，但整段音量约 -91 dB，实际无声。
- 画面是手机桌面和一个网页登录页的录屏，没有展示文字、表格、演示或 PDF 的真实编辑流程。
- 登录页在输入手机号后显示：
  `Failed to construct 'Response': The status provided (0) is outside the range [200, 599].`
- 画面还带有系统录屏悬浮控件。该文件不能作为应用介绍视频上传。

结论：这是故障复现，不是介绍视频。正式提交必须是修复后重新录制的真实操作视频，不能把该文件剪辑后继续使用。

## 2. 根因与修复

原生宿主在网络请求未取得 HTTP 响应时向 WebView 回传 `status: 0`。`mobile/web/native.ts` 直接把 `0` 传给 `new Response(..., { status })`，浏览器抛出英文 `DOMException`，登录表单原样显示：

> Failed to construct 'Response': The status provided (0) is outside the range [200, 599].

修复：

- `begin()` 只接受整数 `200–599`；`status` 为 `0`、缺失到非法范围时，统一按网络失败处理。
- `headers` 和 `end` 两条事件路径都覆盖，避免 `end` 在分块之后再次构造非法响应。
- 错误文案改为 `网络连接失败，请检查网络后重试`。
- 增加 `headers status: 0` 与 `end status: 0` 两个回归场景。

验证：

```text
node --test mobile/tests/native-request.test.mjs
# 2 tests, 2 passed
```

## 3. 本次 AppGallery 页面问题

页面显示仍在修改 **2.1.2 新版本**，与当前源码/云打包版本 **2.2.0 / 20200** 不一致。旧的四张截图带手机外壳，画面停留在 1.9.15 时期的界面，且没有 AI 生成内容标识；不能继续用在 2.2.0。

提交前必须在 AGC 页面：

1. 将版本名称改为 `2.2.0`，版本号改为 `20200`（以新云打包实际清单为准）。
2. 删除旧的四张 2.1.2 截图和故障录屏。
3. 在“竖屏截图”上传新的四张 1080×1920 PNG。
4. 更新一句话简介和完整描述，使用 `build/store-assets/mobile-v2.2.0/listing-zh-CN.md`。
5. 重新录制介绍视频：只录真实编辑、保存、重开和导出，不出现登录失败、个人手机号或系统通知。

## 4. 新截图

目录：`build/store-assets/mobile-v2.2.0/`

| 文件 | 画幅 | 内容 |
| --- | --- | --- |
| `01-移动文字编辑-1080x1920.png` | 1080×1920 | 真实文字编辑器与公文字体示例 |
| `02-表格与数据-1080x1920.png` | 1080×1920 | 真实工作表、公式栏与单元格数据 |
| `03-办公服务-1080x1920.png` | 1080×1920 | 真实办公服务入口 |
| `04-AI助手-1080x1920.png` | 1080×1920 | 智能助手页面与明确的“AI 生成内容”标识 |

共同要求核对：

- 4 张，符合 3–5 张要求；1080×1920，9:16；PNG RGB，无 alpha；单张 169,614–306,516 字节，低于 5 MB。
- 无手机外壳、刘海、系统状态栏、通知图标、录屏悬浮控件。
- 无真实手机号、账号、个人文件；文档和表格为合成演示数据。
- 基于 2.2.0 移动 Web 构建的真实界面，先以 540×960 CSS 视口、2× 设备像素比截取，再加标题和品牌边框。没有伪造应用功能或 AI 输出。
- 04 图卡片右上角有红色“AI 生成内容”标识，页脚写明“AI 生成内容均显示‘AI生成’”；应用内 AI 回复继续显示“AI助手（AI生成）”和“本内容由AI生成”。

原始截图：`build/store-assets/raw-v2.2.0/`
生成脚本：`python scripts/build-appstore-screenshots.py`
清单：`build/store-assets/mobile-v2.2.0/screenshots.json`

说明：本次没有 Android/HarmonyOS 真机；截图来自移动 Web 布局，不是 APK/HAP 真机截图。不得在审核材料中写成真机验收。

## 5. AI 内容合规

- 应用内 AI 助手消息标题为“AI助手（AI生成）”，每条回复底部显示“本内容由AI生成”。
- AI 助手需要登录并完成短信验证；未登录时不生成内容，不伪造示例回复。
- 截图的 AI 标识是画面内的静态标识，不是只在描述中说明。
- 介绍文字明确说明 AI 输出可能不准确，请核对后使用。
- 介绍视频不得用后期生成的假 AI 回复冒充实际功能。

## 6. 云打包源码

网络修复后重新冻结并归档：

- Android：`seal-office-2.2.0-android-cloud-source.zip`
- HarmonyOS：`seal-office-2.2.0-harmony-cloud-source.zip`
- 解压项目：`release/v2.2.0/mobile-web/android-cloud-source/`、`harmony-cloud-source/`

源码 ZIP 不是 APK/HAP。需分别用 HBuilderX 提交云打包，下载后验签、校验内置资源和哈希，再做真实设备验收。

## 7. 参考资料

- [AppGallery 应用审核 AIGC 标识 FAQ](https://developer.huawei.com/consumer/jp/doc/app/50111-10#h1-1758875947267-8)
- [AppGallery 素材规范](https://developer.huawei.com/consumer/cn/doc/doccenter-submission/agc-help-app-visual-asset-spec-0000002277607976?docScope=all)
- [人工智能生成合成内容标识办法](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm)
