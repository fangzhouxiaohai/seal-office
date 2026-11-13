# macOS 隔离交叉构建工具

本工具从已经准备好的隔离源码和指定架构的生产依赖构建测试候选，检查应用、临时签名数据、符号链接和 DMG 内容；不修改源码、发布页或后台。产物文件名包含架构和 `test-only`，验收记录始终标记 `releaseReady: false`。

**发行门槛未通过：**工具不提供 Apple 开发者签名，也不进行苹果公证、Gatekeeper 或实际 Mac 安装和运行测试。临时签名的代码页及资源散列检查不能替代 `codesign --verify --deep --strict`、`hdiutil verify`、系统安全检查，以及对应芯片 Mac 上的安装、启动、更新和卸载验收。未经苹果公证的软件可能需要用户在系统设置中确认打开；若希望系统验证开发者身份和公证状态，需另行配置签名与公证。现有更新接口只有一个 macOS 平台，不能按架构自动选择这两种测试包。

## 准备输入

1. 在全新隔离目录复制当前源码及锁文件，使用项目兼容的 Node 和 npm 安装构建依赖并运行 `npm run build`；确认生成 `main/integrity-manifest.json`。不要在正在使用的工作区上执行清理或依赖重装。
2. 另建目标应用目录，复制相同的 `package.json` 和 `package-lock.json`，分别使用 npm 10 执行 `npm ci --omit=dev --ignore-scripts --os=darwin --cpu=arm64` 或将最后架构改为 `x64`，然后复制第 1 步构建后的 `main` 和 `dist`。不得复用 Windows 原生依赖。实际运行前须自行审阅所安装依赖和其来源。
3. 准备匹配版本和架构的 Electron 官方 ZIP，按官方发布的摘要核对；准备 Electron Packager 模块、rcodesign、Zapp、7-Zip 和 Python 3.11 或更高版本。输入配置中对每个可执行文件或模块入口给出绝对路径及预先核对的 SHA-256。Windows 上 7-Zip 还需给出同目录 `7z.dll` 及其摘要。外部工具的依赖与来源也须独立审阅；入口文件摘要不等于整个依赖树的供应链认证。
4. 在已有父目录下指定**不存在的新工作目录**。目录不得与源码或目标依赖目录重叠；工具不覆盖已有路径，不删除失败时产生的内容。工作目录包含应用、日志、解包内容和测试 DMG，可能占用数 GB。Packager 的临时根也位于这个独立目录，避免它清理共享系统临时目录。

配置示例，路径和摘要均为占位，实际使用时必须替换：

```json
{
  "source": "绝对路径/隔离源码",
  "bundle": "绝对路径/目标依赖",
  "work": "绝对路径/全新工作目录",
  "arch": "arm64",
  "electronVersion": "25.9.8",
  "electronZip": { "path": "绝对路径/electron-v25.9.8-darwin-arm64.zip", "sha256": "官方清单中的64位摘要" },
  "packager": { "path": "绝对路径/@electron/packager/dist/index.js", "sha256": "模块入口文件的64位摘要" },
  "zapp": { "path": "绝对路径/zapp.exe", "sha256": "发行文件的64位摘要" },
  "rcodesign": { "path": "绝对路径/rcodesign.exe", "sha256": "发行文件的64位摘要" },
  "seven": { "path": "绝对路径/7z.exe", "sha256": "发行文件的64位摘要" },
  "sevenLibrary": { "path": "绝对路径/7z.dll", "sha256": "发行文件的64位摘要" },
  "python": { "path": "绝对路径/python.exe", "sha256": "解释器的64位摘要" }
}
```

切换 Intel 时把 `arch` 和 Electron ZIP 中的架构都改为 `x64`，并指定独立的目标依赖及全新工作目录。配置示例不是可以直接执行的配置。`packager` 及其依赖须安装在隔离工具目录，入口文件应为项目实际安装的 `@electron/packager/dist/index.js`。

执行：

```text
node scripts/macos_cross_build.cjs 配置文件绝对路径
python scripts/macos_cross_verify_test.py
node --test scripts/macos_cross_build_test.cjs
```

工作目录的 `构建输入.json` 只记录已核验的输入路径、目标及摘要，成功后还可读取 `验收记录.json` 和各步骤日志。构建过程首先检查输入摘要、两份构建清单、锁文件中的目标依赖版本、必需依赖是否缺失及原生架构；随后生成应用、核对资源与文件关联，将 ASAR 完整性路径修正为 `Resources/app.asar` 并校验头部摘要，按官方 ZIP 修复并检查框架链接，执行无证书临时签名，再核对代码页、封存资源、原始 Electron 数据段及资源、DMG 文件集合、字节、链接和 Mach-O 权限。目标依赖的版本检查不构成对安装后每个依赖文件的独立供应链认证。任何一步失败均退出并保留日志，不能把已生成文件视为通过验收。

`macos_cross_verify.py` 也提供单独的 `signature`、`original` 和 `image` 校验命令，可运行 `python scripts/macos_cross_verify.py --help` 查看参数。临时签名工具对空 CMS 的检查可能报告失败；跨平台数据校验不判断苹果系统是否信任此签名。



ASAR 元数据格式依据 [Electron 官方文档](https://www.electronjs.org/docs/latest/tutorial/asar-integrity)。设置正确的元数据并不代表已启用运行时完整性 fuse。




