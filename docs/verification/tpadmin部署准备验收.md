# 管理后台部署准备验收

截至本记录，尚未执行生产暂存或切换。原业务服务、生产数据库、现有后台目录及正式站点配置未由本次准备工作修改。

## 部署材料与隔离验证

- 独立 PHP 8.2 FPM 配置、systemd 单元和 Nginx 路由位于 `server/deploy/seal-admin-php-fpm.conf`、`seal-admin-php.service`、`nginx-tpadmin.conf`。使用专用 Unix 套接字；现有 PHP 主池及其 100 秒限制不修改。
- [真实服务器隔离 Nginx 与 FPM 验收](tpadmin-fpm隔离验收.json)包含 20 项通过及逐文件摘要：新旧静态资源路由、history 回退、白名单、认证、请求体限制、服务进程启停、配置错误恢复和实际私有探针。隔离实例不代表正式服务已切换。
- 本地真实 Electron 浏览器两组通过 17 项和 9 项，基于同一入口摘要，范围分别覆盖登录、窄屏弹窗、七平台及模拟上传、审核、转换令牌、会话失效，以及知识/皮肤、分页、强制更新、版本上下架、上传取消和模拟网络故障；不等同真实大文件上传或真机验收。
- `scripts/tpadmin-production.test.cjs` 在隔离目录验证五类目标的阶段失败恢复、服务原状态、候选冻结与旧资源冲突；`tpadmin-stage-remote.test.cjs` 验证逐文件摘要和额外文件拒绝；`tpadmin-production-runner.test.cjs`、`tpadmin-deploy-probe.test.cjs` 和 `tpadmin-fpm-config.test.cjs` 验证固定目标、探针和配置边界。
- `scripts/tpadmin-freeze.test.py` 验证源码、构建和浏览器报告绑定及变更拦截；`tpadmin-stage.test.py` 使用模拟 SSH 验证暂存和会话不落盘。另在服务器独立临时目录验证过真实 SFTP 独占创建及回读摘要，测试目录已删除。

## 执行与恢复

1. 在确认源码、构建和测试记录没有变化后，执行 `python -X utf8 scripts/tpadmin-stage.py stage`。脚本只创建唯一候选；先记录正式目标摘要，再上传并校验每个文件，将旧 `admin/assets` 以不覆盖同名异内容的方式合入候选，最后输出私有状态文件。
2. `python -X utf8 scripts/tpadmin-stage.py deploy --state <状态文件>` 才会进行切换。它重新检查本地冻结状态和远端目标及候选摘要，管理员临时会话只通过标准输入传递，不写入状态文件。
3. 切换按 PHP 程序、专用 FPM 配置、专用服务、私有探针、Nginx 配置、管理后台目录、只读公网探针的顺序进行；失败时恢复原有目标、Nginx 配置及专用服务状态，保留错误和备份供检查。现有 Node 服务及其数据库不重启或迁移。
4. 公网探针检查首页、history 路由、新旧资源摘要、Web、分享和客户端更新接口，以及未认证和管理员只读接口。真实安装包大文件上传和撤回等写操作不在生产探针中执行。
5. 如 SSH 连接在切换过程中中断，结果可能未知。必须先只读核对 Nginx 配置、后台目录、PHP 程序路径及专用服务状态，再决定恢复；不能直接重复执行或删除候选与备份。
