# 海豹办公云端管理（seal-admin-web）

海豹办公云端管理后台前端工程，基于 Vue 3 + Element Plus + Vite + TypeScript，用于替换现役 TDesign 版管理后台，对接 Spring Boot 重构后端（接口形态与现役 Node 版一致）。

## 技术栈

- Vue 3（组合式 API）+ TypeScript
- Element Plus + @element-plus/icons-vue
- Vite 5，构建产物输出 `dist/`
- Pinia 管理会话状态，Vue Router history 模式

## 目录约定

- 部署路径为站点 `/admin/`：`vite base` 与 `createWebHistory('/admin/')` 已固定，静态托管时需把 history 回退到 `/admin/index.html`。
- 所有接口经 `/api` 前缀访问后端 `/api/v1/admin/*`，开发环境由 vite 代理转发。

## 功能页面（11 个菜单键固定）

| 菜单键 | 页面 | 说明 |
| --- | --- | --- |
| overview | 运行概览 | 账号、空间占用、待审核、运行与短信服务状态 |
| users | 用户管理 | 用户状态与实际空间占用 |
| template | 演示模板审核 | 公开内容审核（通过 / 拒绝 / 下架 / 下载原件） |
| knowledge | 知识内容审核 | 同上，按知识资料过滤 |
| skin | 皮肤审核 | 同上，按界面皮肤过滤 |
| audit | 操作记录 | 管理员与用户操作混排记录 |
| converter | 文档转换 | 转换配置、访问令牌、真实转换测试、近期任务 |
| releases | 版本管理 | 多平台同版本发布、安装包上传、上架下架、整版本删除 |
| admins | 管理员管理 | 管理员账号与角色分配 |
| roles | 角色管理 | 角色与 19 个权限点配置 |
| menus | 菜单管理 | 菜单名称、显示状态与顺序 |

## 权限模型

- 登录后调用 `GET /v1/admin/session` 获取 `user / roles / permissions / menus`。
- 侧边栏与路由按 `session.menus` 动态生成，无权限菜单不渲染、路由不注册。
- 按钮级控制按 `permissions` 判断，例如 `releases:write` 控制版本发布与删除，`template:review` 控制审核操作。
- 后端返回 401 时自动清理会话并跳转登录页；错误提示统一展示后端返回的 `error` 中文文案。

## 开发命令

```bash
npm install
npm run dev      # 开发服务器，/api 代理到 https://seal.xingmasoft.com
npm run build    # 构建到 dist/
npm run preview  # 本地预览构建产物
```
