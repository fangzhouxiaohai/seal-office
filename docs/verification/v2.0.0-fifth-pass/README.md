# 海豹办公 2.0 脑图/流程图云协作验收

完成时间：2026-10-18T17:34:58.177Z

本次完成个人云同步、共享和团队图形实时共同编辑、离线加密恢复、角色降权/撤销、移动端适配。保留原本机多项目列表及现有界面风格。使用方法见 [脑图云协作](../../脑图云协作.md)。

- 前端完整回归：258 个文件 / 2508 项，全部通过。
- 主进程完整回归：107 个文件 / 1032 项，全部通过。
- 服务端 33 项；移动单元 27 项；打包 11 项；OCI 2 项；Python 部署/命名/镜像 13 项。
- 正式 Web、原生 file、原生 HTTP 各 35 项原功能验收；新增云图形双窗口验收共 36 项；共享/设备/标签/团队原界面 4 项。
- 37 项格式转换、11 项安装包内编解码；Windows 解包/便携各三阶段运行检查；Linux DEB 与包内完整性通过。
- Android/HarmonyOS UTS 编译及源码快照通过，当前资源与 Android 快照逐字节一致。
- Web 已发布并完成公开浏览器验收：[在线入口](https://seal.xingmasoft.com/office/)。后端 diagramRealtime 能力已升级，原有数据库行、后台、转换服务及配置保留。

详细证据见 [总报告](verification.json)、[云协作](diagram-cloud-collaboration.json)、[移动端](mobile.json)、[后端部署](backend-deployment.json)、[Web 部署](web-deployment.json)。构建和测试均使用最终冻结源码，并逐文件核对 SHA-256。

- No complete WPS feature/format parity is claimed. Existing compatibility boundaries are unchanged and freshly regression-tested.
- Linux cross-build archive checks passed; Linux installation and GUI runtime were not performed.
- Windows unpacked and portable runtime checks passed; EXEs are unsigned and NSIS installation/uninstallation was not performed.
- Android/Harmony cloud snapshots and UTS/browser checks passed; APK/HAP generation, signing and physical-device validation remain for cloud packaging.

## 发行文件

- `release/v2.0.0/seal-office-setup-2.0.0.exe` · 399078083 bytes · SHA-256 `7dff73db3ab55d1cd276e0119043031d8614b770304915e8f65e3821f6f0d9f1`
- `release/v2.0.0/seal-office-2.0.0-portable.exe` · 398852619 bytes · SHA-256 `77dac7e2f596e1eecc1c18f545d52d6999a95c5c1958dd86c8a9b8e61b168b26`
- `release/v2.0.0/seal-office-2.0.0-amd64.deb` · 125927320 bytes · SHA-256 `444d07edc06abea1d9b391f8fdc3a316e14187c5391920e360305942182c75e5`
- `release/web-2.0.0-fifth-pass/seal-office-2.0.0-web.zip` · 56221460 bytes · SHA-256 `6f25e930f9603edbb8f2d3e2a0577b393bef45fc93764d28f92bcadbd16ec144`
