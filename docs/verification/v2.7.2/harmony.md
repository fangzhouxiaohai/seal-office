# 2.7.2 鸿蒙构建与验收

验收日期：2026-11-13。最终网页资源包含本轮更新提示异常分支修复，版本为 `2.7.2`，原生构建号为 `20702`，应用身份为 `com.sealoffice.mobile`。

已完成本机 HAP、App Pack 构建、官方独立验签、包内逐文件核对和 7 组共 45 项浏览器回归。机器记录见 [harmony.json](harmony.json)，完整浏览器断言见 [harmony-browser.json](harmony-browser.json)。本机没有连接鸿蒙设备，未完成真机安装或 AppGallery 提交验收。

## 最终交付物

| 文件 | 字节数 | 用途 |
| --- | ---: | --- |
| `release/v2.7.2/seal-office-2.7.2-harmony.hap` | 66,487,475 | 独立签名的 HAP，作为仓库鸿蒙附件；安装渠道受下述发布 Profile 限制 |
| `release/v2.7.2/seal-office-2.7.2-harmony.app` | 42,133,853 | 原始已签名 App Pack，仅本机保留供 AppGallery 上架，不上传仓库发行页 |
| `release/v2.7.2/mobile-web/seal-office-2.7.2-harmony-cloud-source.zip` | 37,988,435 | 冻结的鸿蒙源码归档，不是安装包 |

SHA-256：

- HAP：`9089706f31b7a3fc18486041b488d15b8cfd18c5dcc8cc54f95d0128aa717d29`。
- App Pack：`539aae514ca6effd1431d7e58f305dc61071c40318e64246be873dabc82d900a`。
- 源码 ZIP：`217729ad17c3f6f40955fe542363b5e5f75594f30716258dfd5511ddc7250695`。
- 最终 `office.js`：`8ac9ca5dc46fbaecc9cfa6dafec0c02ac54b17d03a271b3d14e7776f9c56aa87`。

## 构建过程与资源一致性

本轮先运行 `npm --prefix mobile run build:harmony` 和 `npm --prefix mobile run check:harmony`，分别生成鸿蒙专用资源和 UTS 原生页面编译结果。HBuilderX 命令行此前无法连接图形界面，因此使用已存在的本机生成工程，经过 `repack-harmony-generated.mjs` 的版本、身份、文件清单和返回协议核对后同步本轮产物，不复用旧网页资源。

后备脚本原先把编译器的临时变量名写死。本轮改为解析布尔及数值读取器、导出与导入映射，再核对返回桌面分支的就绪状态、返回许可、序号和退桌面调用。7 项脚本回归全部通过，重新分配压缩变量名不会误判为旧编译产物。

使用 DevEco Studio 自带的 Hvigor，以 `release` 产品及构建模式依次运行：

```text
hvigorw.js --mode module -p product=release -p module=entry@default -p buildMode=release assembleHap --no-daemon
hvigorw.js --mode project -p product=release -p buildMode=release assembleApp --no-daemon
```

初次命令因进程环境缺少 `DEVECO_SDK_HOME`、尚未执行任何构建任务而失败。核对本机 SDK 后，仅在构建子进程设置 `DEVECO_SDK_HOME=E:/DevEco Studio/sdk` 和 `NODE_HOME=E:/DevEco Studio/tools/node`，未改系统环境。最终 HAP 和 App Pack 均构建成功。工具链为 uni-app x 5.34、HarmonyOS SDK 26.0.0.105。构建保留第三方运行库已有的警告，未将警告描述为零诊断。

最终冻结目录为 `mobile/unpackage/cloud-ready/2.7.2/harmony-validated/`。HAP 的 `module.json` 明确关闭调试，类型为 `entry`，身份、版本及构建号与项目一致。HAP 与 App Pack 均通过 ZIP CRC 核对；HAP 中 57 个工作台文件与生成工程逐字节一致，31 个实际办公资源与冻结源码逐字节一致。生成工程中的空 `.gitkeep` 不进入 HAP，未排除任何图片、字体或运行资源。原生工作台脚本与本次原生编译器产物的字节完全一致。

两份完整字库、字体许可证、模板图片及其摘要均保留。源码归档包含 57 个文件，解压后总字节数为 60,017,846；归档脚本验证所有文件 CRC、SHA-256、完整字体及模板图片，且确认原生检查覆盖同一份 `office.js`。Android 的 60,000,000 字节限制不适用于该鸿蒙源码归档。

