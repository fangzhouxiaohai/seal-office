package com.sealoffice.cloud;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 设备增删改查与撤销：对应 Node collaboration.cjs /v1/devices 段行为。
 */
class DeviceTest extends CloudApiTestSupport {

    @Test
    void 设备列表_登记_改名_撤销全流程() throws Exception {
        String phone = "13800000200";
        String deviceA = UUID.randomUUID().toString();
        String deviceB = UUID.randomUUID().toString();
        String tokenA = login(phone, deviceA, "办公电脑");
        tick(61000);
        String tokenB = login(phone, deviceB);

        // 列表：两台设备，current 标记跟随令牌
        MvcResult list = get("/v1/devices", tokenA);
        assertEquals(200, list.getResponse().getStatus());
        JsonNode items = json(list).get("items");
        assertEquals(2, items.size());
        JsonNode a = findById(items, deviceA);
        assertEquals("办公电脑", a.get("name").asText());
        assertTrue(a.get("current").asBoolean());
        assertFalse(findById(items, deviceB).get("current").asBoolean());
        assertTrue(a.get("created").asLong() > 0);
        assertTrue(a.get("lastSeen").asLong() > 0);
        assertTrue(a.get("expires").asLong() > 0);

        // 登记新标识（改名当前设备）
        String deviceC = UUID.randomUUID().toString();
        MvcResult registered = post("/v1/devices", Map.of("id", deviceC, "name", "  新手机  "), tokenA);
        assertEquals(200, registered.getResponse().getStatus());
        assertEquals(deviceC, json(registered).get("id").asText());
        assertEquals("新手机", json(registered).get("name").asText());
        assertTrue(json(registered).get("current").asBoolean());

        // 改名另一台设备
        MvcResult renamed = patch("/v1/devices/" + deviceB, Map.of("name", "家里平板"), tokenA);
        assertEquals(200, renamed.getResponse().getStatus());
        assertEquals("家里平板", json(renamed).get("name").asText());

        // 撤销另一台设备：其令牌立即 401
        MvcResult revoked = delete("/v1/devices/" + deviceB, tokenA);
        assertEquals(200, revoked.getResponse().getStatus());
        assertTrue(json(revoked).get("revoked").asBoolean());
        assertFalse(json(revoked).get("current").asBoolean());
        assertEquals(401, get("/v1/me", tokenB).getResponse().getStatus());
        assertEquals(1, json(get("/v1/devices", tokenA)).get("items").size());
    }

    @Test
    void 撤销当前设备_自身令牌同步失效() throws Exception {
        String phone = "13800000210";
        String deviceA = UUID.randomUUID().toString();
        String tokenA = login(phone, deviceA);
        MvcResult revoked = delete("/v1/devices/" + deviceA, tokenA);
        assertEquals(200, revoked.getResponse().getStatus());
        assertTrue(json(revoked).get("current").asBoolean());
        assertEquals(401, get("/v1/me", tokenA).getResponse().getStatus());
    }

    @Test
    void 设备入参校验() throws Exception {
        String token = login("13800000220");
        // 非法标识
        MvcResult badId = post("/v1/devices", Map.of("id", "x", "name", "n"), token);
        assertEquals(400, badId.getResponse().getStatus());
        assertEquals("设备标识或名称无效", json(badId).get("error").asText());
        // 空名称与超长名称
        assertEquals(400, post("/v1/devices", Map.of("id", UUID.randomUUID().toString(), "name", "  "), token)
                .getResponse().getStatus());
        assertEquals(400, post("/v1/devices", Map.of("id", UUID.randomUUID().toString(), "name", "长".repeat(81)), token)
                .getResponse().getStatus());
        // 不存在的设备
        MvcResult missing = patch("/v1/devices/" + UUID.randomUUID(), Map.of("name", "x"), token);
        assertEquals(404, missing.getResponse().getStatus());
        assertEquals("设备会话不存在", json(missing).get("error").asText());
        assertEquals(404, delete("/v1/devices/" + UUID.randomUUID(), token).getResponse().getStatus());
        // 非法路径形态
        MvcResult malformed = patch("/v1/devices/xyz", Map.of("name", "x"), token);
        assertEquals(404, malformed.getResponse().getStatus());
        assertEquals("设备接口不存在", json(malformed).get("error").asText());
        // 改名入参
        String device = UUID.randomUUID().toString();
        tick(61000);
        String other = login("13800000220", device);
        assertEquals(400, patch("/v1/devices/" + device, Map.of("name", ""), other).getResponse().getStatus());
        MvcResult badName = patch("/v1/devices/" + device, Map.of("name", "长".repeat(81)), other);
        assertEquals(400, badName.getResponse().getStatus());
        assertEquals("设备名称无效", json(badName).get("error").asText());
    }

    @Test
    void 方法覆盖_POST头还原PATCH() throws Exception {
        String phone = "13800000230";
        String device = UUID.randomUUID().toString();
        String token = login(phone, device);
        // 移动端以 POST + X-Seal-Method-Override 完成改名
        MvcResult result = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/v1/devices/" + device)
                .header("Authorization", "Bearer " + token)
                .header("X-Seal-Method-Override", "PATCH")
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("name", "覆盖改名")))).andReturn();
        assertEquals(200, result.getResponse().getStatus());
        assertEquals("覆盖改名", json(result).get("name").asText());
    }

    private static JsonNode findById(JsonNode items, String id) {
        for (JsonNode item : items) {
            if (id.equals(item.get("id").asText())) {
                return item;
            }
        }
        throw new AssertionError("设备不存在：" + id);
    }
}
