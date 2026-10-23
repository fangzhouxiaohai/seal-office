# 2026-10-23 云打包成品核验：需要使用最新源码重新构建

本次返回的 Android APK 与 HarmonyOS App Pack 均为 2.1.2 / 20102，应用身份正确，签名有效；但包内全部 28 个编辑器资源都与 `release/v2.1.2/verified/` 下的旧快照完全相同，不包含本轮移动端与 Web 同步修复。因此本次发行验收未通过，没有将这两份旧构建上传为最新修复版，也没有修改已签名文件或替换历史发行附件。

详细字节、资源、CRC、平台和签名核验见 [cloud-return-20261023.json](cloud-return-20261023.json)。浏览器及原生源码编译的既有验收不能代替返回成品的资源核对；本次没有进行 APK / HarmonyOS 真机安装验收。

| 项目 | Android 成品 | HarmonyOS 成品 | 本轮最新源码 |
| --- | --- | --- | --- |
| 内置资源构建时间（北京时间） | 10 月 22 日 01:28 | 10 月 22 日 01:32 | Android：10 月 23 日 13:54；HarmonyOS：14:01 |
| 编辑器 SHA-256 | `618baabe2a30bae60ecfe2ac4c351e41c06a603f920675c954ff88c4afc7bc2d` | `618baabe2a30bae60ecfe2ac4c351e41c06a603f920675c954ff88c4afc7bc2d` | `e2f3a5ed4bb7103878f6f17d6fe779f4c656e947364961579d40e953466ce2b7` |

与最新源码相比，两端均缺少新 CSS，且 `office.js`、`index.html`、`build-info.json` 不同；旧 CSS 仍在。签名有效证明原包完整，不能证明它包含这次修复。HarmonyOS 外层 App Pack 的签名和摘要通过，内层 HAP 没有独立签名，不单独发布为可安装 HAP。

重新云打包须使用以下两个 ZIP，完整解压到各自的新目录，再在 HBuilderX 打开对应目录并选择对应平台。不要继续从旧 `verified/android`、`verified/harmony` 项目提交，也不要将其中的 `static/office` 或 `unpackage` 复制进新项目。两个平台分别提交，继续沿用现有应用身份和签名。

- Android：`release/v2.1.2/mobile-web/seal-office-2.1.2-android-cloud-source.zip`，SHA-256 `befe4c48b6807f3cfbb0e60eac3576b278e0aff4af8339a47937636080d241a5`。
- HarmonyOS：`release/v2.1.2/mobile-web/seal-office-2.1.2-harmony-cloud-source.zip`，SHA-256 `21aef4acb56f1e168fca3992622e592c039d1256417c62303a4df05c4706cd28`。

这两份 ZIP 已重新进行全文件 SHA-256 和 CRC 核验，各含 59 个文件，解压后均为 59,799,985 字节。Android ZIP 为 38,531,176 字节，HarmonyOS ZIP 为 38,531,184 字节。Android ZIP 和解压体积均小于 60,000,000 字节；两份平台元数据分别正确。源码版本仍为 2.1.2 / 20102，命名、应用 ID 和签名配置不变。

最新源码、测试和网页版发布仍对应 `v2.1.2-mobile-web` / `c5c730254ccb09c3a1dcd314f33123931c7c1f7e`；本次记录不移动已发布标签。新成品返回后，应再次与上述源码逐文件核验，通过后才归档并补充发布。
