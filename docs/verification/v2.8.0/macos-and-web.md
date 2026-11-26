# 海豹办公 2.8.0 macOS 补发与 Web 部署

## macOS

从 `main` 提交 `0c7f8f2` 构建，继续使用两个仓库已有的 `v2.8.0` 发行页及标签。测试机为 Apple 芯片 Mac，Intel 包通过 Rosetta 运行。

| 安装包 | 字节 | SHA-256 |
| --- | ---: | --- |
| `seal-office-2.8.0-macos-arm64.dmg` | 244120077 | `85a9287461396a817db9046061ec2f703b968e2cc6c66eb5a36c603f8db691de` |
| `seal-office-2.8.0-macos-intel.dmg` | 250495779 | `cf1badab8a36b80764bc80f087aed441b9078dd474c6bb688a4687b25c42f6a5` |
| `seal-office-2.8.0-macos.dmg` | 451921653 | `e0108d503ecd1ef6ffc1a49502f71a3d1dc58e11fd4a79ba36c6d6b8707edab2` |

- 三份最终成品均通过磁盘镜像校验、只读挂载、签名验证、架构检查，以及隔离启动、沙箱、原生图形、文件事件、更新暂存状态和程序坞事件检查。通用包通过 ASAR 路径和头摘要校验。文件及程序坞事件由测试触发。
- 本轮使用临时签名，尚未通过 Apple 公证。最终成品在未安装 LibreOffice 的环境验收，依赖该程序的转换用例使用 `--skip-external-conversion` 跳过。此前同一通用应用曾在装有 LibreOffice 时通过 DOCX 转 PDF 测试。
- GitHub 发行接口确认三份 DMG 的大小和 SHA-256。GitCode 的三份 DMG 与校验清单通过公开下载全字节核对。官网部署 `20261126163936-86dbec4f` 已公开 Apple 芯片和 Intel 两个入口，两个入口均使用自有服务器地址。
- 后台单平台补发入口已恢复并部署。2.8.0 的 Apple 芯片、Intel 芯片和客户端通用 DMG 已通过服务器流式校验后独立上架，匿名下载全量字节与 SHA-256 均核对通过。旧版 `2.7.10` 查询返回 2.8.0 通用包，2.8.0 查询返回 `hasUpdate=false`。本机后台登录返回 HTTP 401，本轮通过 SSH 调用后台的附件校验和版本发布服务完成上架。
- 自有服务器附件地址：Apple 芯片 `https://seal.xingmasoft.com/api/v1/release-assets/8da8801e-75e3-4a2b-8a02-289143caee4f/seal-office-2.8.0-macos-arm64.dmg`，Intel 芯片 `https://seal.xingmasoft.com/api/v1/release-assets/08d34500-0117-4740-9a9a-53fd7b3c0707/seal-office-2.8.0-macos-intel.dmg`，客户端通用包 `https://seal.xingmasoft.com/api/v1/release-assets/3dc17163-13f9-4f6d-bdd6-1580899f5e56/seal-office-2.8.0-macos.dmg`。

[GitHub 发行页](https://github.com/fangzhouxiaohai/seal-office/releases/tag/v2.8.0) · [GitCode 发行页](https://gitcode.com/gcw_pGfMiWVg/seal-office/releases/v2.8.0) · [官网下载区](https://seal.xingmasoft.com/#downloads)

## Web

- 线上部署标识 `2.8.0-web-20261126-132403`。`/office/build-info.json` 显示 `desktopVersion` 为 `2.8.0`、`platform` 为 `web`。
- 启动、定时检查与设置页更新入口已移除。线上浏览器的 11 项检查通过，覆盖更新请求、设置、匿名权限、文稿读写、表格公式及往返、模板、PDF、脑图、流程图与窄视口。回归入口为 `mobile/tests/public-web.cjs`。
- 本轮交付为服务器上直接访问的 Web 应用。两个发行页中原有的历史 Web ZIP 保留。

[海豹办公 Web](https://seal.xingmasoft.com/office/)
