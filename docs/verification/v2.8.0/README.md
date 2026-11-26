# 海豹办公 2.8.0 打包与发布验收

本记录覆盖 2.8.0 各端成品构建、校验、后台部署与发布验收的实际执行结果。所有数值均来自本机命令输出与已归档报告，未做估算。

## 一、构建环境

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows 11（10.0.22631） |
| Node.js | 24.21.0 |
| Java | 17.0.20.1（`JAVA_HOME=E:\Applications\UserPrograms\Java17`） |
| Android SDK | `E:\Applications\Android\Sdk`，build-tools 36.0.0 |
| HBuilderX | 5.34（`D:\HBuilderX`） |
| DevEco Studio | `E:\DevEco Studio`（hap-sign-tool、app_packing_tool） |
| 签名材料 | `D:\seal-office-signing`（安卓密钥库、鸿蒙 p12 与 Profile，不入库） |

## 二、成品清单

| 平台 | 文件 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| Windows 安装程序 | `seal-office-setup-2.8.0.exe` | 572,280,971 | `bd69473567ad42bdb8eb5d9a21f27e0f956b83458c947f409e97eaef46c0ff40` |
| 微软商店 MSIX | `seal-office-2.8.0-microsoft-store-x64.msix` | 806,442,891 | `8fa000e7807a2d8c4d80c046a86d3f1f5205f45658c9c25a61531d623b27cafd` |
| Ubuntu DEB | `seal-office-2.8.0-amd64.deb` | 154,858,148 | `b4b905f558f02d8a85540a0f3ed1a0ed3e51d41d499376de26b22df1f16994f8` |
| Web 静态包 | `seal-office-2.8.0-web.zip` | 52,808,489 | `a830284727582051aad1aca472afecb534dc3dac4130c69be032adbd812908b0` |
| Android APK | `seal-office-2.8.0-android.apk` | 56,467,109 | `d80d811ca99095da469e700cff78a9d93ab22a8545e0d8536d921f824f536c67` |
| HarmonyOS HAP | `seal-office-2.8.0-harmony.hap` | 74,901,790 | `ecec774764ae5da63863f7e564aa01a02e2c90e91474c76b2fefe3b18ff963d6` |
| HarmonyOS App Pack（上架专用，不对外分发） | `seal-office-2.8.0-harmony.app` | 45,233,048 | `0a518ae4f34c25d91f2e40e0686730565cd5fc84bd9aea34ed2c4a13a567db83` |

版本号统一为 2.8.0，移动构建号 20800；应用身份、桌面中文显示名“海豹办公”、安卓包名 `com.sealoffice.mobile` 与既有签名证书指纹 `53b13e1c76a826eb15879061e8840d9bc051156ff9ed33530339f444cd3997ad` 均未改变。`release/v2.8.0/SHA256SUMS.txt` 收录六个对外发行文件；App Pack 按规范只留在本机与验收记录，不上传仓库发行页。

## 三、测试与静态校验

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | 通过（先补齐 `mobile/node_modules` 缺失依赖后无报错） |
| 渲染层与主进程全量回归 | `npm run test:run` | 通过（vitest 渲染层、主进程与打包脚本测试全部通过，含 50 项打包用例与 11 项 Python 用例） |
| 服务端全量测试 | `mvn -q -B package` | 通过，产出 `seal-server.jar`（29,954,198 字节） |
| 桌面成品静态校验 | `node scripts/verify-desktop-artifacts.cjs` | 通过：Windows 与 Linux 两包均与最终工作区构建一致，各校验 623 个完整性文件 |
| MSIX 校验 | `python scripts/verify-msix-package.py` | 通过：身份 `45C56666.seal-office`、发布者 `CN=F6431C2A-EA55-468A-89D8-890511FCADF7`、版本 2.8.0.0、x64，两处显示名 `seal-office`，可执行文件为 `海豹办公.exe`，外部资源与 Windows 构建逐字节一致 |
| DEB 校验 | `python scripts/verify-deb-artifact.py` | 通过：ar 结构、控制信息、转换依赖、SUID 沙箱回退与归档 ELF 校验一致 |
| HAP 校验 | `npm --prefix mobile run check:hap` | 通过：bundle `com.sealoffice.mobile`、版本 2.8.0 / 20800、ZIP CRC、内置工作台与完整字库一致 |
| 鸿蒙双签名 | DevEco `hap-sign-tool verify-app` | App Pack 与 HAP 分别验签通过 |

明细归档：`desktop-artifacts.json`、`msix-package.json`、`linux-deb.json`、`harmony-package.json`。

## 四、后台部署

- 服务端与后台：`node scripts/deploy-backend.cjs --skip-build`，部署标识 `20261125190235-5f0e8d`。
- 新 jar SHA-256 `9be8e45ae2c303b6e0a7237f790f8defa2b22ead7ac3dacb72b9c2687a7a7858`；后台入口 `/admin/assets/index-DbDtzec6.js` SHA-256 `2e92053eaf9e1af0adbd7f389bc2e5e6739c05db65dd920671f7cc1305cc25c1`。
- 部署脚本内置验收通过：`spring_seal-cloud` 活跃、本机与公网能力接口 200、公网后台标题为“海豹办公云端管理”、未登录统计接口 401、后台入口脚本摘要一致。
- 新增表 `admin_password_overrides` 由启动时 `schema.sql` 自动创建。

## 五、构建过程中的处置

