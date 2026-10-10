# 安卓版界面原型操作教程

版本 1.9.10，唯一横版为 1920×1080、30 fps。讲解稿和 21 个章节见 [storyboard.json](storyboard.json)。使用项目原有 Microsoft Edge TTS 依赖，选择 `zh-CN-XiaoxiaoNeural` 温暖普通话女声，语速略慢；配音有逐词时间记录。视频中不使用数字人、不调用产品模型服务，也不读取用户文档与账号。

界面来自 `mobile/unpackage/web/` 的真实生产构建，420×840 手机布局，在离屏 Chromium 中操作。它和安卓包共享编辑器，画面标注“安卓版界面原型”；尚未交付的新云 APK、系统文件选择器、权限与原生键盘没有录制。示例文件选择固定指向独立演示存储中的文件，编解码、保存、编辑与菜单操作走真实应用。在线云空间和识图展示入口与配置条件，没有模拟在线成功结果。

在仓库根目录执行以下命令。预览服务器只读取生成的移动 Web 文件，录制脚本默认使用 `http://127.0.0.1:5194/`，可以通过 `SEAL_TUTORIAL_URL` 指定已运行的本机预览地址。

完成 `npm run web:build` 后，另开一个终端执行 `node scripts/promo/mobile_preview.cjs`，保持服务运行。再在原终端执行配音、录制和合成命令。

```powershell
npm ci
npm --prefix mobile ci
npm run web:build
python -m pip install -r scripts/promo/requirements.txt
python scripts/promo/mobile_audio.py
npm exec electron -- scripts/promo/mobile_record.cjs
python scripts/promo/mobile_render.py
```

录制和配音工作目录为已忽略的 `release/promo/mobile-v1.9.10/`。成品、封面、SRT 和核验报告放在 `release/promo/`。合成工具只生成横版，字幕烧录进画面并另附 SRT，MP4 含可跳转的章节。核验包括尺寸、帧率、全部章节与字幕时间范围、画面和音轨完整解码、响度与文件 SHA-256。源码和检查拼图纳入 Git，成品上传同版本 GitHub Release。

教程用于日常操作入门；文件格式导入范围、真实云服务及各品牌 ROM 的验证边界见 [移动兼容性记录](../../../mobile/compatibility.md)。
