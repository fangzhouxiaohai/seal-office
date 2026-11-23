package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 转换器管理（离线）：未配置控制令牌时状态降级为 connected:false，
 * 写操作按 Node 文案返回 503「转换管理通道尚未配置」。
 */
@SpringBootTest(properties = {
        "SEAL_ADMIN_SALT=seal-admin-v1",
        "SEAL_ADMIN_PASSWORD_HASH=0d0a545b1d1dee8d3837657c1d2143876e0c7383692406a6b8b44a5352ea3815",
        "seal.data-dir=${java.io.tmpdir}/seal-converter-offline-test"})
class ConverterAdminOfflineTest extends AdminTestSupport {

    @Test
    void 未配置控制令牌时状态降级且可读公开配置() throws Exception {
        String root = rootLogin();
        MvcResult result = get("/v1/admin/converter", root, ip);
        assertEquals(200, result.getResponse().getStatus());
        JsonNode status = body(result);
        assertFalse(status.get("connected").asBoolean());
        assertEquals("转换管理通道尚未配置", status.get("error").asText());
        JsonNode config = status.get("config");
        assertFalse(config.get("enabled").asBoolean());
        assertEquals(1, config.get("concurrency").asInt());
        assertFalse(config.get("tokenConfigured").asBoolean());
        assertEquals(20971520, config.get("maximumBytes").asInt());
        assertEquals(90, config.get("timeoutSeconds").asInt());
        assertTrue(config.get("endpoint").asText().endsWith("/api/office-converter"));
        assertEquals(0, status.get("statistics").get("active").asInt());
        assertFalse(status.get("engine").get("ready").asBoolean());
    }

    @Test
    void 未配置控制令牌时写操作返回503() throws Exception {
        String root = rootLogin();
        MvcResult patch = patch("/v1/admin/converter", Map.of("enabled", true, "concurrency", 2), root, ip);
        assertEquals(503, patch.getResponse().getStatus());
        assertEquals("转换管理通道尚未配置", body(patch).get("error").asText());
        MvcResult token = post("/v1/admin/converter/token", null, root, ip);
        assertEquals(503, token.getResponse().getStatus());
        assertEquals("转换管理通道尚未配置", body(token).get("error").asText());
        MvcResult test = post("/v1/admin/converter/test", null, root, ip);
        assertEquals(503, test.getResponse().getStatus());
        assertEquals("转换管理通道尚未配置", body(test).get("error").asText());
    }

    @Test
    void 配置参数校验文案与Node一致() throws Exception {
        String root = rootLogin();
        MvcResult badConcurrency = patch("/v1/admin/converter", Map.of("enabled", true, "concurrency", 3), root, ip);
        assertEquals(400, badConcurrency.getResponse().getStatus());
        assertEquals("启停或并发配置无效", body(badConcurrency).get("error").asText());
        MvcResult badEnabled = patch("/v1/admin/converter", Map.of("enabled", "yes", "concurrency", 1), root, ip);
        assertEquals(400, badEnabled.getResponse().getStatus());
        assertEquals("启停或并发配置无效", body(badEnabled).get("error").asText());
    }
}