1. 管理后台 `npm ci` 被用户级 npm 配置 `allow-scripts` 拦截（npm 11 不允许项目级安装使用该参数）。未修改仓库配置，改用临时 `NPM_CONFIG_USERCONFIG`（仅含镜像源）完成依赖安装与构建。
2. 安卓 Gradle 任务 `prepareOfficeAssets` 原先把资源版本硬编码为 `2.7.10`，导致 2.8.0 资源被判为不匹配。已改为与模块 `versionName` 比较，避免后续升级再次遗漏。
3. HBuilderX 5.34 命令行会因 hvigor 任务缓存把 `SignHap` 判为已执行，删除旧签名产物后不再重新签名；本次清理 `.hvigor/cache` 后重新编译，并改用 DevEco 工具补齐 App Pack。
4. HBuilderX Windows 命令行未产出 App Pack `.app`，改用 DevEco Studio `app_packing_tool` 以已签名 HAP 生成容器，再由 `hap-sign-tool` 签名并验签；HAP 另行独立签名验签。
5. 鸿蒙签名配置在 `mobile/manifest.json` 中是绝对路径，本机指向 `D:/seal-office-signing`，另一台 macOS 机器指向用户目录。本次打包时临时切换为本机路径，提交前已恢复为仓库原有值，避免影响另一台机器。
6. 桌面与 Linux 两包若分别重新构建，会因 `dist/file-viewer` 下三个生成文件含构建时间戳而与工作区校验值不一致。本次改为“一次渲染层构建 → Windows EXE/MSIX → Linux DEB”顺序，使两包与最终工作区逐字节一致。

## 六、后台版本发布

- 命令：`python scripts/publish-backend-update.py --previous 2.7.10`，先 `--check` 预检通过。
- 上传并发布六个平台：windows、windows-store、linux、android、harmony、web；macOS 本轮无 2.8.0 安装包，未创建该平台记录。
- 每个平台均完成：上传后字段校验、匿名公开下载全字节 SHA-256 复核、2.7.10 查询返回 `hasUpdate: true` 且版本为 2.8.0、2.8.0 查询返回 `hasUpdate: false`。
- 公开下载地址（附件 ID 由后台生成）：

| 平台 | 附件地址 |
| --- | --- |
| windows | `https://seal.xingmasoft.com/api/v1/release-assets/d1c9aade-0632-4d5f-a0f4-601b812cf2dd/seal-office-setup-2.8.0.exe` |
| windows-store | `https://seal.xingmasoft.com/api/v1/release-assets/f6a0c1d4-6eeb-4947-9fe3-1f1203c0bd51/seal-office-2.8.0-microsoft-store-x64.msix` |
| linux | `https://seal.xingmasoft.com/api/v1/release-assets/5af27f2b-9763-47cd-8409-6eba89d1f228/seal-office-2.8.0-amd64.deb` |
| android | `https://seal.xingmasoft.com/api/v1/release-assets/05ca0147-f491-4600-9681-3d47f53e090f/seal-office-2.8.0-android.apk` |
| harmony | `https://seal.xingmasoft.com/api/v1/release-assets/b52c4a40-26e4-40a3-b516-40f9b84a798f/seal-office-2.8.0-harmony.hap` |
| web | `https://seal.xingmasoft.com/api/v1/release-assets/7c158672-abaa-4a95-9c04-cd3b2dce43f7/seal-office-2.8.0-web.zip` |

明细见 `backend-update.json`。

## 七、官网下载区

- `website/index.html` 首屏改为“最新版 v2.8.0”，Windows、Linux、安卓、鸿蒙四个入口切换为 2.8.0 附件地址；macOS 入口保留 2.7.10 通用包并明确标注版本。
- 官网测试 21 项通过；`npx vite build` 产出 `website-dist/`。
- `node scripts/update-website.cjs` 发布标识 `20261126050956-0f6c79ef`，上一版 `20261125134112-63355e92`。
- 线上验收：首页 200 且显示 v2.8.0；五个下载入口 HEAD 200，Content-Length 与本地文件一致，四个 2.8.0 附件 ETag 等于本地 SHA-256；`/admin/`、`/office/`、`/share/`、`/api/v1/capabilities` 均 200。明细见 `website-downloads.json` 与[官网下载更新说明](../../功能修改说明-官网下载2.8.0.md)。

## 八、仓库发布页

- 标签 `v2.8.0` 已推送到 GitHub 与 GitCode（提交 `527a738`）。
- `python scripts/publish-current-release.py` 将六个平台的安装包与 `SHA256SUMS.txt` 发布为两个仓库的最新发行版，并逐字节复核远端附件。
- GitHub：<https://github.com/fangzhouxiaohai/seal-office/releases/tag/v2.8.0>
- GitCode：<https://gitcode.com/gcw_pGfMiWVg/seal-office/releases/v2.8.0>
- 两个仓库各 7 个附件，名称与大小一致；GitHub 附件经公开重定向 HEAD 复核，GitCode HAP 经公开下载全字节 SHA-256 复核。App Pack 不入发行页。明细见 `repository-releases.json`。

## 九、未完成的验收与限制

- macOS 2.8.0 DMG 未构建：本轮在 Windows 机器执行，DMG 需要在 macOS 上构建并验签，官网 macOS 入口继续指向已发布的 2.7.10 通用包并标注版本。
- Windows 安装程序与 MSIX 未做实体机安装演练；静态校验与 electron-builder 签名日志已归档。
- Android 与 HarmonyOS 未做真机安装：HarmonyOS Release Profile 只能经 AppGallery（含测试渠道）安装，HAP 直接 `hdc` 安装需要含设备 UDID 的调试 Profile。
- 在线网页版（`/office/`）未重新部署：本机缺少 `scripts/deploy-web.py` 所需的 `web-usage` 部署凭据目录，Web ZIP 已作为成品归档。
