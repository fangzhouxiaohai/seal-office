package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 管理登录与会话：对应 server/test/adminRbac.integration.test.cjs 的登录限流用例
 * 与 index.cjs 第 162-192 行的会话语义。
 */
class AdminLoginTest extends AdminTestSupport {

    @Test
    void 超管登录成功并返回完整资料() throws Exception {
        String token = rootLogin();
        assertNotNull(token);
        JsonNode profile = body(get("/v1/admin/session", token, ip));
        assertEquals("admin", profile.get("user").get("username").asText());
        assertEquals("管理员", profile.get("user").get("nickname").asText());
        assertEquals(1, profile.get("user").get("is_super").asInt());
        assertEquals(21, profile.get("permissions").size());
        assertEquals(12, profile.get("menus").size());
        assertEquals("/seal/overview", profile.get("menus").get(0).get("path").asText());
        assertEquals("seal/overview", profile.get("menus").get(0).get("component").asText());
    }

    @Test
    void 无效登录返回统一鉴权错误不泄露账号是否存在() throws Exception {
        for (Object body : List.of(
                Map.of("username", "unknown", "password", "wrong"),
                Map.of("username", "admin", "password", "wrong"))) {
            MvcResult result = post("/v1/admin/login", body, null, ip);
            assertEquals(401, result.getResponse().getStatus());
            assertEquals("管理员账号或密码不正确", body(result).get("error").asText());
        }
        MvcResult nullBody = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/v1/admin/login").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("null").header("X-Real-IP", ip)).andReturn();
        assertEquals(401, nullBody.getResponse().getStatus());
        assertEquals("管理员账号或密码不正确", body(nullBody).get("error").asText());
    }

    @Test
    void 同IP同账号失败五次后锁定() throws Exception {
        for (int i = 0; i < 5; i++) {
            assertEquals(401, post("/v1/admin/login", Map.of("username", "admin", "password", "wrong"), null, ip)
                    .getResponse().getStatus());
        }
        MvcResult locked = post("/v1/admin/login", Map.of("username", "admin", "password", "wrong"), null, ip);
        assertEquals(429, locked.getResponse().getStatus());
        assertEquals("登录尝试过多，请稍后再试", body(locked).get("error").asText());
        // 正确口令同样被锁定拦截
        assertEquals(429, post("/v1/admin/login", Map.of("username", "admin", "password", ROOT_PASSWORD), null, ip)
                .getResponse().getStatus());
        // 窗口（15 分钟）过后恢复
        tick(900001);
        assertEquals(200, post("/v1/admin/login", Map.of("username", "admin", "password", ROOT_PASSWORD), null, ip)
                .getResponse().getStatus());
    }

    @Test
    void 低权限账号成功登录不能清除同IP的超管密码失败限流() throws Exception {
        String root = rootLogin();
        createAdmin(root, "reviewer", "StrongPassword123", List.of());
        for (int i = 0; i < 4; i++) {
            assertEquals(401, post("/v1/admin/login", Map.of("username", "admin", "password", "wrong"), null, ip)
                    .getResponse().getStatus());
            assertEquals(200, post("/v1/admin/login", Map.of("username", "reviewer", "password", "StrongPassword123"), null, ip)
                    .getResponse().getStatus());
        }
        assertEquals(401, post("/v1/admin/login", Map.of("username", "admin", "password", "wrong"), null, ip)
                .getResponse().getStatus());
        assertEquals(429, post("/v1/admin/login", Map.of("username", "admin", "password", "wrong"), null, ip)
                .getResponse().getStatus());
    }

    @Test
    void 不同来源的错误密码不能全局锁死合法超管() throws Exception {
        for (int i = 1; i <= 5; i++) {
            assertEquals(401, post("/v1/admin/login", Map.of("username", "admin", "password", "wrong"), null,
                    "10.88.1." + i).getResponse().getStatus());
        }
        assertEquals(200, post("/v1/admin/login", Map.of("username", "admin", "password", ROOT_PASSWORD), null,
                "10.88.1.6").getResponse().getStatus());
    }

