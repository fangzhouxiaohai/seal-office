package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 密码设置与密码登录：对应 Node passwords.test.cjs 全部关键用例。
 */
class PasswordTest extends CloudApiTestSupport {

    private static final String PASSWORD = "海豹办公 测试Password2026";

    @Test
    void 验证码设置密码并密码登录() throws Exception {
        String phone = "13800000300";
        String token = login(phone);
        assertFalse(json(get("/v1/me", token)).get("hasPassword").asBoolean());

        // 无验证码且无旧密码 → 400
        MvcResult noAuth = post("/v1/auth/password", Map.of("password", PASSWORD), token);
        assertEquals(400, noAuth.getResponse().getStatus());
        assertEquals("请验证当前密码，或获取短信验证码", json(noAuth).get("error").asText());
        // 短密码 → 400
        sendPurposeCode(token, "password");
        MvcResult shortPw = post("/v1/auth/password", Map.of("password", "short", "code", codes.get(phone)), token);
        assertEquals(400, shortPw.getResponse().getStatus());
        assertEquals("新密码须为 15–128 个字符，可使用中文、空格和符号", json(shortPw).get("error").asText());
        // 验证码被短密码尝试消费，需重新获取
        sendPurposeCode(token, "password");
        MvcResult set = post("/v1/auth/password", Map.of("password", PASSWORD, "code", codes.get(phone)), token);
        assertEquals(200, set.getResponse().getStatus());
        assertTrue(json(set).get("otherSessionsRevoked").asBoolean());
        assertTrue(json(set).get("account").get("hasPassword").asBoolean());
        // 摘要形态与 Node 一致：salt 32 hex、digest 128 hex
        Map<String, Object> credential = jdbc.queryForMap("SELECT salt, digest FROM passwords WHERE user_id = ?",
                json(get("/v1/me", token)).get("id").asText());
        assertEquals(32, ((String) credential.get("salt")).length());
        assertEquals(128, ((String) credential.get("digest")).length());

        // 错误密码 → 401；正确密码 → 200
        MvcResult wrong = post("/v1/auth/password-login", Map.of("phone", phone, "password", PASSWORD + "!"), null);
        assertEquals(401, wrong.getResponse().getStatus());
        assertEquals("手机号或密码不正确，请重试或使用短信登录", json(wrong).get("error").asText());
        MvcResult logged = post("/v1/auth/password-login", Map.of("phone", phone, "password", PASSWORD), null);
        assertEquals(200, logged.getResponse().getStatus());
        assertNotEquals(token, json(logged).get("token").asText());
        assertEquals("138****0300", json(logged).get("account").get("phone").asText());
        assertFalse(json(logged).get("account").get("enabled").asBoolean());
    }

    @Test
    void 修改密码撤销其他会话_旧密码失效() throws Exception {
        String phone = "13800000310";
        String tokenA = login(phone);
        sendPurposeCode(tokenA, "password");
        assertEquals(200, post("/v1/auth/password", Map.of("password", PASSWORD, "code", codes.get(phone)), tokenA)
                .getResponse().getStatus());
        tick(61000);
        String tokenB = login(phone);

        MvcResult changed = post("/v1/auth/password",
                Map.of("password", PASSWORD + " new", "currentPassword", PASSWORD), tokenA);
        assertEquals(200, changed.getResponse().getStatus());
        // 其他会话被撤销
        assertEquals(401, get("/v1/me", tokenB).getResponse().getStatus());
        // 旧密码失效，新密码可登录
        assertEquals(401, post("/v1/auth/password-login", Map.of("phone", phone, "password", PASSWORD), null)
                .getResponse().getStatus());
        assertEquals(200, post("/v1/auth/password-login", Map.of("phone", phone, "password", PASSWORD + " new"), null)
                .getResponse().getStatus());
        // 当前会话仍有效
        assertEquals(200, get("/v1/me", tokenA).getResponse().getStatus());
    }

    @Test
    void 未注册手机号不创建账号_连续错误触发429() throws Exception {
        String ghost = "13800000399";
        for (int i = 0; i < 10; i++) {
            MvcResult result = post("/v1/auth/password-login", Map.of("phone", ghost, "password", PASSWORD), null);
            assertEquals(401, result.getResponse().getStatus());
        }
        MvcResult eleventh = post("/v1/auth/password-login", Map.of("phone", ghost, "password", PASSWORD), null);
        assertEquals(429, eleventh.getResponse().getStatus());
        assertEquals("密码尝试过多，请稍后重试或使用短信登录", json(eleventh).get("error").asText());
        // 密码登录绝不创建账号
        assertNull(jdbc.query("SELECT id FROM users WHERE phone = ?", rs -> rs.next() ? rs.getString(1) : null, ghost));
    }

    @Test
    void 验证码用途隔离_改密码码不能登录() throws Exception {
        String phone = "13800000320";
        String token = login(phone);
        // 为 password 用途取码后，该码对 login 无效
        sendPurposeCode(token, "password");
        String code = codes.get(phone);
        MvcResult abused = post("/v1/auth/login", Map.of("phone", phone, "code", code), null);
        assertEquals(400, abused.getResponse().getStatus());
        // 原用途仍可用且一次消费
        assertEquals(200, post("/v1/auth/password", Map.of("password", PASSWORD, "code", code), token)
                .getResponse().getStatus());
        MvcResult reuse = post("/v1/auth/password", Map.of("password", PASSWORD, "code", code), token);
        assertEquals(400, reuse.getResponse().getStatus());
    }
}
