# 海豹办公管理接口适配

本目录复用用户提供的 `tpadmin-master/server` 的轻量 HTTP 路由、请求、响应和配置组件，在其上接入海豹办公管理业务。原项目在 Composer 中包含 ThinkPHP 8 生态依赖，但其自身文档说明 HTTP 内核与路由为自研实现；这里没有声称将原云服务迁移为 ThinkPHP 数据库服务。

`vendor-source/app/common/` 中的 12 个文件按同路径从原项目复制：`http/Request.php`、`http/RequestAwareInterface.php`、`http/Response.php`、`http/Router.php`、`exception/BizException.php`、`config/ConfigRepository.php`、`response/ApiResponse.php`、`response/ApiResponseFactory.php`、`response/ResponseFormatResolver.php`、`response/formatter/JsonResponseFormatter.php`、`response/formatter/XmlResponseFormatter.php`、`response/formatter/ResponseFormatterInterface.php`。复制文件未作修改；根许可证原样保留于 `LICENSE`。原目录根许可证为 Apache-2.0，但其 `server/composer.json` 标记 proprietary，发布分发前应核对权利人的授权与声明。

新增 `src/SealBridge.php` 和 `public/index.php`：动态菜单与权限来自 Node 原服务实际认证会话；其他管理 JSON 请求只允许明列的路径和方法，并通过 127.0.0.1:8096 转发原令牌，Node 仍是最终授权和业务数据来源。PHP 代理本身不使用独立账户、数据库、Redis，不能访问任意 URL。Node 使用与原业务数据库分开的 `admin-rbac.sqlite` 存储新管理员、角色、菜单设置与授权操作审计，继续兼容原环境变量超管；不创建默认密码，不修改原有业务记录。登录和退出继续经原 Node 接口，沿用其限流、会话有效期和注销语义。安装包上传与公开内容原件下载也保留原接口，避免 PHP 预读大文件；公开安装包分段下载配置保持原样。

PHP 请求上限 2 MiB，响应上限 16 MiB，超限明确失败；转换测试请求上游超时 200 秒。部署时应使用 PHP 8.2 的 FPM，并在 `/seal-admin/` 专用 Nginx 路由强制 `client_max_body_size 2m`、合理的请求读取时间及至少 210 秒的 FastCGI 超时，禁用缓存。必须在真实 Nginx/FPM 验证超长和分块请求、路径分发、未认证及撤销后的访问，并确认上传精确路由和 Range 下载配置未变。

本地执行 `php tests/bridge.test.php` 和 `python tests/http-test.py`。后者会在本机 8096 端口创建隔离模拟上游；端口占用时直接停止，不访问现存服务。