    @Test
    void 登出后会话立即失效() throws Exception {
        String token = rootLogin();
        assertEquals(200, post("/v1/admin/logout", null, token, ip).getResponse().getStatus());
        MvcResult after = get("/v1/admin/session", token, ip);
        assertEquals(401, after.getResponse().getStatus());
        assertEquals("请先登录管理后台", body(after).get("error").asText());
    }

    @Test
    void 未登录与伪造令牌一律401() throws Exception {
        assertEquals(401, get("/v1/admin/session", null, ip).getResponse().getStatus());
        MvcResult forged = get("/v1/admin/session", "forged-token", ip);
        assertEquals(401, forged.getResponse().getStatus());
        assertEquals("请先登录管理后台", body(forged).get("error").asText());
    }

    @Test
    void 修改密码或停用后旧会话按账号变更失效() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "模板审核", List.of("template:read", "template:review"));
        String admin = createAdmin(root, "reviewer", "StrongPassword123", List.of(role));
        String user = adminLogin("reviewer", "StrongPassword123", ip);
        assertEquals(200, get("/v1/admin/session", user, ip).getResponse().getStatus());
        assertEquals(200, patch("/v1/admin/access/admins/" + admin, Map.of("password", "DifferentPassword456"), root, ip)
                .getResponse().getStatus());
        MvcResult stale = get("/v1/admin/session", user, ip);
        assertEquals(401, stale.getResponse().getStatus());
        assertEquals("管理员账号已变更或停用，请重新登录", body(stale).get("error").asText());
        String renewed = adminLogin("reviewer", "DifferentPassword456", ip);
        assertEquals(200, patch("/v1/admin/access/admins/" + admin, Map.of("enabled", false), root, ip)
                .getResponse().getStatus());
        MvcResult disabled = get("/v1/admin/session", renewed, ip);
        assertEquals(401, disabled.getResponse().getStatus());
        assertEquals("管理员账号已变更或停用，请重新登录", body(disabled).get("error").asText());
    }

    @Test
    void 会话八小时后过期() throws Exception {
        String token = rootLogin();
        tick(8L * 3600000L + 1);
        MvcResult expired = get("/v1/admin/session", token, ip);
        assertEquals(401, expired.getResponse().getStatus());
        assertEquals("请先登录管理后台", body(expired).get("error").asText());
    }

    @Test
    void 会话失效后管理接口统一拒绝() throws Exception {
        assertEquals(401, get("/v1/admin/releases", null, ip).getResponse().getStatus());
        assertEquals(401, post("/v1/admin/releases", Map.of("platform", "web", "version", "2.7.1"), null, ip)
                .getResponse().getStatus());
        assertEquals(401, patch("/v1/admin/releases/00000000-0000-4000-8000-000000000000",
                Map.of("mandatory", true), "forged-token", ip).getResponse().getStatus());
        assertEquals(401, delete("/v1/admin/releases/00000000-0000-4000-8000-000000000000", "forged-token", ip)
                .getResponse().getStatus());
        assertEquals(401, get("/v1/admin/overview", null, ip).getResponse().getStatus());
        assertEquals(401, get("/v1/admin/converter", null, ip).getResponse().getStatus());
    }

    @Test
    void 内置超管不受管理员表影响且环境未配置时可关闭展示() throws Exception {
        String root = rootLogin();
        JsonNode items = body(get("/v1/admin/access/admins", root, ip)).get("items");
        JsonNode builtin = items.get(0);
        assertEquals("admin", builtin.get("id").asText());
        assertTrue(builtin.get("enabled").asBoolean());
        assertTrue(builtin.get("builtin").asBoolean());
        assertEquals("超级管理员", builtin.get("roleNames").get(0).asText());
        assertFalse(builtin.has("salt"));
        assertFalse(builtin.has("digest"));
    }
}
