# 海豹办公 2.1.2 横版功能短片

这是按用户指定配音声线制作的 36 秒横版功能宣传片，独立于 `npm run promo:build` 的常规双画幅介绍视频，不替代每次正式发布的两条标准介绍片。

## 交付

- 视频：[`seal-office-2.1.2-pc-feature-1080p.mp4`](../../release/promo/seal-office-2.1.2-pc-feature-1080p.mp4)
- 字幕：[`seal-office-2.1.2-pc-feature-1080p.srt`](../../release/promo/seal-office-2.1.2-pc-feature-1080p.srt)
- 封面：[`seal-office-2.1.2-pc-feature-1080p-cover.jpg`](../../release/promo/seal-office-2.1.2-pc-feature-1080p-cover.jpg)
- 联系表：[`seal-office-2.1.2-pc-feature-1080p-contact.jpg`](../../release/promo/seal-office-2.1.2-pc-feature-1080p-contact.jpg)
- 核验：[`seal-office-2.1.2-pc-feature-1080p-verification.json`](../../release/promo/seal-office-2.1.2-pc-feature-1080p-verification.json)

规格：1920 × 1080、30 fps、36.0 秒、1080 帧，H.264 High / yuv420p，AAC 48 kHz 立体声，整片响度约 -16 LUFS，附 7 段中文字幕和二维码。核验 JSON 记录成片、字幕、封面、联系表、界面截图、配音源文件与样音的 SHA-256。

## 配音说明

用户提供的 `D:\yewu\女声配音试听.mp3` 实际是**聚百果 ERP 的采购教学试听**（“100 箱苹果、每箱 20 元、合计 2000 元、审核后收货入库”），不是海豹办公文案。直接套用会出现画面讲办公、配音讲水果批发的错位。

经用户确认，采用**同声线重录**：使用与试听文件相同的 `zh-CN-XiaoxiaoNeural`、`+5%` 语速、`+4Hz` 音调，重新录制海豹办公 2.1.2 的 36 秒文案。交付视频中的解说**不是原 MP3 的原声**，原样音只作为声线、语速和音调的参考；原样音文件哈希见核验 JSON 的 `voice.sourceSampleSha256`。

## 文案

1. 海豹办公，把文字、表格、演示和常用工具，放进同一个工作区。
2. 最近文件集中查看，打开的多份文档随时切换。
3. 文字排版、表格公式、演示模板，都保留可编辑的内容和格式。
4. 脑图和流程图分别管理项目；
5. 四种海豹专属格式，在电脑、网页和移动端统一识别。
6. 登录已验证的手机号账号，就能安全使用生成式 AI。
7. 访问网页版，或下载适合你的版本。

## 画面来源

- 界面来自海豹办公 **2.1.2 生产 Web 构建**（`mobile/unpackage/web`，`desktopVersion=2.1.2`）在隔离 Electron 配置中的 1920 × 1080 实测截图，不是旧版素材。
- 录制的首页、文字、表格、演示模板、脑图、账号登录等画面保存在 `release/promo/work-2.1.2-short/`，`capture.json` 记录每张图的构建信息、来源与 SHA-256。
- 演示文档、表格和脑图项目由采集脚本生成，使用本机隔离配置；未登录真实账号、未上传文件、未调用模型服务。
- 片中“四种专属格式”页是设计说明页，文案依据仓库现有 `.sldoc`、`.slxls`、`.slppt`、`.spdf` 规则，不是伪造的软件界面。
- 二维码指向 `https://seal.xingmasoft.com/office/`，成片核验时实际解码通过。

## 复现

在仓库根目录执行：

```powershell
npm run web:build
$env:ELECTRON_RUN_AS_NODE=$null
.\node_modules\.bin\electron.cmd scripts\promo\short-capture.cjs
python scripts\promo\short-voice.py
python scripts\promo\render-short-promo.py
```

`short-capture.cjs` 需要先完成当前版本的 `web:build`，会校验 `build-info.json` 的 `desktopVersion` 与 `package.json` 一致。`short-voice.py` 使用 edge-tts 重新合成同声线文案；如果重跑，需重新执行 `render-short-promo.py` 以保持音画和校验值一致。

## 检查

`render-short-promo.py` 在编码后执行以下检查并写入核验 JSON：

- 1920 × 1080、30 fps、1080 帧、36.0 秒；
- 视频与音频完整解码；
- AAC 48 kHz 立体声；
- 整片响度在 -17.5 至 -14.5 LUFS，真峰值不高于 -0.5 dBTP；
- 场景切换边界亮度，避免黑帧闪烁；
- 片尾二维码实际解码为 `https://seal.xingmasoft.com/office/`；
- SRT 共 7 段，时间不重叠且不超过片长；
- 成片、字幕、封面、联系表、界面截图和配音文件的 SHA-256。

视觉复核：查看 `-contact.jpg` 的 12 个代表画面，以及结尾二维码帧。
