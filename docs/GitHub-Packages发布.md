# GitHub Packages 安装文件发布

GitHub 仓库右侧的 Packages 使用 GHCR 保存三个平台的 OCI 制品。包里是已经在 Releases 发布并核验过的原始安装文件，通过 ORAS 提取后安装；直接点击下载安装使用 [GitHub 发布页](https://github.com/fangzhouxiaohai/seal-office/releases/tag/v1.9.11)或 [GitCode 发布页](https://gitcode.com/gcw_pGfMiWVg/seal-office/releases/v1.9.11)。

| 平台 | Package | 文件 |
| --- | --- | --- |
| Windows x64 | [seal-office-windows](https://github.com/users/fangzhouxiaohai/packages/container/package/seal-office-windows) | 安装 EXE、便携 EXE、微软商店上传 MSIX |
| Android ARM 32/64 位 | [seal-office-android](https://github.com/users/fangzhouxiaohai/packages/container/package/seal-office-android) | 用户提供的 HBuilderX 云打包 APK |
| Ubuntu amd64 | [seal-office-linux](https://github.com/users/fangzhouxiaohai/packages/container/package/seal-office-linux) | DEB 与 Ubuntu 22.04 / 24.04 成品验收报告 |

三个包均使用 `1.9.11` 和 `latest` 标签，附带安装说明、文件元数据及 SHA256SUMS.txt。MSIX 用于微软合作伙伴中心上传，由商店签名分发；Ubuntu 的已验证范围为 22.04、24.04 x86_64，Android 新 APK 的原生交互回归仍待设备连接。

## 提取安装文件

安装 [ORAS 1.3](https://oras.land/docs/installation) 后，在目标下载目录执行对应命令：

```sh
oras pull ghcr.io/fangzhouxiaohai/seal-office-windows:1.9.11
oras pull ghcr.io/fangzhouxiaohai/seal-office-android:1.9.11
oras pull ghcr.io/fangzhouxiaohai/seal-office-linux:1.9.11
```

请分别下载到不同目录，每个包都包含自己的 README.md、installer-metadata.json 和 SHA256SUMS.txt。Linux 可用 `sha256sum --check SHA256SUMS.txt` 验证；Windows 可用 `Get-FileHash 文件名 -Algorithm SHA256` 对照。

GHCR 包首次发布默认私有；公开后支持匿名提取。若提示无权限，包的管理员需要在 Package 页面进入 **Package settings → Change visibility → Public**。发布流程的报告记录实际可见性，以报告和 GitHub 当前设置为准。

## 发布与校验流程

[packages.yml](../.github/workflows/packages.yml) 在主分支更新发布配置或手动触发时运行。流程使用仓库自带的 `GITHUB_TOKEN` 和 `packages: write`，不需要在源码中存放个人令牌。各平台下载 [package-release.json](../scripts/package-release.json) 指定的 Release 文件，同时校验远端声明与下载内容的大小和 SHA-256；文件完全一致后才上传。

上传后的制品会按摘要重新下载，每个文件都重新校验。通过后才移动 `latest` 标签，并核实 Package 已关联当前仓库、版本标签正确。已经存在的版本若内容不同，流程拒绝覆盖。每个平台的 `published-package.json` 作为 Actions 验证附件保存。

后续发布先完成三端安装文件验收、上传 Releases，再更新配置中的版本、文件名、大小和 SHA-256。日常 `pack` / `dist` 继续只打包 Android；Packages 流程分发已经存在的成品，不重新构建应用。
