# 鸿蒙 2.1.2：新主体发布签名核验

用户确认已更换开发者主体，并于 2026-10-23 提供新发布证书和发布 Profile。本次仅更换发布签名，沿用已验收的 2.1.2 鸿蒙应用内容。

## 唯一上传文件

```text
E:\seal-office\release\v2.1.2\mobile-web\seal-office-2.1.2-harmony.app
```

- 文件大小：66,037,512 字节。
- SHA-256：`a080f57a809cf399bf95f8168a2cc4d48bbd831607cf18dc5d94f9cb1b720105`。
- 上传 `.app`；同目录的 `.app.zip` 是归档外封装。
- 版本：2.1.2；版本号：20102；包名：`com.sealoffice.mobile`。
- 新主体：新疆星之远境智能科技有限公司。
- 新 App ID：`6917619858054370422`。
- 新 Developer ID：`20086000975548278`。
- 新 Profile UUID：`0a434586-fa71-4645-bee5-8dd0537518b0`。
- 发布证书有效期至 2029-10-23 23:14:02（北京时间）。

旧包包含旧主体 App ID `6917619060249505960` 对应的 Profile。后台创建新 Profile 不会改变旧安装包。本次将当前应用的发布 Profile 写入内层 HAP 和外层 App Pack，并重新签名。

## 核验结果

1. 新证书链包含华为根证书、中间证书及新主体发布证书，逐级验证证书签名；Profile 中的发布证书与下载证书一致。
2. 新证书公钥与原 CSR、原 `.p12` 私钥均匹配，保留原私钥、别名和密码，未重新生成密钥。
3. 华为 SDK `hap-sign-tool.jar verify-profile` 验证新 Profile 成功；类型为 `release`，分发为 `app_gallery`，包名、App ID、开发者 ID 和有效期均检查通过。
4. 官方工具分别验证最终归档 `.app` 和其内层 HAP：签名通过、SHA-256 摘要通过，提取的 Profile 均与用户下载文件逐字节一致。
5. 内层 HAP 的代码签名、7 项原生库验证及权限签名通过。新包不再沿用此前内层 HAP 未独立签名的状态。
6. 原有 86 个 HAP ZIP 文件内容逐字节保留，`module.json`、`pack.info`、`pac.json` 保持原字节；签名工具只新增 `.pages.info` 签名元数据及签名块。
7. 28 项编辑器资源逐字节匹配独立冻结的 HarmonyOS 源码，编辑器 SHA-256 仍为 `e04ad8427ece892690f4c4a7ac058181e440694296f8ae85645a119dc548f3f9`。
8. APK 和两平台源码 ZIP 保持原校验值。两份干净解压项目各 59 个文件、59,799,953 字节，逐文件与 ZIP 一致；Android ZIP 38,531,181 字节，两项均低于 60,000,000 字节。
9. SDK 包分析工具成功读取最终 App Pack，原始统计报告保存在 `sdk-package-analysis/`。该报告是本地包分析，不代表 AGC 在线合法性或上架自检。

## 记录与范围

- [完整签名与内容验证](verification.json)
- 官方日志：`new-profile-verify.log`、`new-app-verify.log`、`new-hap-verify.log`。
- 本机最新校验文件：`release/v2.1.2/mobile-web/SHA256SUMS.txt`。
- 旧主体交付清单和验收报告副本：`release/v2.1.2/verified/pre-owner-change-20261023/`，历史远端发行未修改。
- 新证书、Profile、私钥和密码仅在 `.upgrade-private/harmony-signing/`，不加入公开报告、源码 ZIP 或归档安装包附件。

本次未修改应用功能，不把以往功能回归记作重新运行。没有新增鸿蒙真机验收或 AGC 在线上传结论。重新上传后须由当前主体后台确认合法性检查结果。

## 后续云打包

HBuilderX 仍使用 `release/v2.1.2/mobile-web/harmony-cloud-source/`。该干净项目及 ZIP 不包含私钥或发布证书；再次云打包时，必须选择本次新主体的证书和发布 Profile，不能继续选择旧主体材料。

本次临时解包、规范化证书链、签名中间包和核验目录在完成后清理。用户原始签名材料及旧签名资料保留。
