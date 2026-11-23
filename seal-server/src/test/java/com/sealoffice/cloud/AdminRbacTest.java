package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * RBAC 全量校验：对应 server/test/adminAccess.test.cjs 与 adminRbac.integration.test.cjs，
 * 覆盖角色/管理员/菜单 CRUD、越权 403、冲突 409、菜单启停对权限的回收。
 */
class AdminRbacTest extends AdminTestSupport {

    @Test
    void 内置超管以只读身份展示不允许修改删除() throws Exception {
        String root = rootLogin();
        assertEquals(403, patch("/v1/admin/access/admins/admin", Map.of("enabled", false), root, ip)
                .getResponse().getStatus());
        assertEquals(403, patch("/v1/admin/access/admins/admin", Map.of("password", "new-secret-123"), root, ip)
                .getResponse().getStatus());
        assertEquals(403, delete("/v1/admin/access/admins/admin", root, ip).getResponse().getStatus());
        MvcResult result = patch("/v1/admin/access/admins/admin", Map.of("enabled", false), root, ip);
        assertEquals("内置超管不能在此处修改", body(result).get("error").asText());
    }

    @Test
    void 角色管理员全生命周期并实时撤销权限() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "审核人员", List.of("template:read", "template:review"));
        String admin = createAdmin(root, "reviewer", "StrongPassword123", List.of(role));
        JsonNode created = body(get("/v1/admin/access/admins", root, ip)).get("items");
        JsonNode row = null;
        for (JsonNode item : created) {
            if (admin.equals(item.get("id").asText())) {
                row = item;
            }
        }
        assertNotNullRow(row);
        assertEquals("审核人员", row.get("roleNames").get(0).asText());
        // 角色权限收缩后，新签发主体立即生效
        assertEquals(200, patch("/v1/admin/access/roles/" + role,
                Map.of("permissions", List.of("template:read")), root, ip).getResponse().getStatus());
        String token = adminLogin("reviewer", "StrongPassword123", ip);
        JsonNode profile = body(get("/v1/admin/session", token, ip));
        assertEquals(1, profile.get("permissions").size());
        assertEquals("template:read", profile.get("permissions").get(0).asText());
        assertEquals(1, profile.get("roles").size());
        assertEquals("审核人员", profile.get("roles").get(0).get("name").asText());
        assertEquals("all", profile.get("roles").get(0).get("data_scope").asText());
    }

    private static void assertNotNullRow(JsonNode row) {
        if (row == null) {
            throw new AssertionError("管理员列表缺少目标行");
        }
    }

    @Test
    void 管理员输入校验与冲突文案() throws Exception {
        String root = rootLogin();
        MvcResult badName = post("/v1/admin/access/admins",
                Map.of("username", "ab", "password", "StrongPassword123", "roleIds", List.of()), root, ip);
        assertEquals(400, badName.getResponse().getStatus());
        assertEquals("管理员账号无效", body(badName).get("error").asText());
        MvcResult reserved = post("/v1/admin/access/admins",
                Map.of("username", "Admin", "password", "StrongPassword123", "roleIds", List.of()), root, ip);
        assertEquals(400, reserved.getResponse().getStatus());
        assertEquals("管理员账号无效", body(reserved).get("error").asText());
        MvcResult shortPassword = post("/v1/admin/access/admins",
                Map.of("username", "reviewer", "password", "short", "roleIds", List.of()), root, ip);
        assertEquals(400, shortPassword.getResponse().getStatus());
        assertEquals("密码须为 8 至 128 个字符", body(shortPassword).get("error").asText());
        MvcResult badRoles = post("/v1/admin/access/admins",
                Map.of("username", "reviewer", "password", "StrongPassword123", "roleIds", List.of("x")), root, ip);
        assertEquals(400, badRoles.getResponse().getStatus());
        assertEquals("角色列表无效", body(badRoles).get("error").asText());
        MvcResult missingRole = post("/v1/admin/access/admins", Map.of("username", "reviewer",
                "password", "StrongPassword123", "roleIds", List.of("11111111-1111-4111-8111-111111111111")), root, ip);
        assertEquals(400, missingRole.getResponse().getStatus());
        assertEquals("角色不存在", body(missingRole).get("error").asText());
        createAdmin(root, "reviewer", "StrongPassword123", List.of());
        MvcResult duplicate = post("/v1/admin/access/admins",
                Map.of("username", "Reviewer", "password", "StrongPassword123", "roleIds", List.of()), root, ip);
        assertEquals(409, duplicate.getResponse().getStatus());
        assertEquals("管理员账号已存在", body(duplicate).get("error").asText());
    }

    @Test
    void 权限不能越权分配() throws Exception {
        String root = rootLogin();
        // 不含 roles:read：角色列表只回显自身权限子集覆盖的角色（Node listedRoles 过滤分支）
        String role = createRole(root, "受限管理员",
                List.of("roles:write", "admins:write", "menus:write", "template:read"));
        createAdmin(root, "manager", "StrongPassword123", List.of(role));
        String manager = adminLogin("manager", "StrongPassword123", ip);
        MvcResult create = post("/v1/admin/access/roles",
                Map.of("name", "越权", "permissions", List.of("releases:write")), manager, ip);
        assertEquals(403, create.getResponse().getStatus());
        assertEquals("不能授予自身未拥有的权限", body(create).get("error").asText());
        String limitedRole = createRole(root, "发布专员", List.of("releases:read", "releases:write"));
        JsonNode roles = body(get("/v1/admin/access/roles", manager, ip)).get("items");
        boolean selfVisible = false;
        for (JsonNode row : roles) {
            assertFalse(limitedRole.equals(row.get("id").asText()));
            selfVisible |= role.equals(row.get("id").asText());
        }
        assertTrue(selfVisible);
    }

    @Test
    void 不能修改或删除自身管理员账号() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "管理员域", List.of("admins:read", "admins:write"));
        String admin = createAdmin(root, "manager", "StrongPassword123", List.of(role));
        String manager = adminLogin("manager", "StrongPassword123", ip);
        MvcResult update = patch("/v1/admin/access/admins/" + admin, Map.of("enabled", false), manager, ip);
        assertEquals(403, update.getResponse().getStatus());
        assertEquals("不能修改自身管理员账号", body(update).get("error").asText());
        MvcResult delete = delete("/v1/admin/access/admins/" + admin, manager, ip);
        assertEquals(403, delete.getResponse().getStatus());
        assertEquals("不能删除自身管理员账号", body(delete).get("error").asText());
    }

    @Test
    void 角色冲突与分配保护() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "审核人员", List.of("template:read"));
        MvcResult duplicate = post("/v1/admin/access/roles",
                Map.of("name", "审核人员", "permissions", List.of("template:read")), root, ip);
        assertEquals(409, duplicate.getResponse().getStatus());
        assertEquals("角色名称已存在", body(duplicate).get("error").asText());
        createAdmin(root, "reviewer", "StrongPassword123", List.of(role));
        MvcResult delete = delete("/v1/admin/access/roles/" + role, root, ip);
        assertEquals(409, delete.getResponse().getStatus());
        assertEquals("角色仍分配给管理员，不能删除", body(delete).get("error").asText());
        MvcResult invalid = delete("/v1/admin/access/roles/not-a-uuid", root, ip);
        assertEquals(400, invalid.getResponse().getStatus());
        assertEquals("角色标识无效", body(invalid).get("error").asText());
        MvcResult missing = delete("/v1/admin/access/roles/11111111-1111-4111-8111-111111111111", root, ip);
        assertEquals(404, missing.getResponse().getStatus());
        assertEquals("角色不存在", body(missing).get("error").asText());
    }

    @Test
    void 菜单校验规则与三系统入口保护() throws Exception {
        String root = rootLogin();
        MvcResult badField = patch("/v1/admin/access/menus/template", Map.of("path", "/other"), root, ip);
        assertEquals(400, badField.getResponse().getStatus());
        assertEquals("菜单修改字段无效", body(badField).get("error").asText());
        MvcResult badSort = patch("/v1/admin/access/menus/template", Map.of("sort", -1), root, ip);
        assertEquals(400, badSort.getResponse().getStatus());
        assertEquals("菜单设置无效", body(badSort).get("error").asText());
        for (String key : List.of("admins", "roles", "menus")) {
            MvcResult disable = patch("/v1/admin/access/menus/" + key, Map.of("enabled", false), root, ip);
            assertEquals(400, disable.getResponse().getStatus());
            assertEquals("系统管理菜单不能停用或隐藏", body(disable).get("error").asText());
            MvcResult hide = patch("/v1/admin/access/menus/" + key, Map.of("visible", false), root, ip);
            assertEquals(400, hide.getResponse().getStatus());
            assertEquals("系统管理菜单不能停用或隐藏", body(hide).get("error").asText());
        }
        MvcResult missing = patch("/v1/admin/access/menus/unknown", Map.of("title", "新菜单"), root, ip);
        assertEquals(404, missing.getResponse().getStatus());
        assertEquals("菜单不存在", body(missing).get("error").asText());
    }

    @Test
    void 菜单停用回收权限并经菜单候选恢复() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "模板审核", List.of("template:read", "template:review"));
        createAdmin(root, "reviewer", "StrongPassword123", List.of(role));
        String user = adminLogin("reviewer", "StrongPassword123", ip);
        JsonNode session = body(get("/v1/admin/session", user, ip));
        assertEquals(1, session.get("menus").size());
        assertEquals("/seal/template", session.get("menus").get(0).get("path").asText());
        // 停用菜单后权限与菜单同时回收（含超管）
        assertEquals(200, patch("/v1/admin/access/menus/template", Map.of("enabled", false), root, ip)
                .getResponse().getStatus());
        assertEquals(0, body(get("/v1/admin/session", user, ip)).get("menus").size());
        assertEquals(403, get("/v1/admin/releases", user, ip).getResponse().getStatus());
        JsonNode candidates = body(get("/v1/admin/access/menu-candidates", root, ip)).get("items");
        boolean found = false;
        for (JsonNode item : candidates) {
            found |= "template".equals(item.get("key").asText());
        }
        assertTrue(found);
        assertEquals(200, post("/v1/admin/access/menus", Map.of("key", "template"), root, ip).getResponse().getStatus());
        assertEquals(1, body(get("/v1/admin/session", user, ip)).get("menus").size());
        MvcResult again = post("/v1/admin/access/menus", Map.of("key", "template"), root, ip);
        assertEquals(409, again.getResponse().getStatus());
        assertEquals("菜单已启用", body(again).get("error").asText());
        MvcResult unknown = post("/v1/admin/access/menus", Map.of("key", "unknown"), root, ip);
        assertEquals(400, unknown.getResponse().getStatus());
        assertEquals("菜单不在业务白名单中", body(unknown).get("error").asText());
    }

    @Test
    void 低权限账号访问各管理端点被拒() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "模板审核", List.of("template:read"));
        createAdmin(root, "reviewer", "StrongPassword123", List.of(role));
        String user = adminLogin("reviewer", "StrongPassword123", ip);
        assertEquals(403, get("/v1/admin/releases", user, ip).getResponse().getStatus());
        assertEquals(403, post("/v1/admin/release-assets?platform=windows&version=2.7.2"
                + "&filename=seal-office-setup-2.7.2.exe", null, user, ip).getResponse().getStatus());
        assertEquals(403, get("/v1/admin/access/menus", user, ip).getResponse().getStatus());
        MvcResult menus = get("/v1/admin/access/menus", user, ip);
        assertEquals("没有执行此操作的权限", body(menus).get("error").asText());
        MvcResult roles = get("/v1/admin/access/roles", user, ip);
        assertEquals(403, roles.getResponse().getStatus());
        assertEquals("没有查看角色的权限", body(roles).get("error").asText());
        MvcResult candidates = get("/v1/admin/access/menu-candidates", user, ip);
        assertEquals(403, candidates.getResponse().getStatus());
        assertEquals("没有查看菜单的权限", body(candidates).get("error").asText());
        assertEquals(403, get("/v1/admin/converter", user, ip).getResponse().getStatus());
    }

    @Test
    void 未匹配的access组合返回管理接口不存在() throws Exception {
        String root = rootLogin();
        MvcResult result = get("/v1/admin/access/widgets", root, ip);
        assertEquals(404, result.getResponse().getStatus());
        assertEquals("管理接口不存在", body(result).get("error").asText());
        assertEquals(404, get("/v1/admin/unknown", root, ip).getResponse().getStatus());
        assertEquals("管理接口不存在", body(get("/v1/admin/unknown", root, ip)).get("error").asText());
    }

    @Test
    void 角色与管理员操作写入管理审计() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "审计核查", List.of("audit:read"));
        String admin = createAdmin(root, "auditor", "StrongPassword123", List.of(role));
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT actor,action FROM admin_audit ORDER BY time");
        assertTrue(rows.stream().anyMatch(row -> "role-create".equals(row.get("action"))));
        assertTrue(rows.stream().anyMatch(row -> "admin-create".equals(row.get("action"))
                && "admin".equals(row.get("actor"))));
        assertTrue(admin != null && !admin.isEmpty());
    }
}
