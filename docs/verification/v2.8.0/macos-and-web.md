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
- GitHub 发行接口确认三份 DMG 的大小和 SHA-256。GitCode 的三份 DMG 与校验清单通过公开下载全字节核对。官网部署 `20261126153031-fb8f7955` 已公开 Apple 芯片和 Intel 两个入口。
- 后台发布预检通过，正式发布时管理员登录返回 HTTP 401。匿名更新接口尚未提供 2.8.0 macOS 更新。

[GitHub 发行页](https://github.com/fangzhouxiaohai/seal-office/releases/tag/v2.8.0) · [GitCode 发行页](https://gitcode.com/gcw_pGfMiWVg/seal-office/releases/v2.8.0) · [官网下载区](https://seal.xingmasoft.com/#downloads)

## Web

- 线上部署标识 `2.8.0-web-20261126-132403`。`/office/build-info.json` 显示 `desktopVersion` 为 `2.8.0`、`platform` 为 `web`。
- 启动、定时检查与设置页更新入口已移除。线上浏览器的 11 项检查通过，覆盖更新请求、设置、匿名权限、文稿读写、表格公式及往返、模板、PDF、脑图、流程图与窄视口。回归入口为 `mobile/tests/public-web.cjs`。
- 本轮交付为服务器上直接访问的 Web 应用。两个发行页中原有的历史 Web ZIP 保留。

[海豹办公 Web](https://seal.xingmasoft.com/office/)
