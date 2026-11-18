# TLAdmin Web

TLAdmin 管理后台前端(Vue3 + Vite + TypeScript + TDesign Vue Next + Pinia)。

## 本地启动

```bash
npm install
npm run dev        # http://localhost:5173,/adminapi 代理到后端 8000
npm run build      # 类型检查 + 生产构建(dist/)
```

后端需先启动:`cd ../server && php -S 127.0.0.1:8000 -t public public/router.php`

## 已实现

- 登录页:账号密码 + Google 动态验证码(后端返回 `totp_required` 时自动展开 6 位码输入框)
- request.ts:自动携带 token、401 自动刷新并重放(并发共享一次刷新)、403 提示、统一错误弹层、blob 下载
- 动态路由:登录后按 `/adminapi/auth/profile` 菜单树生成路由,`component` 字段映射 `src/pages/**.vue`,未建页面落占位页
- AdminLayout:左侧动态菜单(递归)、顶栏(折叠/面包屑/全屏/用户菜单)、多标签页
- `v-permission` 按钮权限指令(`v-permission="'system:user:create'"`,数组任一满足即可)
- 工具库 `src/utils/`:request / token / date / string / array / money / file / random / uuid

## 目录约定

```text
src/
  api/            接口请求(按模块分文件)
  directives/     v-permission 等指令
  layouts/        AdminLayout 及其子组件
  pages/          页面(路径与后端菜单 component 字段一致)
  router/         静态路由 + 动态路由构建
  stores/         Pinia(user:token/profile/权限)
  types/          API 类型
  utils/          工具库
```
