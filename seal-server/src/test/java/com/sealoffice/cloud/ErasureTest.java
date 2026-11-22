package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 账号注销登记与查询：对应 Node accountErasure.cjs 的契约段（P1 仅登记，P5 接管擦除）。
 */
class ErasureTest extends CloudApiTestSupport {

    @Test
    void 登记注销与进度查询() throws Exception {
        String phone = "13800000500";
        String token = login(phone);
        // 确认文案不符 → 400
        sendPurposeCode(token, "delete-account");
        MvcResult badConfirm = post("/v1/auth/delete-account",
                Map.of("confirm", "wrong", "code", codes.get(phone)), token);
        assertEquals(400, badConfirm.getResponse().getStatus());
        assertEquals("请输入“永久注销海豹办公账号”以确认", json(badConfirm).get("error").asText());
        // 正式登记
        MvcResult registered = post("/v1/auth/delete-account",
                Map.of("confirm", "永久注销海豹办公账号", "code", codes.get(phone)), token);
        assertEquals(200, registered.getResponse().getStatus());
        JsonNode body = json(registered);
        assertTrue(body.get("pending").asBoolean());
        assertFalse(body.get("deleted").asBoolean());
        String receipt = body.get("receipt").asText();
        assertTrue(receipt.matches("[0-9a-f-]{36}\\.[A-Za-z0-9_-]{43}"));
        // 登记文件落盘（P1 仅标记，不擦除数据）
        String id = receipt.split("\\.")[0];
        assertTrue(Files.isRegularFile(Path.of(System.getProperty("java.io.tmpdir"),
                "seal-server-test-erasure", id + ".json")), "注销登记文件应写入 erasure 目录");

        // 进度查询：凭回执免登录
        MvcResult status = post("/v1/auth/deletion-status", Map.of("receipt", receipt), null);
        assertEquals(200, status.getResponse().getStatus());
        assertFalse(json(status).get("deleted").asBoolean());
        assertTrue(json(status).get("pending").asBoolean());
        // 幂等重放：同回执重复登记返回同一状态
        MvcResult replay = post("/v1/auth/delete-account", Map.of("receipt", receipt), token);
        assertEquals(200, replay.getResponse().getStatus());
        assertTrue(json(replay).get("pending").asBoolean());
        assertEquals(receipt, json(replay).get("receipt").asText());
    }

    @Test
    void 查询非法与未知回执() throws Exception {
        MvcResult bogus = post("/v1/auth/deletion-status", Map.of("receipt", "x"), null);
        assertEquals(404, bogus.getResponse().getStatus());
        assertEquals("注销记录不存在", json(bogus).get("error").asText());
        String unknown = "00000000-0000-0000-0000-000000000000." + "a".repeat(43);
        assertEquals(404, post("/v1/auth/deletion-status", Map.of("receipt", unknown), null)
                .getResponse().getStatus());
    }

    @Test
    void 未登录登记返回401() throws Exception {
        MvcResult anonymous = post("/v1/auth/delete-account",
                Map.of("confirm", "永久注销海豹办公账号", "code", "123456"), null);
        assertEquals(401, anonymous.getResponse().getStatus());
        assertEquals("请先登录", json(anonymous).get("error").asText());
    }
}
