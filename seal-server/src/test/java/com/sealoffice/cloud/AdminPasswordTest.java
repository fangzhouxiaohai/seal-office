package com.sealoffice.cloud;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 管理后台本人修改密码（2.8.0 工作流六）：超管覆盖值优先、环境变量兜底；普通管理员更新 admins 表；
 * 保留当前会话、撤销其他会话；错误提示到字段；连续失败限流；审计不含密码。
 */
class AdminPasswordTest extends AdminTestSupport {

    private MvcResult change(String token, String current, String next) throws Exception {
        return post("/v1/admin/password", Map.of("currentPassword", current, "newPassword", next), token, ip);
    }

    private int loginStatus(String user, String password) throws Exception {
        return post("/v1/admin/login", Map.of("username", user, "password", password), null, ip).getResponse().getStatus();
    }

    @Test
    void 超管修改后旧密码失效新密码可用且写入覆盖表() throws Exception {
        String current = rootLogin();
        String other = rootLogin();
        MvcResult result = change(current, ROOT_PASSWORD, "NewRootPassword-2026");
        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        assertTrue(body(result).get("revokedSessions").asInt() >= 1, "其他会话应被撤销");
        assertEquals(200, get("/v1/admin/session", current, ip).getResponse().getStatus(), "当前会话保留");
        assertEquals(401, get("/v1/admin/session", other, ip).getResponse().getStatus(), "其他会话撤销");
        assertEquals(401, loginStatus("admin", ROOT_PASSWORD));
        assertEquals(200, loginStatus("admin", "NewRootPassword-2026"));
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM admin_password_overrides WHERE username='admin'");
        assertFalse(row.toString().contains("NewRootPassword-2026"), "覆盖表不得保存明文");
        jdbc.update("DELETE FROM admin_password_overrides");
        assertEquals(200, loginStatus("admin", ROOT_PASSWORD), "删除覆盖记录即恢复环境变量初始密码");
    }

    @Test
    void 普通管理员修改后保留当前会话并撤销其他会话() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "审计员", List.of("audit:read"));
        createAdmin(root, "auditor", "OldPassword123", List.of(role));
        String current = adminLogin("auditor", "OldPassword123", ip);
        String other = adminLogin("auditor", "OldPassword123", ip);
        MvcResult result = change(current, "OldPassword123", "NewPassword456");
        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        assertEquals(200, get("/v1/admin/session", current, ip).getResponse().getStatus());
        assertEquals(401, get("/v1/admin/session", other, ip).getResponse().getStatus());
        assertEquals(401, loginStatus("auditor", "OldPassword123"));
        assertEquals(200, loginStatus("auditor", "NewPassword456"));
    }

    @Test
    void 字段错误有明确提示且不会被当作登录失效() throws Exception {
        String token = rootLogin();
        MvcResult wrong = change(token, "wrong-password", "NewRootPassword-2026");
        assertEquals(400, wrong.getResponse().getStatus());
        assertEquals("当前密码不正确", body(wrong).get("error").asText());
        assertEquals("新密码须为 8 至 128 个字符", body(change(token, ROOT_PASSWORD, "short")).get("error").asText());
        assertEquals("新密码不能与当前密码相同", body(change(token, ROOT_PASSWORD, ROOT_PASSWORD)).get("error").asText());
        assertEquals(200, get("/v1/admin/session", token, ip).getResponse().getStatus(), "失败后会话仍有效");
    }

    @Test
    void 连续失败触发限流且审计不含密码() throws Exception {
        String token = rootLogin();
        for (int i = 0; i < 5; i++) {
            assertEquals(400, change(token, "wrong-" + i, "NewRootPassword-2026").getResponse().getStatus());
        }
        assertEquals(429, change(token, ROOT_PASSWORD, "NewRootPassword-2026").getResponse().getStatus());
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT action,detail FROM admin_audit WHERE action='password-change'");
        assertEquals(5, rows.size());
        assertTrue(rows.stream().allMatch(r -> String.valueOf(r.get("DETAIL") == null ? r.get("detail") : r.get("DETAIL")).startsWith("failed:")));
        assertFalse(rows.toString().contains("wrong-") || rows.toString().contains("NewRootPassword"));
    }
}
