# 海豹办公自建文档转换服务

手机、平板和 H5 共用此服务补充旧版文字、演示和部分开放文档的转换。常用 DOCX、XLSX、PPTX、CSV 等本地操作不依赖服务。转换接口使用与 PC 相同的 50 格式清单；不处理 WPS 专属格式，不运行宏。工作进程没有永久文档存储，任务完成或失败后删除临时目录。

## 项目管理后台托管

现有项目管理后台增加“文档转换”：查看引擎版本、启停、设置 1/2 并发、生成/重置访问令牌、运行真实 DOC 往返测试，以及检查最近任务的元数据。手机服务地址为 `https://seal.xingmasoft.com/api/office-converter`，令牌在后台生成后只显示一次；持久化配置只保存 SHA-256。管理控制令牌与手机访问令牌分别使用，管理通道不暴露给公网。部署和验收说明见[后台文档转换部署与验收](../../docs/后台文档转换部署与验收.md)。

托管模式运行 `managed.cjs`，通过现有云 API 的管理员会话管理；下面的独立部署模式继续使用 `index.cjs` 与环境变量令牌，适用于其他独立服务器。

运行环境：Node.js 20 或以上、LibreOffice Writer/Calc/Impress、中文字体。访问令牌通过环境变量设置，不进入仓库或日志。下面所有命令在项目根目录执行。

## Linux / Docker

```sh
docker build -f server/converter/Dockerfile -t seal-office-converter:1.9.11 .
# 首次生成访问令牌，保存在自己的密码管理器中：
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url')+'\n')"
# 在当前终端安全设置 SEAL_CONVERTER_TOKEN，勿提交 .env。
docker run -d --name seal-office-converter --restart unless-stopped \
  -p 127.0.0.1:8298:8298 --cap-drop=ALL --security-opt=no-new-privileges \
  --read-only --tmpfs /tmp:rw,nosuid,size=1g --memory=2g --cpus=2 \
  -e SEAL_CONVERTER_TOKEN seal-office-converter:1.9.11
```

在已有 HTTPS 域名的 Nginx 配置中加入 [nginx.conf.example](nginx.conf.example)。手机设置中心填写 `https://你的域名/office-converter` 和访问令牌，点击“测试连接”。浏览器允许来源可通过 `SEAL_CONVERTER_ORIGINS` 设置为逗号分隔的 H5 域名；默认允许跨域请求，但全部业务接口仍校验访问令牌。公网不要直接暴露无 TLS 的 8298 端口。

若不使用 Docker，设置 `SEAL_OFFICE_EXECUTABLE` 为 `soffice` 的绝对路径，再运行 `node server/converter/index.cjs`。Windows 可使用项目准备好的 `.upgrade-private/office-runtime/program/soffice.com`。默认监听 127.0.0.1:8298，不修改系统默认程序，也不自动打开防火墙。

## 行为与限制

- `GET /v1/capabilities` 返回协议、读取/输出格式和文件上限；`POST /v1/convert` 接收 `{inputFormat, outputFormat, type, data}`，data 是原文件 Base64，响应包含输出格式和 Base64 文档。两者都要求 `Authorization: Bearer <令牌>`。
- 单文件最多 20 MiB，同步任务最多 2 个，转换最长 90 秒；忙碌、损坏、加密或超限会返回明确错误。原文件不会在客户端被替换，保存仍由客户端执行来源指纹校验。
- 客户端每次上传前显示服务地址并要求同意。服务可读取该次转换的明文，不属于现有云盘的端到端加密存储。部署管理员应把服务视为可接触文档正文的受信任组件。
- 宏文档/加载项只导入正文，不执行或回写宏；OFD 使用本机阅读与 PDF 导出，不经过此服务。
- LibreOffice 与镜像内字体的许可证由镜像发行包附带；服务本身沿用项目许可证。首次构建需下载系统软件包，服务器运行时无需调用第三方文档转换网站。

运行协议与异常回归：`node --test server/converter/test.cjs`。真实格式和手机生产页面验收报告保存在发布验收附件中。
