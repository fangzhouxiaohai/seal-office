package com.sealoffice.cloud.admin;

import java.util.List;

/**
 * 管理后台固定权限点与菜单定义。
 * 已有权限点的取值是角色授权库的持久数据，只能追加不能改名；菜单顺序为未自定义排序时的默认顺序。
 */
public final class AdminConstants {

    /** 21 个固定权限点 */
    public static final List<String> PERMISSIONS = List.of(
            "overview:read", "users:read", "template:read", "template:review",
            "knowledge:read", "knowledge:review", "skin:read", "skin:review",
            "audit:read", "converter:read", "converter:write", "sms:read", "sms:write",
            "releases:read", "releases:write",
            "admins:read", "admins:write", "roles:read", "roles:write",
            "menus:read", "menus:write");

    /** 三个系统管理菜单：不允许停用或隐藏 */
    public static final List<String> SYSTEM_MENUS = List.of("admins", "roles", "menus");

    /**
     * 菜单行定义：key、默认标题、前端组件名、图标、所需读权限。
     * 与 Node MENUS 数组逐行对应，path 固定为 /seal/{key}，component 为 seal/{key}。
     */
    public record MenuDef(String key, String title, String name, String icon, String readPermission) {
    }

    public static final List<MenuDef> MENUS = List.of(
            new MenuDef("overview", "数据概览", "SealOverview", "dashboard", "overview:read"),
            new MenuDef("users", "用户管理", "SealUsers", "usergroup", "users:read"),
            new MenuDef("template", "演示模板审核", "SealTemplate", "view-module", "template:read"),
            new MenuDef("knowledge", "知识内容审核", "SealKnowledge", "book", "knowledge:read"),
            new MenuDef("skin", "皮肤审核", "SealSkin", "palette", "skin:read"),
            new MenuDef("audit", "操作记录", "SealAudit", "time", "audit:read"),
            new MenuDef("converter", "文档转换", "SealConverter", "file-copy", "converter:read"),
            new MenuDef("sms", "短信服务", "SealSms", "message", "sms:read"),
            new MenuDef("releases", "版本管理", "SealReleases", "system-application", "releases:read"),
            new MenuDef("admins", "管理员管理", "SealAdmins", "user-setting", "admins:read"),
            new MenuDef("roles", "角色管理", "SealRoles", "usergroup", "roles:read"),
            new MenuDef("menus", "菜单管理", "SealMenus", "system-application", "menus:read"));

    /** 内置超管固定标识 */
    public static final String SUPER_ID = "admin";

    private AdminConstants() {
    }
}
