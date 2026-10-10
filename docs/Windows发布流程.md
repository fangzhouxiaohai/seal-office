# Windows 发布流程

每次升级必须交付对应版本的代码和安装包。代码推送成功后，还须上传 GitHub Releases 附件并核验远端文件；没有上传安装包不能报告发布完成。GitCode 与 GitHub 均同步源码与版本标签，GitCode README 提供相同的 GitHub 安装包下载链接。

## 版本与文件名

- 同步修改 `package.json` 与 `package-lock.json` 中的版本。
- 安装版：`SealOfficeSetup<版本>.exe`；便携版：`SealOffice<版本>.exe`。
- 微软商店包：`SealOffice<版本>.msix`；所有安装包文件名不含空格。
- 产物目录：`release/v<版本>/`。保留历史版本，不覆盖旧发布包。

## 验证与构建

1. 针对实际缺陷先复现，再运行相关回归、主进程回归、`npm run typecheck` 和 `npm run test:packaging`。
2. 运行 `npm run dist:windows -- --config.directories.output=release/v<版本>`，生成安装版、便携版和 `win-unpacked`。默认 `pack` / `dist` 按跨端项目约定只提交 Android 打包。
3. 用 `scripts/build-msix.ps1` 生成对应版本 MSIX。商店身份必须与既有产品一致，不能使用脚本的占位身份。
4. 验证实际成品模块与界面。解压安装版和便携版，比较内嵌 `app.asar` 与已验收成品；验证 MSIX 清单、版本和所有有效负载。报告分别写入产物目录的 `release-integrity.json` 与 `SealOffice<版本>.msix.verification.json`。
5. 生成 `SHA256SUMS.txt`，覆盖三个包。记录实际测试结果、限制与校验信息至 `docs/v<版本>-修复与验收.md`。

## 同步与发布

1. 更新 README 的版本和下载地址，将图片加入 Git，运行 `node scripts/check-readme-images.cjs`，确认所有本地图片存在、格式有效且已入库；检查差异，提交全部发布代码与报告。
2. 创建指向该提交的轻量标签 `v<版本>`，把 `main` 和标签推送到 `github` 与 `origin`；不强制覆盖远端历史。
3. 执行 `python scripts/publish-release.py`（需要 Python 3.11+ 和 requests）。脚本从 Git 凭据管理器读取授权，不打印或写入令牌。
4. 脚本先检查两个远端的提交和标签、包报告与本地校验值，再上传三种包、SHA-256 文件及发布说明。只有附件大小、远端 SHA-256 和上传状态全部一致才公开预发布页；重复执行会核对已有附件，不覆盖不同内容。
5. 检查产物目录的 `published-release.json` 及实际发布页。线上能力尚待外部验收时保留预发布标识。

上架截图必须来自对应版本实际程序，并满足商店尺寸与大小要求。安装包上传到仓库发布页与商店提交审核是两个独立步骤，分别报告结果。
