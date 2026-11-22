package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.web.servlet.MvcResult;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 能力集接口：与 Node index.cjs /v1/capabilities 完全一致。
 */
class CapabilityTest extends CloudApiTestSupport {

    @Test
    void 能力集字段与响应头() throws Exception {
        MvcResult result = get("/v1/capabilities", null);
        assertEquals(200, result.getResponse().getStatus());
        // 契约要求的安全响应头
        assertEquals("no-store", result.getResponse().getHeader("Cache-Control"));
        assertEquals("nosniff", result.getResponse().getHeader("X-Content-Type-Options"));
        assertEquals("default-src 'none'", result.getResponse().getHeader("Content-Security-Policy"));

        JsonNode body = json(result);
        assertEquals(1, body.get("version").asInt());
        assertEquals(1, body.get("collaboration").asInt());
        assertEquals(1, body.get("realtime").asInt());
        assertEquals(1, body.get("diagramRealtime").asInt());
        assertEquals(1, body.get("accountConversion").asInt());
        assertEquals(1, body.get("passwordAuth").asInt());
        assertEquals(1, body.get("accountDeletion").asInt());
        assertEquals(1, body.get("aiIdentity").asInt());
        assertEquals(1, body.get("shareLink").asInt());
        assertEquals(1, body.get("methodOverride").asInt());
        assertEquals(1, body.get("keyRecovery").asInt());
        assertEquals(300000000L, body.get("quota").asLong());
        assertEquals(1048576, body.get("chunkSize").asInt());
        assertTrue(body.get("sms").asBoolean());
        assertEquals("AES-256-GCM", body.get("encryption").asText());
        assertEquals("2026-11-21", body.get("agreementVersion").asText());
        assertEquals(16, body.size(), "能力集字段数与 Node 一致");
    }

    @Test
    void 未配置短信时sms为false() throws Exception {
        Mockito.when(smsSender.configured()).thenReturn(false);
        MvcResult result = get("/v1/capabilities", null);
        assertEquals(200, result.getResponse().getStatus());
        assertEquals(false, json(result).get("sms").asBoolean());
    }

    @Test
    void AI身份标识() throws Exception {
        // 未登录：401 + code
        MvcResult anonymous = get("/v1/ai/identity", null);
        assertEquals(401, anonymous.getResponse().getStatus());
        assertEquals("使用 AI 功能前请先登录并完成手机号验证", json(anonymous).get("error").asText());
        assertEquals("AI_IDENTITY_REQUIRED", json(anonymous).get("code").asText());
        // 已登录手机验证账号
        String token = login("13800000400");
        MvcResult identity = get("/v1/ai/identity", token);
        assertEquals(200, identity.getResponse().getStatus());
        JsonNode body = json(identity);
        assertTrue(body.get("accountId").asText().matches("[0-9a-f-]{36}"));
        assertTrue(body.get("verified").asBoolean());
        assertEquals("phone", body.get("method").asText());
    }

    @Test
    void 未知路径与方法不符均404() throws Exception {
        String token = login("13800000410");
        // 未开通空间时 Node 的 enabled 闸门先行（403），开通后才能走到 404
        post("/v1/space/enable", java.util.Map.of("consent", true, "agreementVersion", "2026-11-21"), token);
        MvcResult missing = get("/v1/no-such-route", token);
        assertEquals(404, missing.getResponse().getStatus());
        assertEquals("接口不存在", json(missing).get("error").asText());
        // Node 无 405 概念：方法不支持同样 404
        MvcResult wrongMethod = post("/v1/capabilities", null, token);
        assertEquals(404, wrongMethod.getResponse().getStatus());
        assertEquals("接口不存在", json(wrongMethod).get("error").asText());
    }
}
