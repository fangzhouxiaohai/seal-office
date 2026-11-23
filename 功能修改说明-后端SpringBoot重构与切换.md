# 功能修改说明：后端 Spring Boot 重构与生产无感切换

## 背景

按用户决策彻底放弃 Node + PHP + SQLite 后端，以 warehouse 脚手架（Spring Boot 3 + Vue3 + Element Plus）重构海豹办公全部服务端与管理后台，保留脚手架管理员权限体系与 UI 风格、剔除库房耗材业务。客户端接口一比一不变，全程无感。

## 交付内容

### seal-server（Spring Boot 3.2.5 / Java 17 / MyBatis-Plus / MySQL 8.0.46）

- P1 认证会话：短信登录注册、密码登录（scrypt N=32768,r=8,p=3,64 字节与 Node 逐字节一致）、会话设备、云空间开通与密钥（HKDF+AES-256-GCM）、能力集、注销登记
- P2 云空间对象：节点七路由、分块上传断点续传、版本管理、孤儿与周期清理
- P3 协作共享：文档共享、标签、团队与邀请、我的分享、分享链接（访问码 scrypt 默认参数互通、15 分钟 8 次限次）
- P4 公开内容：发布、审核联动、公开浏览下载、举报限流，海豹容器/皮肤/标记校验 JDK 逐字移植
- P5 实时协作：长轮询房间、seq/receipt、检查点、presence；账号文档转换（8298 控制通道互斥同步、令牌轮换）；注销擦除执行器
- P6 管理后台：登录限流、RBAC 全 CRUD、运行概览、转换器管理、发布与附件上传（PE/DEB/ZIP/DMG 校验）、更新查询、整版本删除
- 基础设施：环境文件直读 service.env、MySQL 28 表建库脚本、SQLite→MySQL 迁移工具、契约验收脚本、部署单元与切换脚本
- 测试：30 个测试类 158 项全部通过

### seal-admin-web（Vue3 + Element Plus）

- 全新管理后台 11 菜单页面：运行概览、用户管理、三类审核、操作记录、文档转换、版本管理、管理员/角色/菜单管理
- 动态权限（会话菜单驱动路由与按钮）、登录限流提示、库房业务零残留、海豹品牌
- 已部署至生产 /admin/（旧 tpadmin 界面已备份退役，PHP 桥 seal-admin-php 与 /seal-admin/ 路由已下线）

### 运维栈（MySQL 版）

- `/usr/local/sbin/seal-cloud-backup.sh`：mysqldump --single-transaction + 数据目录整包，保留 6 天
- `/usr/local/sbin/seal-cloud-health.sh`：备份清理、API 存活、证书余量、磁盘余量（8097）
- `/usr/local/sbin/seal-erase-backups.mjs`：注销备份擦除（恢复→MySQL 擦除→重打包；旧 SQLite 备份由原执行器兼容到保留期结束）
- systemd 三个定时器与 seal-cloud-erasure 已改指向；seal-cloud-java.service 常驻 8097

## 验证结果

- 全量测试 158/158；契约验收 35/35（真实管理员登录、菜单、发布与删除校验）
- Node/Java 逐字节对拍：capabilities、updates（windows/android beta/harmony beta）、公开列表哈希全等
- 生产数据迁移：在线快照导入 MySQL，行数逐表一致（138 用户、130 会话、100 节点、730 版本、40 发布、452 审计），已登录客户端会话全部保留
- 浏览器端到端：新后台登录、概览、版本管理、整版本删除弹窗与执行全通过
- 生产切换：nginx /api/ 上游 8096→8097，公网全入口 200；/admin/ 新界面上线；/seal-admin/ 旧桥下线

## 回滚

- API：`bash /root/cutover.sh 8096` 秒级回退 Node（热备中）
- 后台界面：`/www/wwwroot/seal.xingmasoft.com/admin.tpbak-*` 恢复 + 恢复 30-tpadmin.conf 并重启 seal-admin-php
- 稳定观察一周无回退需求后，按用户要求删除旧服务端与代码
