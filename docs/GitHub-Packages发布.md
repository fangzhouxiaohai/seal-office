# GitHub Packages 安装文件发布

GitHub 仓库右侧的 Packages 使用 GHCR 保存三个平台的 OCI 制品。包里是已经在 Releases 发布并核验过的原始安装文件，通过 ORAS 提取后安装；直接点击下载安装使用 [GitHub 发布页](https://github.com/fangzhouxiaohai/seal-office/releases/tag/v1.9.12)或 [GitCode 发布页](https://gitcode.com/gcw_pGfMiWVg/seal-office/releases/v1.9.12)。

| 平台 | Package | 文件 |
| --- | --- | --- |
| Windows x64 | [seal-office-windows](https://github.com/users/fangzhouxiaohai/packages/container/package/seal-office-windows) | 安装 EXE、便携 EXE、微软商店上传 MSIX |
| Android ARM 32/64 位 | [seal-office-android](https://github.com/users/fangzhouxiaohai/packages/container/package/seal-office-android) | 用户提供的 HBuilderX 云打包 APK |
| Ubuntu amd64 | [seal-office-linux](https://github.com/users/fangzhouxiaohai/packages/container/package/seal-office-linux) | DEB 与 Ubuntu 22.04 / 24.04 成品验收报告 |

Windows 包使用 `1.9.12` 和 `latest` 标签；补充发布的 Android 与 Linux 包使用 `1.9.12-r1` 和 `latest`，旧的 `1.9.12` 包保持原样，避免改写已发布的 OCI 版本。每个包均附带安装说明、文件元数据及 SHA256SUMS.txt。MSIX 用于微软合作伙伴中心上传，由商店签名分发；Ubuntu 的已验证范围为 22.04、24.04 x86_64，Android 补充 APK 已在 Android 14 模拟器复测轻点打开、保存和重启恢复。

## 提取安装文件

安装 [ORAS 1.3](https://oras.land/docs/installation) 后，在目标下载目录执行对应命令：

```sh
oras pull ghcr.io/fangzhouxiaohai/seal-office-windows:1.9.12
oras pull ghcr.io/fangzhouxiaohai/seal-office-android:1.9.12-r1
oras pull ghcr.io/fangzhouxiaohai/seal-office-linux:1.9.12-r1
```

请分别下载到不同目录，每个包都包含自己的 README.md、installer-metadata.json 和 SHA256SUMS.txt。Linux 可用 `sha256sum --check SHA256SUMS.txt` 验证；Windows 可用 `Get-FileHash 文件名 -Algorithm SHA256` 对照。

本次三个包的实际可见性均为 **public**，已核对匿名访问、版本清单摘要和各文件的大小。发布流程的报告记录实际可见性；后续新增包若为私有，管理员可在 Package 页面进入 **Package settings → Change visibility → Public**。

## 发布与校验流程

[packages.yml](../.github/workflows/packages.yml) 在主分支更新发布配置或手动触发时运行。流程使用仓库自带的 `GITHUB_TOKEN` 和 `packages: write`，不需要在源码中存放个人令牌。各平台下载 [package-release.json](../scripts/package-release.json) 指定的 Release 文件，同时校验远端声明与下载内容的大小和 SHA-256；文件完全一致后才上传。

上传后的制品会按摘要重新下载，每个文件都重新校验。通过后才移动 `latest` 标签，并核实 Package 已关联当前仓库、版本标签正确。已经存在的版本若内容不同，流程拒绝覆盖。每个平台的 `published-package.json` 作为 Actions 验证附件保存。

后续发布先完成三端安装文件验收、上传 Releases，再更新配置中的版本、文件名、大小和 SHA-256。日常 `pack` / `dist` 继续只打包 Android；Packages 流程分发已经存在的成品，不重新构建应用。

## GitCode 成品同步

两个仓库的源码分别推送至 `github` 与 `origin`。成品先在 GitHub Releases 发布并完成校验，再使用 [publish-gitcode-release.py](../scripts/publish-gitcode-release.py) 发布同一批文件到 GitCode：

```sh
python scripts/publish-gitcode-release.py 1.9.12
```

脚本需要 Python 和 `requests`，通过当前 Git 凭据助手使用已有的 GitCode 登录；令牌仅在进程内使用。执行前校验本地全部文件与 GitHub Release 的大小、SHA-256，并确认 GitCode 已有相同发布标签。已上传附件不会直接覆盖，而是重新下载核对；新附件通过 GitCode 返回的上传地址传输，完成后逐个匿名下载验证。补充版替换附件后也要逐项匿名下载验证，报告保存在 `release/v1.9.12/`。
