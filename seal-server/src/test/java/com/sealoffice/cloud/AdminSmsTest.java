package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 短信服务独立模块：配置展示与修改、发送日志统计、测试发送与权限回收。
 */
class AdminSmsTest extends AdminTestSupport {

    @BeforeEach
    void cleanSms() {
        jdbc.update("DELETE FROM sms_logs");
        jdbc.update("DELETE FROM sms_settings");
        jdbc.update("DELETE FROM sends");
    }

    @Test
    void 用户验证码发送记入短信日志并出现在统计() throws Exception {
        String root = rootLogin();
        login("13700001111");
        JsonNode summary = body(get("/v1/admin/sms", root, ip));
        assertTrue(summary.get("config").get("configured").asBoolean());
        assertEquals("阿里云短信", summary.get("config").get("provider").asText());
        assertTrue(summary.get("stats").get("todaySent").asLong() >= 1);
        assertEquals(30, summary.get("trend").get("sent").size());
        assertEquals(24, summary.get("hourly").size());
        assertEquals(20, summary.get("limits").get("phoneDaily").asInt());
        JsonNode logs = body(get("/v1/admin/sms/logs?page=1&size=10", root, ip));
        assertTrue(logs.get("total").asLong() >= 1);
        JsonNode first = logs.get("items").get(0);
        assertEquals("137****1111", first.get("phone").asText());
        assertEquals("sent", first.get("status").asText());
        assertFalse(logs.toString().contains("13700001111"), "记录不得输出完整手机号");
    }

    @Test
    void 供应商失败记为失败并归类原因() throws Exception {
        String root = rootLogin();
        Mockito.doThrow(com.sealoffice.cloud.common.ApiException.of(502, "短信发送失败（isv.BUSINESS_LIMIT_CONTROL），请稍后重试"))
                .when(smsSender).send(Mockito.eq("13700002222"), Mockito.anyString());
        MvcResult send = post("/v1/auth/code", Map.of("phone", "13700002222"), null);
        assertEquals(502, send.getResponse().getStatus());
        JsonNode summary = body(get("/v1/admin/sms", root, ip));
        assertEquals(1, summary.get("stats").get("monthFailed").asLong());
        assertEquals("isv.BUSINESS_LIMIT_CONTROL", summary.get("errors").get(0).get("error").asText());
        JsonNode failed = body(get("/v1/admin/sms/logs?status=failed", root, ip));
        assertEquals(1, failed.get("total").asLong());
    }

    @Test
    void 修改签名模板并可恢复默认() throws Exception {
        String root = rootLogin();
        MvcResult bad = patch("/v1/admin/sms/settings", Map.of("sign", "海豹办公", "template", "ABC"), root, ip);
        assertEquals(400, bad.getResponse().getStatus());
        JsonNode saved = body(patch("/v1/admin/sms/settings", Map.of("sign", "海豹办公", "template", "SMS_100200300"), root, ip));
        assertEquals("海豹办公", saved.get("sign").asText());
        assertEquals("SMS_100200300", saved.get("template").asText());
        assertTrue(saved.get("customized").asBoolean());
        JsonNode reset = body(patch("/v1/admin/sms/settings", Map.of(
                "sign", saved.get("defaultSign").asText(), "template", saved.get("defaultTemplate").asText()), root, ip));
        assertFalse(reset.get("customized").asBoolean());
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sms_settings", Long.class));
    }

    @Test
    void 测试发送校验手机号并限频() throws Exception {
        String root = rootLogin();
        assertEquals(400, post("/v1/admin/sms/test", Map.of("phone", "123"), root, ip).getResponse().getStatus());
        MvcResult ok = post("/v1/admin/sms/test", Map.of("phone", "13700003333"), root, ip);
        assertEquals(200, ok.getResponse().getStatus());
        assertEquals("137****3333", body(ok).get("phone").asText());
        assertEquals(429, post("/v1/admin/sms/test", Map.of("phone", "13700003333"), root, ip).getResponse().getStatus());
        assertEquals(1L, jdbc.queryForObject("SELECT COUNT(*) FROM sms_logs WHERE source='admin'", Long.class));
    }

    @Test
    void 只读角色不能修改且菜单停用后整体回收() throws Exception {
        String root = rootLogin();
        String role = createRole(root, "短信查看", List.of("sms:read"));
        createAdmin(root, "smsviewer", "StrongPassword123", List.of(role));
        String user = adminLogin("smsviewer", "StrongPassword123", ip);
        assertEquals(200, get("/v1/admin/sms", user, ip).getResponse().getStatus());
        assertEquals(403, patch("/v1/admin/sms/settings", Map.of("sign", "海豹办公", "template", "SMS_100200300"), user, ip)
                .getResponse().getStatus());
        assertEquals(403, post("/v1/admin/sms/test", Map.of("phone", "13700004444"), user, ip).getResponse().getStatus());
        assertEquals(200, patch("/v1/admin/access/menus/sms", Map.of("enabled", false), root, ip).getResponse().getStatus());
        assertEquals(403, get("/v1/admin/sms", user, ip).getResponse().getStatus());
    }
}