## 签名及安装渠道

使用 DevEco Studio 自带 `hap-sign-tool verify-app` 分别检查独立 HAP 与外层 App Pack，均返回 `verify-app success`。两者的完整证书链与原证书链一致，提取的 Profile 与原文件逐字节一致。叶证书 SHA-256 为 `9C1A6D76D4F18367FE1A8D5DD4D7EE71E201DF04F6CA055A56883528458DCECB`，Profile SHA-256 为 `1441d31f07044f357a3e1d3ca526e4be23bab662441f157cb07359671956f2b4`。

Profile 类型为 `release`，分发类型为 `app_gallery`，不含调试设备 UDID。该 HAP 需要经 AppGallery（含测试渠道）安装；直接通过 hdc 安装到指定设备，需要包含其 UDID 的调试 Profile。`hdc list targets` 实测返回 `[Empty]`，因此本报告不声称已经真机安装。

App Pack 内部的 `entry-default.hap` 经官方工具实测没有独立签名，不能把它解压后当作仓库发行附件。仓库附件来自独立的 `entry-default-signed.hap`。内层与独立 HAP 的应用文件字节一致，仅独立签名元数据 `.pages.info` 和格式不同但语义相同的 `pack.info` 有差别。

华为官方 FAQ 说明，应用市场验证 App Pack 签名后拆包，再给内部 HAP 签名；本机 Hvigor 的 `appWithSignedPkg` 默认关闭，其内层签名任务也符合这一流程。[AppGallery Kit FAQ](https://developer.huawei.com/consumer/cn/doc/harmonyos-faqs/appgallery-kit-faq-0005/)、[应用发布 FAQ](https://developer.huawei.com/consumer/cn/doc/App/agc-help-releasefaq-0000001110342644/)。本次保留 Hvigor 输出的 App Pack 原字节，没有手工改写 ZIP，也没有进行商店上传和审核验收。

## 浏览器回归

最终执行原始 `mobile/scripts/browser-check.mjs --file --source <冻结目录>/static/office`，全部组使用同一份最终生产资源：

| 组 | 通过项数 |
| --- | ---: |
| 核心读写与持久化 | 20 |
| 全屏阅读与触控 | 2 |
| 编辑操作 | 5 |
| 工作区工具 | 1 |
| 脑图及流程图 | 8 |
| 智能助手 | 7 |
| 格式编辑 | 2 |
| 合计 | 45 |

7 组全部通过，运行时错误为零。聚合记录包含平台、版本、文件加载方式、每项断言和资源摘要；摘要与正式 HAP 内 `office.js` 一致。

此前阅读夹具失败并非生产文件打不开：调用追踪确认测试文件选择和读取均成功，随后鸿蒙发出 `font-system-list`，而浏览器宿主模拟没有回复，导致 15 秒接口超时超过夹具的 10 秒等待。原生工作台实际已实现该消息。仅给两份测试宿主补充明确的空系统字体目录回复，内置字体继续读取真实文件，未修改生产代码、放宽等待或删除断言；修复后原始脚本完整 45 项通过。

这些检查在 Electron 浏览器与模拟原生宿主中执行，不等同于真实鸿蒙设备验收。并发期间通用截图文件名可能被 Web 测试覆盖，因此未把这些 PNG 作为本轮鸿蒙最终证据归档。

## 源码项目同步与保留项

`harmony-mobile/` 中归档清单列出的 57 个正式源码文件已全部更新，并逐字节核对为与最终 ZIP 相同。该 ZIP 自身不包含 `unpackage`、依赖或构建缓存。

整目录删除并替换 `harmony-mobile/` 的命令被自动审批审查拒绝，返回原因为 `blocked by policy`，未提供更具体原因；拒绝后没有重试该递归操作，也没有换工具完成同一删除。改用归档清单逐文件复制后，按照主流程要求保留原目录中的历史生成工程及配置：`unpackage/` 下 5,141 个历史文件和 1 个旧 CSS 文件仍存在。因此只能确认正式源码清单与 ZIP 一致，不能声称整个解压目录与 ZIP 完全一致或已清空全部历史缓存。原签名文件及用户原件未删除。

本轮旧源码 ZIP 与其校验报告在核对版本和原摘要后，按两个明确文件路径精确替换为最终归档；该操作通过，未扩大到历史缓存目录。相关差异和保留状态已记录在 `harmony.json` 的 `sourceProjectSync` 中。
