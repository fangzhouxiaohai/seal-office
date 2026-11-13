# 2.7.2 后台发布与部署验收

核验日期：2026-11-13。后台及发布接口已再次部署，正式环境当前指向 `2.7.2-backend-20261113142454`。追加的紧凑后台、发布弹窗和 macOS 更新能力已上线。服务端全量测试通过 85/85，附件用例 13/13，部署专项 10/10；隔离后台浏览器操作通过 13 项，另有真实 Nginx 范围请求回归 5 项通过。Windows 安装版、微软商店、Ubuntu、Android、HarmonyOS 和 Web 六个平台的 2.7.2 稳定版均已正式上架，附件及匿名更新查询核验完成。能力支持七平台，尚无真实 macOS DMG，因此不发布 macOS 记录。

## 验收结果与证据

| 范围 | 结果 | 可公开证据 |
| --- | --- | --- |
| 服务端全量测试 | 85/85 通过，失败、取消、跳过均为 0 | [测试摘要](backend-tests.json) |
| 发布附件用例 | 全量中的 13/13 通过，包括 5 项新增 macOS 回归及原六平台兼容 | [测试摘要](backend-tests.json) |
| 部署专项 | 10/10 通过，包含依赖、旧构建拒绝、配置恢复、后台恢复、公网探针及重复部署 | [测试摘要](backend-tests.json) |
| 隔离后台浏览器 | 13 项通过，无脚本错误；实际上传并仅发布所选平台，键盘及全部页面宽窄布局通过 | [浏览器报告](backend-isolated-ui.json) |
| 正式后台只读浏览器 | 真实六条平台记录按 2.7.2 版本分组展示；发布弹窗七平台默认未选，1440/390 宽度无页面横向溢出，5 项检查通过 | [正式页面报告](backend-production-ui.json) |
| 部署时公网探针 | 能力接口、更新接口、后台、分享页、脚本和样式共 6 项通过；这是正式附件上架前的历史快照 | [公网检查](backend-public-probes.json) |
| 正式平台更新查询 | 六个平台以 2.7.1 查询均能发现 2.7.2；以 2.7.2 查询均为 `hasUpdate: false`；macOS 仍无更新 | [外部匿名检查](backend-update-external.json) |
| 正式部署状态 | 当前版本 2.7.2，发布与附件模块存在，默认 TLS 校验开启 | [部署记录](backend-deployment.json) |
| 五个安装平台上架 | GitCode 完整拉取、冻结摘要一致、原管理员上传与批量发布 API、公开完整下载全部通过 | [安装平台发布](backend-update-apps.json) |
| Web 上架 | 独立发布与完整下载、旧版和新版查询通过，后续五平台发布未改变该记录 | [Web 发布](backend-update-web.json) |
| 附件范围下载 | 真实 Nginx 隔离回归先红后绿 5/5；正式修复后六平台 HEAD 200、首尾 206 且字节匹配 | [路由修复](backend-range-fix.json)、[外部匿名检查](backend-update-external.json) |
| GitCode 七附件 | 六个成品和 SHA256SUMS.txt 共 1,665,494,386 字节，匿名完整下载的大小与摘要全部匹配 | [GitCode 完整验证](gitcode-assets-verified.json) |

上述测试范围有包含关系，附件 13 项已包含在全量 85 项中，不能重复相加。此前 80/83 项全量、22/26 项组合定向属于追加检查之前的历史验证。最新统计来自本轮实际执行日志，本归档只保留必要摘要，不复制完整日志。

Nginx 范围请求的 5 项使用真实 Nginx 与独立 Unix 套接字、隔离源站执行，独立于服务端 85 项；正式浏览器 5 项与隔离交互 13 项也属于不同验收环境。

## 故障原因与修复结果

原生产环境仍运行 2.7.0 后端，缺少 `releases.cjs`，后台也仍是旧入口资源。因此 2.7.1 客户端的匿名更新请求落入旧服务的登录检查并返回 401，后台没有版本管理入口。本地部署清单同时漏了新模块，后台产物也未重新构建。

