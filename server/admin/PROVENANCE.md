# 管理后台来源

前端基础采用用户指定的 [Panshi](https://gitee.com/aizuda/panshi)，固定提交 `72bfab22cee7f80f4e9a6feaf53a45ca492b9e36`，保留 Apache 2.0 许可证。构建脚本取其 Vue、Naive UI 工程及应用上下文组件，覆盖入口、管理页面和构建配置；后台业务连接海豹办公云服务 API。

本次没有部署上游 Java 业务服务。普通账号通过短信登录，管理后台使用独立管理员凭据。管理员仅可查看账号用量、操作记录与用户主动发布的公开资料，不提供私有文档解密能力。

执行 `node server/admin/build.cjs` 构建到 `server/admin/dist`。原始上游工作目录、依赖和输出不提交仓库。管理员密码哈希与短信凭据仅在服务端环境文件中配置。
