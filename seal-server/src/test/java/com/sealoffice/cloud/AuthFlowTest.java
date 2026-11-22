package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 验证码登录全流程：对应 Node cloud.test.cjs 第一组用例。
 */
class AuthFlowTest extends CloudApiTestSupport {

    @Test
    void 验证码全流程_错误五次锁定_一次消费() throws Exception {
        String phone = "13800000000";
        // 发送成功：{sent:true,retryAfter:60}
        MvcResult sent = post("/v1/auth/code", Map.of("phone", phone), null);
        assertEquals(200, sent.getResponse().getStatus());
        JsonNode sentBody = json(sent);
        assertTrue(sentBody.get("sent").asBoolean());
        assertEquals(60, sentBody.get("retryAfter").asInt());

        // 60 秒内重发被限流
        MvcResult resend = post("/v1/auth/code", Map.of("phone", phone), null);
        assertEquals(429, resend.getResponse().getStatus());
        assertEquals("发送过于频繁，请稍后再试", json(resend).get("error").asText());

        // 连续 5 次错误验证码：均为 400 验证码不正确；第 6 次（即使正确）报过期/次数过多
        for (int i = 0; i < 5; i++) {
            MvcResult wrong = post("/v1/auth/login", Map.of("phone", phone, "code", "000000"), null);
            assertEquals(400, wrong.getResponse().getStatus());
            assertEquals("验证码不正确", json(wrong).get("error").asText());
        }
        MvcResult sixth = post("/v1/auth/login", Map.of("phone", phone, "code", codes.get(phone)), null);
        assertEquals(400, sixth.getResponse().getStatus());
        assertEquals("验证码已过期或尝试次数过多，请重新获取", json(sixth).get("error").asText());

        // 推进 61 秒后可重发并完成登录
        tick(61000);
        assertEquals(200, post("/v1/auth/code", Map.of("phone", phone), null).getResponse().getStatus());
        MvcResult login = post("/v1/auth/login", Map.of("phone", phone, "code", codes.get(phone)), null);
        assertEquals(200, login.getResponse().getStatus());
        String token = json(login).get("token").asText();
        assertTrue(token.matches("[A-Za-z0-9_-]{43}"));

        // 验证码一次性消费：再次使用即失败
        MvcResult reuse = post("/v1/auth/login", Map.of("phone", phone, "code", codes.get(phone)), null);
        assertEquals(400, reuse.getResponse().getStatus());

        // 登录态可用
        assertEquals(200, get("/v1/me", token).getResponse().getStatus());
    }

    @Test
    void 用途校验顺序与手机号校验() throws Exception {
        // 非 login 用途未登录：先报 400（与 Node 校验顺序一致）
        MvcResult purge = post("/v1/auth/code", Map.of("phone", "13800000010", "purpose", "purge"), null);
        assertEquals(400, purge.getResponse().getStatus());
        assertEquals("手机号或验证码用途无效", json(purge).get("error").asText());

        MvcResult badPurpose = post("/v1/auth/code", Map.of("phone", "13800000010", "purpose", "x"), null);
        assertEquals(400, badPurpose.getResponse().getStatus());

        MvcResult badPhone = post("/v1/auth/code", Map.of("phone", "123"), null);
        assertEquals(400, badPhone.getResponse().getStatus());
        assertEquals("手机号或验证码用途无效", json(badPhone).get("error").asText());

        MvcResult loginBadPhone = post("/v1/auth/login", Map.of("phone", "123", "code", "123456"), null);
        assertEquals(400, loginBadPhone.getResponse().getStatus());
        assertEquals("手机号无效", json(loginBadPhone).get("error").asText());
    }

    @Test
    void 重复登录双会话均有效_登出互不影响() throws Exception {
        String phone = "13800000020";
        String tokenA = login(phone);
        tick(61000);
        String tokenB = login(phone);
        assertEquals(200, get("/v1/me", tokenA).getResponse().getStatus());
        assertEquals(200, get("/v1/me", tokenB).getResponse().getStatus());

        MvcResult logout = post("/v1/auth/logout", null, tokenA);
        assertEquals(200, logout.getResponse().getStatus());
        assertTrue(json(logout).get("loggedOut").asBoolean());

        // 登出即会话删除：原令牌 401，另一令牌不受影响
        MvcResult revoked = get("/v1/me", tokenA);
        assertEquals(401, revoked.getResponse().getStatus());
        assertEquals("登录已过期，请重新登录", json(revoked).get("error").asText());
        assertEquals(200, get("/v1/me", tokenB).getResponse().getStatus());
    }

    @Test
    void 会话过期与非法令牌() throws Exception {
        String token = login("13800000030");
        // 伪造令牌：格式合法但不存在 → 401
        MvcResult forged = get("/v1/me", "a".repeat(43));
        assertEquals(401, forged.getResponse().getStatus());
        // 非法格式（含非法字符）→ 401
        MvcResult malformed = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .get("/v1/me").header("Authorization", "Bearer !!!")).andReturn();
        assertEquals(401, malformed.getResponse().getStatus());
        // 推进 31 天：会话过期 → 401
        tick(31L * 86400000L);
        MvcResult expired = get("/v1/me", token);
        assertEquals(401, expired.getResponse().getStatus());
        assertEquals("登录已过期，请重新登录", json(expired).get("error").asText());
    }

    @Test
    void 未认证访问受保护路径() throws Exception {
        assertEquals(401, get("/v1/me", null).getResponse().getStatus());
        assertEquals(401, get("/v1/space/counts", null).getResponse().getStatus());
        assertEquals(401, get("/v1/devices", null).getResponse().getStatus());
        MvcResult password = post("/v1/auth/password", Map.of("password", "x".repeat(15)), null);
        assertEquals(401, password.getResponse().getStatus());
        assertEquals("请先登录", json(password).get("error").asText());
    }
}