本次补齐发布模块及附件模块的部署依赖，使用源码和产物摘要约束后台构建，部署时拒绝旧构建。候选后端先用独立临时数据目录真正启动，验证能力与平台更新接口，再切换正式目录。生产服务使用 8096 端口；大文件上传另设 Nginx 路由和 1 GiB 上限，避免沿用普通业务接口的较小限额。

第一次实际切换后，远端旧 `curl 7.29.0 / NSS 3.90` 的公网 HTTPS 探针报错 60，原始错误为 `Certificate key usage inadequate for attempted operation.`。部署脚本已自动恢复原后台、后端及 Nginx 配置。只读比较证实，同机 Node.js 默认 TLS 请求可以正常验证并获得 200。

公网验收现改用 Node.js 原生 `fetch` 默认 TLS 校验，明确拒绝 `NODE_TLS_REJECT_UNAUTHORIZED=0`，没有使用 `curl -k` 或关闭证书验证。探针严格要求 200、正确内容类型、有效能力和更新协议；后台入口与脚本、样式须与本次构建的 SHA-256 一致，分享页须返回实际下载页面。增加的 4 项回归先失败后通过。第二次部署成功，随后独立只读核对了正式目录与公网内容。

最后一次部署后，本机补充核验曾遇到一次连接超时；没有修改 TLS 设置。随后能力接口单次请求及完整公网复核均成功，七平台查询和本次构建资源摘要通过；最终再次通过已验证主机指纹的 SSH 只读确认正式指针仍为 `2.7.2-backend-20261113142454`。

回滚会保存两份 Nginx 补丁的原内容和原本不存在的状态。恢复后台时，即使当前目录缺失，仍可从本次唯一备份恢复；移动失败立即报错，不会把旧目录嵌套到未移走的当前目录中。配置、后台、后端恢复分别执行，单项失败不会跳过其余恢复步骤。本轮未重传未改动的分享页。

追加需求后的首次重部署在切换前遇到 `EEXIST`：复制当前发布目录时一并继承了上轮配置备份，同名防覆盖写入拒绝继续，正式服务没有变化。补充回归后，配置备份改存站点独立的 `deployment-config-backups/<本次发布目录名>/`，位于 `current` 和 `releases` 之外，避免以后复制旧备份并累积；旧线上回滚资料保持不动。新测试真实模拟复制旧目录、备份当前配置及恢复，并确认旧备份原样保留。随后重部署成功。

## 最新界面与弹窗

全站采用 60 像素深炭灰顶栏、200 像素深灰侧栏、直角蓝色选中导航、浅灰内容区、18 像素页面标题和 13 像素紧凑表格；登录页及八个管理页面使用同一套品牌与组件样式。窄屏通过菜单按钮展开导航，保留原有中文业务入口。

版本管理首页只显示列表、紧凑筛选和右上角“发布版本”按钮。按钮打开约 1120 像素宽、最大 95vw 与 90dvh 的 NModal，表单内部滚动，标题和底部操作保持可达。现有 Naive UI 负责焦点限制，打开后聚焦版本号，ESC 与取消可关闭并返回触发按钮；上传或提交期间拒绝关闭并明确提示原因。上传完成后清除保护提示。取消不发布；校验失败保留输入，成功关闭弹窗并刷新列表。

## 发布管理能力

后台按版本和通道分组管理，七个平台可分别选择、上传与发布；默认不选平台，未选择的平台不产生记录。各平台附件互相独立，共用版本说明、通道及强制更新设置。管理员仍可按平台修改、下架和删除发布；本轮没有删除或覆盖旧版生产记录。

旧 `releases` 表和单平台管理 API 保留，只新增可空附件关联字段。新的批量发布先校验所有条目，再在事务中插入；重复平台、平台或版本错配会拒绝，任何已有记录冲突均返回 409，整批不写入，不覆盖存量记录。

