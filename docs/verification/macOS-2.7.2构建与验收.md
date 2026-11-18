# macOS 2.7.2 构建与验收记录

版本保持 2.7.2。Windows 开发者模式已按微软提供的方法启用，普通用户进程可创建文件和目录符号链接。本机通过隔离的 Electron Packager、rcodesign 和 Zapp 流程生成 Apple Silicon 与 Intel 两种测试包，未使用苹果开发者证书。

本机包在各自架构的 GitHub macOS 运行器上通过磁盘映像、临时签名、应用启动、沙箱、原生图像模块、DOCX 转 PDF 和模拟的文件打开与程序坞事件检查：[Apple Silicon](https://github.com/fangzhouxiaohai/seal-office/actions/runs/43485198254)、[Intel](https://github.com/fangzhouxiaohai/seal-office/actions/runs/43485198290)。这些运行器测试并未覆盖真实访达打开、用户手动安装、更新、卸载或所有办公格式；文档转换使用测试机单独安装的 LibreOffice，不包含在应用包中。

Mac 系统的 `codesign --verify --deep --strict` 验证了测试包的临时签名结构；`spctl` 的默认评估拒绝了未公证包。临时签名不提供开发者身份认证，未经过苹果公证。用户从可信来源取得且确认文件未被篡改后，可能需要按 [Apple 的说明](https://support.apple.com/zh-cn/102445)在系统设置的“隐私与安全性”中确认打开。

由于现有更新接口只有一个 macOS 平台，分别给两种芯片上传不同包不能让现有客户端自动选择。已使用两种本机候选在 Mac 隔离环境合并出通用测试 DMG，大小 467,583,156 字节，SHA-256 为 `ee5239b483c4823016eee38f8902d60e552b196a45d72a3c190d0a244eacd256`。合并、临时签名和应用结构检查通过；[同一文件的双架构复测](https://github.com/fangzhouxiaohai/seal-office/actions/runs/43487180399)中 Intel 已通过，Apple Silicon 首次在验收脚本的测试运行器阶段失败。修正测试运行方式后，[Apple Silicon 备用复测](https://github.com/fangzhouxiaohai/seal-office/actions/runs/43491109774)通过，包含镜像校验、签名校验、应用启动、文档转换及原生图像模块加载。两架构使用同一文件，真实访达、程序坞、手工安装和更新及首次打开流程尚未在实体 Mac 上验证。

候选应用的源码基线为 `ad4b56a63dbcaac48722fc5596abe725fb85ac37`；其中的 `package.json` 与两份本机应用所打包的文件一致，运行时代码在该基线与交叉构建快照间保持一致。通用包合并工作流使用 `daf82932ee5387f9da53e668131c31b4ea668695`。既有 `v2.7.2` 发行标签指向较早提交，不能把它误当作本次修订的源码基线。

本机交叉构建输入、依赖冻结、签名与映像检查的使用方式和限制见 [构建工具说明](../../scripts/macos_cross_build.md)。签名后的 unpacked 原生模块与 ASAR 中的签名前摘要不同；当前两个单架构包的 Electron 完整性 fuse 关闭，Electron 25.9.8 不读取该 unpacked 项的摘要。此项不应被表述为摘要一致，也不代替 Mac 上的实际模块加载和签名验证。

通用 DMG 与独立校验清单已追加到 GitHub 和 GitCode 的 2.7.2 发行，两个公开下载均逐字节核对摘要。后台 macOS 稳定版也已发布，公开下载核对通过：2.7.1 返回 2.7.2，2.7.2 返回无更新；详情见 [后台验收记录](v2.7.2/macos-backend-update.json)。已安装 2.7.2 的客户端不会因同版本修订自动检测到更新，需要手动下载安装。
