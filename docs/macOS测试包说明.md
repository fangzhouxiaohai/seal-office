# macOS 隔离测试包

`build/electron-macos.cjs` 是独立的 Apple Silicon 测试配置，不包含 Windows 转换引擎。`.github/workflows/macos-test.yml` 可手动触发，也可通过向 `codex/**` 工作分支推送相关文件触发；工作流只生成并保存未签名、未公证的临时测试附件，不上传仓库发布页，也不写入后台版本发布。测试附件保留七天。能否启动仍取决于仓库 Actions 权限、账号和运行额度。

工作流检查磁盘映像完整性、应用身份和架构，并在隔离副本中启动应用，测试沙箱、模拟文件打开事件、模拟程序坞重开以及通过系统 LibreOffice 将文稿实际转换为 PDF。模拟事件不能代替在真实设备上通过访达和程序坞操作的验收。未签名包可能被系统拒绝打开，也未完成公证或外部分发验证，不能作为正式可用安装包。

办公格式转换依赖安装在 `/Applications/LibreOffice.app` 的 LibreOffice；未安装时应用会提示安装。安装包不包含该转换引擎，不能声称开箱即具备离线转换功能。其他文稿格式及应用功能仍须在真实设备逐项验收。

面向用户分发可选择不使用 Apple 开发者账号，但需要明确标注未经过开发者身份签名与苹果公证；用户首次打开时可能需要到系统设置的“隐私与安全性”确认。若需要通过苹果验证开发者身份及公证，须另行配置 Developer ID、强化运行时、公证与票据。无论采用哪一种方式，都要在目标架构的 Mac 上测试安装、打开、更新和卸载；Apple Silicon 与英特尔版本必须分别核验，不能将单一架构称为通用版本。

## 本机交叉打包调查

用户提供的 [DeepChat 指南](https://github.com/ThinkInAIXYZ/deepchat/wiki/Mac-%E6%89%93%E5%8C%85%E6%8C%87%E5%8D%97)使用 Mac 在不同 Mac 芯片架构之间构建，并非在 Windows 上构建。开源的 [Electron Packager](https://electron.github.io/packager/main/)支持在 Windows 和 Linux 生成 macOS 应用目录，[Zapp](https://github.com/Ironpark/zapp)可在不同系统上将已有应用目录制成磁盘映像，并支持签名及公证；这些能力不能代替项目的目标架构依赖检查、苹果证书和实机验收。

2026 年 11 月 14 日隔离测试中，Windows 当前账户无法创建符号链接，Electron Packager 提示跳过 macOS 目标，尽管进程返回零，实际没有生成应用。Windows 主机安装的原生依赖也不能直接当作 macOS 依赖。GitHub Actions 的 Apple Silicon 测试任务 [43472039163](https://github.com/fangzhouxiaohai/seal-office/actions/runs/43472039163)因运行器容量不足未取得机器，未生成测试包。

后续已按用户要求启用 Windows 开发者模式，普通权限进程实际创建文件和目录符号链接成功；这是重试交叉构建的环境前提，并不代表安装包已经通过 Mac 验收。

本机已有 WSL 运行组件，但原先没有已注册的 Linux 发行版。尝试导入来自 Ubuntu 官方的 24.04.5 镜像，文件 SHA-256 与官方清单一致；导入长时间无输出，虚拟磁盘停留在 12 MiB，终止本次客户端后查询发行版也挂起。后台状态不明，实验目录暂时保留，未重启 WSL 服务或删除文件。本次没有生成 `.app` 或 DMG。后续须先排查 WSL 状态，再于 Linux 文件系统中构建并核验 macOS 原生依赖与符号链接。

## iOS 构建边界

现有 `mobile` 是 uni-app x 工程，`build:ios` 仅构建编辑器网页资源，不能当作 IPA。现有检查和源码归档仅覆盖安卓和鸿蒙。iOS 导出、打印的异步结果尚需按系统实际结果处理并在设备上验证。DCloud 提供 [iOS 云打包](https://doc.dcloud.net.cn/uni-app-x/tutorial/app-package.html)，需要匹配的应用标识和苹果签名材料；项目能否成功云编译及上架尚未验证。
