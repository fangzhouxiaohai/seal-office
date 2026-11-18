# 管理前端来源与构建

本目录以用户提供的 `tpadmin-master/web` 源码为基础，保留其 Vue 3、TDesign、Pinia、动态路由及管理布局，并接入海豹办公业务页面。上游的 Apache 2.0 许可证见 `TPADMIN-LICENSE`。原始目录及其独立 Git 状态没有修改。

安装和构建：

```text
npm ci --ignore-scripts
npm test -- --environment happy-dom
npm run build
```

构建资源使用 `/admin-assets/` 前缀。生产中管理首页由站点根路径返回，普通业务请求经 `/seal-admin/api/`，登录、退出以及安装包上传和原文件下载使用现有云服务接口。前端只在当前浏览器会话保存既有管理令牌；身份与业务权限由服务端检查。
