# 2.2.0 HarmonyOS 签名配置切换（新主体）

日期：2026-10-26。

## 结论

旧 HBuilderX 配置仍指向旧主体的证书和 Profile，所以云打包会出现“合法性 不通过(993)”或包与 AppGallery 应用不一致。本次已将项目签名配置切到 `E:\seal-office\cer` 中由华为签发的**新主体证书和 Profile**，并保持原私钥、原别名不变。

**没有生成自签名“假证书”**：AppGallery 只接受华为签发的发布证书和 Profile。自签名证书在本地看似能签，但云打包/上架的合法性校验必然失败。这里使用的是新主体在 AGC 签发的新文件。

## 新配置

| 项目 | 值 |
| --- | --- |
| 应用包名 | `com.sealoffice.mobile` |
| 证书 | `E:/seal-office/cer/seal-office-release-20261023.cer` |
| 证书原文件 | `E:/seal-office/cer/海豹办公.cer`（内容相同） |
| Profile | `E:/seal-office/cer/seal-office-release-20261023Release.p7b` |
| 私钥库 | `E:/seal-office/.upgrade-private/harmony-signing/seal-office-release.p12`（未更换） |
| 私钥别名 | `sealoffice-release`（无连字符） |
| 签名算法 | `SHA256withECDSA` |
| 证书主体 | 新疆星之远境智能科技有限公司（`2067767059806188545`） |
| 证书 SHA-256 | `9C1A6D76D4F18367FE1A8D5DD4D7EE71E201DF04F6CA055A56883528458DCECB` |
| 证书有效期 | 2026-10-23 15:14:02 UTC — 2029-10-23 15:14:02 UTC |
| Profile App ID | `6917619858054370422` |
| Profile Developer ID | `20086000975548278` |
| Profile 类型 | `release` / `app_gallery` |

旧配置（不可继续使用）：

- 证书：`SealOfficeRelease2026.cer`
- Profile：`SealOfficeReleaseProfile2026Release.p7b`
- 证书主体：旧主体（`2061228174582248449`）
- 旧 App ID：`6917619060249505960`
- 截图中的旧指纹以 `390BBF...` 开头

## 已做校验

已在本地核对，不依赖“看起来能打包”：

1. 新 `.cer` 是完整三证书链：Huawei CBG Root CA G2 → Huawei CBG Developer Relations CA G2 → 新主体 Release 叶证书。
2. 新 Profile 内嵌的 `distribution-certificate` 与新证书叶证书完全一致，SHA-256 为 `9C1A6D...`。
3. 新 Profile 的 `bundle-name` 为 `com.sealoffice.mobile`，`type` 为 `release`，`app-distribution-type` 为 `app_gallery`，未带额外权限/ACL。
4. 原 `.p12` 的 EC 公钥与新证书叶证书公钥一致（公钥 DER SHA-256 均为 `63D0F6625DFB751267E69A04264E908F52E551DBC9D5DF4F3886A7F74EAB0B27`），因此继续使用原私钥和原密码即可。
5. `keytool -list` 确认私钥库实际别名是 `sealoffice-release`，不是带连字符的 `seal-office-release`。
6. 修改了 `mobile/manifest.json` 的 `app-harmony.distribute.signingConfigs.release`，并同步了当前生成目录中的 manifest，避免 HBuilderX 继续读旧路径。

## 为什么旧包会不对

旧配置的证书、Profile 和 AppGallery 应用属于旧主体；新 Profile 的 App ID/Developer ID 已变为新主体。HBuilderX 如果继续拿旧证书+旧 Profile 签新包，签名链和 AGC 应用对不上，就会出现合法性失败或上传后被判包不属于该应用。

另外，若 HBuilderX 界面里私钥别名被填成 `seal-office-release`（带连字符），也会和 p12 的实际别名 `sealoffice-release` 不匹配。本次项目配置使用正确的无连字符别名。

## HBuilderX 操作

1. 关闭当前 HBuilderX 中的鸿蒙项目，再重新打开 `E:\seal-office\mobile`（或重新读取 `manifest.json`），让签名对话框重新取值。
2. 打开“发行 → 原生 App-云打包 → 鸿蒙”的证书配置，确认：
   - 证书文件：`E:\seal-office\cer\seal-office-release-20261023.cer`
   - Profile：`E:\seal-office\cer\seal-office-release-20261023Release.p7b`
   - 私钥库：`E:\seal-office\.upgrade-private\harmony-signing\seal-office-release.p12`
   - 私钥别名：`sealoffice-release`
3. 若界面仍显示旧路径，说明 HBuilderX 仍在使用旧的生成工程/缓存；删除或重建 `mobile/unpackage/dist/build/app-harmony` 与 `.app-harmony`，再重新打开项目。不要只改对话框后不重新打包。
4. 确认要上传的 AppGallery 应用是**新主体应用**（App ID `6917619858054370422`）。新 Profile 不能用于旧主体的应用。
5. 云打包下载 `.app` 后，先用官方签名工具验外层 App Pack、内层 HAP、证书链和 Profile，再上传。不要在未验签的情况下反复提交。

## 保密

- `.p12`、密码文件、`cer/` 均不进入 Git；`cer/` 已加入 `.gitignore`。
- 不要把私钥库或密码发到聊天、网盘或公开仓库。
- 本文只记录公开证书指纹和配置，不记录私钥密码。