安装包按原始二进制流顺序写盘，由服务器生成 SHA-256 和准确字节数。校验覆盖管理员身份、请求大小、磁盘余量、规范文件名、语义化版本、路径、文件头和压缩容器结构；上传中断或格式错误会清除临时文件。微软商店的 ZIP64 容器有单独回归。Windows、macOS、Ubuntu、网页、Android、HarmonyOS 和商店附件均绑定实际平台，不能通过客户端伪造元数据改变附件平台或版本。

macOS 校验读取文件末尾 512 字节，核对 `koly`、版本 4、结构长度 512、单文件分段标记、非空数据与扇区数，并用 BigInt 校验数据区、资源区和 XML 区的偏移、长度及重叠。XML 长度可以为 0；不把它误判为无效。结构依据项目官方一手资料：[QEMU DMG 驱动](https://github.com/qemu/qemu/blob/master/block/dmg.c)、[libmodi 格式文档](https://github.com/libyal/libmodi/blob/main/documentation/Mac%20OS%20disk%20image%20types.asciidoc)。这属于容器结构验收，不等同于 Apple 签名、公证或真实 macOS 安装验收。

最终审查另发现仅提供 HTTPS URL 可绕过 macOS 附件上传。新增的单项和批量 API 回归先实测得到错误的 200，再在新建校验中要求 macOS 必须绑定经过服务器验证的 `assetId`；两条用例修复后通过，批量失败不写入其他平台。该限制只作用于新建，历史无附件记录仍能修改备注、上架和下架；已绑定附件的 PATCH 继续强制使用服务器的地址、摘要和字节数。限制已再次部署，远端两个发布模块的 SHA-256 与本地源码逐一匹配，并实际验证重复部署可完成。

附件上传与下载的鉴权不同：上传需要管理员令牌；匿名下载仅允许已经上架的发布记录引用的附件，未发布或全部下架后返回 404。下载支持 `GET`、`HEAD` 和单段范围请求。商店 MSIX 附件与微软商店更新链接分别存储，客户端仍通过商店链接更新。

## 正式六平台发行与范围下载

Web 由主任务先完成正式发布。随后在正式服务器匿名下载 GitCode 的五种安装包，逐个按冻结清单核对完整大小和 SHA-256，再通过回环 `127.0.0.1:8096` 的原管理员上传 API 接收、校验格式并计算摘要，最后提交一笔五平台批量发布。管理员口令只经已核对指纹的 SSH 加密通道传入进程内存，没有写入服务器文件或日志；没有直接写数据库。上传前后逐字段核对原有 Web 记录，确认未变。

五个平台的后台公开 HTTPS 附件均在服务器侧不携带管理员令牌完整下载，全部字节与冻结成品匹配。随后本机从外部网络独立验证六个平台的真实 `asset.url`：HEAD 返回 200 和准确大小，首尾各 65,536 字节返回 206、准确 `Content-Range`，并与本地冻结成品对应字节摘要一致。六个平台的 2.7.1 均发现 2.7.2，2.7.2 均没有更新；微软商店仍返回原商店链接，macOS 不产生发布记录。完整下载验证的位置与本机范围验证的位置在报告中分别标明。

本机首次范围请求曾实测得到 200。进一步比较发现：回环原 API 正确返回 206，而公网 HTTPS、以及保留正式域名、SNI 和正常证书验证的 `127.0.0.1:443` 直连都返回 200。实际 `/www/server/nginx/conf/nginx.conf:27` 引入 `proxy.conf`，后者第 12 行设置 `proxy_cache cache_one;`；附件路由继承该缓存配置。Nginx 官方文档说明启用代理缓存时默认不向上游传递 Range 等请求头，`proxy_cache off` 可以取消上层继承的缓存。[Nginx 代理模块文档](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header)

先用真实隔离 Nginx 复现 `200 != 206`，再仅在 `location ^~ /api/v1/release-assets/` 添加 `proxy_cache off;`。5 项回归覆盖 HEAD、首段、尾段、非法范围 416 和上架状态变化后的源站检查；部署专项 10/10 再次通过。正式旧补丁保存在独立配置备份目录，`nginx -t` 与重载成功，正常 TLS 直连及本机外部六平台请求均恢复正确 206。此操作未改变全局缓存、其他路由、后端指针或任何发行包。

同一轮服务器源下载另形成 GitCode 七项完整验证，包括五种安装包、Web ZIP 和 581 字节的 `SHA256SUMS.txt`。报告保留最初公开下载地址、最终 HTTP 状态、开始和结束时间、实际大小与摘要；不保存 CDN 临时签名查询参数。该证据可复用，无需再次把全部大型附件传回本机。

## 管理员 API 契约

下表路径均相对 `https://seal.xingmasoft.com/api`。除登录外，管理请求使用 `Authorization: Bearer <令牌>`。

| 方法与路径 | 请求 | 返回或行为 |
| --- | --- | --- |
| `POST /v1/admin/login` | JSON：`username`、`password` | 返回管理员 `token` |
| `POST /v1/admin/release-assets?platform=…&version=…&filename=…` | 原始二进制；`Content-Type: application/octet-stream`；准确 `Content-Length` 必填 | `{item:{id,platform,version,filename,url,sha256,bytes,createdAt}}` |
| `POST /v1/admin/releases/batch` | 共用版本信息与 `platforms` 数组 | `{items:[发布记录…]}`；任何冲突整批 409 |
| `GET /v1/admin/releases` | 可沿用原筛选参数 | 发布记录及服务器分组统计 |
| `GET /v1/updates/latest` | `platform`、`version`、`channel` | 匿名查询当前平台更新，保留原协议 |
| `GET/HEAD /v1/release-assets/{id}/{filename}` | 无管理员令牌 | 仅已发布附件可公开下载 |

批量请求示例：

```json
{
  "version": "2.7.2",
  "channel": "stable",
  "notes": "本次更新说明",
  "mandatory": false,
  "minVersion": null,
  "platforms": [
    {"platform": "windows", "assetId": "上传返回的附件标识"},
    {"platform": "windows-store", "assetId": "商店附件标识", "url": "ms-windows-store://pdp/?productid=9NGPL705R5Z3"},
    {"platform": "linux", "assetId": "Ubuntu 附件标识"}
  ]
}
```

仅发布部分平台时，只保留需要发布的条目。服务器依据 `assetId` 读取平台、版本、下载地址、大小和摘要，不采用客户端伪造的摘要与字节数。

macOS 的单项和批量新建均必须提供已校验 DMG 对应的 `assetId`，仅填 URL、摘要和字节数仍返回 400。历史记录修改接口保持兼容。

| 平台标识 | 2.7.2 标准附件名 |
| --- | --- |
| `windows` | `seal-office-setup-2.7.2.exe` |
| `windows-store` | `seal-office-2.7.2-microsoft-store-x64.msix` |
| `macos` | `seal-office-2.7.2-macos.dmg` |
| `linux` | `seal-office-2.7.2-amd64.deb` |
| `web` | `seal-office-2.7.2-web.zip` |
| `android` | `seal-office-2.7.2-android.apk` |
| `harmony` | `seal-office-2.7.2-harmony.hap` |

单包最大 `1,073,741,824` 字节，可通过 `SEAL_RELEASE_MAX_BYTES` 下调，不允许超过默认上限。`SEAL_PUBLIC_API_URL` 可设置合法 HTTPS 公开 API 基地址。微软商店产品 ID 沿用仓库原配置，本轮未修改管理员账号密码、商店身份或签名。

## 可重复验证

以下命令在仓库根目录执行；浏览器验收脚本自行启动隔离后端，不连接生产环境。

```powershell
npm --prefix server test
node --test server/test/releases.test.cjs server/test/releaseAssets.test.cjs scripts/deploy-server.test.cjs
node --test scripts/deploy-server.test.cjs
node --test server/test/releaseAssets.test.cjs
node --check scripts/deploy-server.cjs
node server/admin/build.cjs
node scripts/deploy-server.cjs --dry-run
$env:ELECTRON_RUN_AS_NODE = $null
& .\node_modules\.bin\electron.cmd scripts/verify-release-admin.cjs
```

真实 Nginx 回归在具备 Nginx 的 Linux 环境执行，使用独立临时目录和 Unix 套接字，不加载正式站点或接触生产业务数据：

```bash
node scripts/verify-nginx-release-range.cjs server/deploy/nginx-release-assets.conf /www/server/nginx/sbin/nginx
```

发布与附件定向检查覆盖：匿名协议与版本比较、通道隔离、强制更新、限流、管理员鉴权、旧 API、存量记录迁移、部分平台发布、整批冲突回滚、平台错配、上传格式与大小限制、超过普通接口限额的流式文件、ZIP64、上传中断清理，以及已发布附件的真实下载与范围读取。

后台构建与部署预检通过，部署包包含 24 个文件，入口依赖链共 20 项。客户端相关的此前定向验证为主进程更新 11/11、设置页更新 15/15，具体客户端验收由主任务统一归档。既有构建大分块提示、测试环境假定时器与伪元素提示未导致相关断言失败。

## 页面截图

正式服务器截图已更新为六个平台上架之后的真实状态。截图脚本仅登录、读取列表以及打开和取消发布弹窗，没有选择附件、上传或提交发布；实际列表响应断言 2.7.2 稳定版恰有六个平台，全部已上架并绑定附件。桌面截图为 1440×1000，窄屏截图为 390×1000；窄屏导航折叠，页面整体无横向溢出，数据表保留内部横向滚动。列表按版本分组，因此显示一个 2.7.2 版本行及其六个平台，而非六个重复版本行。

正式截图对应后端目录 `2.7.2-backend-20261113142454`，后台入口和样式与此前验收相同。后续 Range 修复只改变附件下载路由，没有改动界面构建。

- [正式后台：1440 宽度](后台正式环境-1440.png)
- [正式后台：390 宽度](后台正式环境-390.png)
- [正式发布弹窗：1440 宽度](后台正式弹窗-1440.png)
- [正式发布弹窗：390 宽度](后台正式弹窗-390.png)
- [隔离交互验收：1440 宽度](后台隔离验收-1440.png)
- [隔离交互验收：390 宽度](后台隔离验收-390.png)
- [隔离弹窗：390 宽度](后台隔离-发布弹窗-390.png)
- [隔离弹窗滚动到底部：390 宽度](后台隔离-发布弹窗-390-底部.png)
- 登录、运行概览、账号、三类公开内容审核、操作记录和转换页的宽窄截图索引见 [隔离浏览器报告](backend-isolated-ui.json)。

隔离截图使用真实后台构建和独立数据库，包含为了验收而生成的 Windows 合成文件与单平台记录。它们证明交互路径可用，不代表正式发行包、平台签名或真实设备安装验收。

## 归档与验收边界

- 本目录仅包含摘要 JSON、说明和经过查看的页面截图；不含凭据、令牌、浏览器资料目录、完整部署命令或原始日志。
- `backend-public-probes.json` 是正式包发布前的部署历史快照；正式六平台发行以 `backend-update-apps.json`、`backend-update-web.json` 和 `backend-update-external.json` 为准。后者包括当前版本与旧版本查询、真实附件大小和字节验证，不能只凭 `hasUpdate: false` 推定已发布。
- 容器结构检查不代替平台签名验证、完整包内版本验证与真实设备安装验证。正式发布必须使用已经验收的成品，并比较服务器返回的 SHA-256 与本地值。
- 原隔离浏览器资料目录 `.upgrade-private/v2.7.2-release-admin/profile` 的递归清理曾被自动审批拒绝，只返回“策略阻止”，没有给出更具体原因。该目录按要求保留，没有更换工具绕过拒绝，也没有复制到本归档。正式页面核验使用独立且不持久的会话分区，浏览器运行资料亦未归档。
- 本轮依用户授权部署后台并正式新增五个平台的本版发布，原有 Web 记录保持不变；没有创建生产测试发布、改动旧记录或直接操作生产数据库。正式页面验收只登录与读取。macOS 没有真实 DMG，因此保持该平台未发布，HarmonyOS App Pack 亦未作为公开附件上传。
