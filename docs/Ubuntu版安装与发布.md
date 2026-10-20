# Ubuntu 版安装与发布

当前版本为 1.9.14，提供 x86_64 / amd64 的 `.deb` 安装包。与 Windows 版共用文字、表格、演示、PDF、文件工作区和云端服务界面；Linux 文件路径按大小写区分，文件打开入口和默认关联使用 Linux 的桌面/MIME 机制。

## 安装

从 [1.9.14 发布页](https://github.com/fangzhouxiaohai/seal-office/releases/tag/v1.9.14)下载 `SealOfficeUbuntu1.9.14-amd64.deb`，进入下载目录运行：

```bash
sudo apt update
sudo apt install ./SealOfficeUbuntu1.9.14-amd64.deb
sealoffice
```

安装后也可从系统应用列表启动“海豹办公”。首次安装会通过 Ubuntu 软件源安装依赖，包括 LibreOffice Writer、Calc、Impress 和中文字体；安装完成后，旧办公文档在本机转换，不需要移动端转换服务。程序支持选择“设为默认程序”，逐项设置并查询实际 MIME 关联状态；启动检查只查询状态。

程序保留 Chromium 渲染器沙箱、上下文隔离和文件版本冲突保护，使用 electron-builder 的 Debian 安装脚本处理沙箱权限及 Ubuntu 24.04 AppArmor 配置。安装方式和依赖配置参照 [electron-builder Linux 文档](https://www.electron.build/v26/docs/linux/)。

## 源码构建

在 Linux 上安装 Node.js 22 和项目依赖后运行：

```bash
npm ci
npm run dist:ubuntu
```

当前发行使用英文名 `release/v<版本>/seal-office-<版本>-amd64.deb`。每次先清理本机旧版本目录，只保留当前版本和 `promo`；完整规则见[打包规范](打包规范.md)。只生成目录时运行 `npm run pack:ubuntu`。Ubuntu 配置为 `build/electron-ubuntu.cjs`，只使用 Linux Electron 运行库及系统转换引擎，不携带 Windows 版 LibreOffice 和 PowerShell 注册组件。`npm run pack`、`npm run dist` 继续只提交 Android 打包。

正式发布仍应在 Linux 或 Ubuntu CI 上运行 `npm run dist:ubuntu`。Windows 上制作候选包时，先用 electron-builder 和 Linux Electron 运行库生成 `release/v<版本>/linux-unpacked`，再运行 `npm run package:ubuntu:windows`；脚本生成标准 `debian-binary`、`control.tar.xz` 和 `data.tar.xz`，保留可执行权限、安装脚本、桌面入口与 MIME 声明。Windows 只能完成包结构校验，安装、AppArmor、桌面关联和运行验收须在 Ubuntu 22.04/24.04 或 CI 中执行。

Ubuntu 22.04 的 LibreOffice 7.3 与 Ubuntu 24.04 的 LibreOffice 24.2 使用长期存在的 Word/Excel/PowerPoint 模板导出过滤器，避免套用 Windows 26.8 新增的过滤器名称；名称参照 [LibreOffice 转换过滤器文档](https://help.libreoffice.org/latest/en-US/text/shared/guide/convertfilters.html)。Linux PDF 中文编辑随包提供 Noto Sans SC 字体及 OFL 许可证。

## 发布验证

`.github/workflows/ubuntu.yml` 先在 Ubuntu 22.04 构建同一个安装包，再分别在 Ubuntu 22.04 和 24.04 安装，通过 Xvfb 启动实际程序。检查包版本、冷启动中文 CSV、真实读写与冲突保护、默认关联、Office 旧格式和模板往返、中文 PDF、窗口截图及退出。文件类型由 Ubuntu 桌面使用的 GIO 查询，再用 `xdg-mime` 核对默认应用；无桌面环境中的旧版 `file` 对 POTX/PPSX 的识别结果不能替代桌面类型查询。两个系统的报告必须同时通过，且报告记录的 SHA-256 与待上传安装包一致，才允许上传发布页。

验证结果随发布页的 `SealOffice1.9.14-UbuntuVerification.zip` 提供；源码内的最终报告记录构建提交和原始工作流地址。虚拟显示验证不等同于物理打印机、Wayland 录屏及所有显卡驱动的实际使用验收。

1.9.14 最终成品在两个系统各通过 71 项检查，包括默认关联弹窗的实际按钮点击；[工作流](https://github.com/fangzhouxiaohai/seal-office/actions/runs/38289608404)由带 PDF 连续滚动修复的 `v1.9.14` 提交构建并验证同一个安装包。[发布摘要](verification/v1.9.14/ubuntu-release.json)核对包体与原始报告的哈希一致，完整报告、日志和截图随发布页压缩包提供。安装包大小为 144,806,384 字节，SHA-256 为 `98230a2b3d22e34dc4194bfe6d258daff4841823e60f6da741c6e88d7159a6a5`。

源码主分支、`v1.9.14` 标签和同版本安装包同步到 GitHub、GitCode；Windows、Android 与 Ubuntu 使用同一版 PDF 阅读器源码。
